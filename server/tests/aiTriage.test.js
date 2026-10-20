// Unit tests for the AI Issue Triage service. Gemini is mocked with a fake
// fetch(), so these run offline and deterministically in CI.
process.env.NODE_ENV = 'test';
const { triage, heuristicTriage, validate, maxPriority } = require('../src/services/aiTriage');

const geminiReply = (obj, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
});
const KEY = { apiKey: 'test-key', model: 'gemini-test', timeoutMs: 2000 };

describe('Rule engine (offline fallback)', () => {
  test.each([
    ['WiFi not working', 'router down in study room', 'network', 'medium'],
    ['Socket sparking', 'smells burnt near my desk', 'electrical', 'critical'],
    ['Tap leaking', 'water on the washroom floor', 'plumbing', 'high'],
    ['AC not cooling', 'room is very hot', 'hvac', 'medium'],
    ['Broken chair', 'leg is loose', 'furniture', 'medium'],
    ['Garbage not collected', 'dustbin overflowing and smell', 'cleanliness', 'medium'],
    ['Door lock broken', 'cannot lock my room', 'security', 'high'],
    ['Paint peeling', 'wall in corridor', 'other', 'low'],
  ])('"%s" -> %s / %s', (title, description, category, severity) => {
    const r = heuristicTriage({ title, description });
    expect(r.category).toBe(category);
    expect(r.severity).toBe(severity);
    expect(r.source).toBe('rules');
  });

  test('cleans up the title', () => {
    expect(heuristicTriage({ title: '  wifi   down!!! ' }).title).toBe('Wifi down');
  });
});

describe('Gemini engine', () => {
  const good = { category: 'electrical', severity: 'critical', title: 'Sparking socket at desk', summary: 'Socket sparks and smells burnt.', confidence: 0.93, reasoning: 'Sparking is a fire risk.' };

  test('uses the model answer when valid', async () => {
    let sent;
    const fetchImpl = async (url, init) => { sent = { url, init }; return geminiReply(good)(); };
    const r = await triage({ title: 'socket sparking', description: 'burnt smell' }, { ...KEY, fetchImpl });
    expect(r).toMatchObject({ category: 'electrical', severity: 'critical', source: 'gemini', model: 'gemini-test' });
    expect(sent.url).toContain('/models/gemini-test:generateContent');
    expect(sent.init.headers['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(sent.init.body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.properties.category.enum).toContain('plumbing');
  });

  test('falls back to rules on HTTP 429 (quota)', async () => {
    const r = await triage({ title: 'Tap leaking', description: '' }, { ...KEY, fetchImpl: geminiReply({}, 429) });
    expect(r.source).toBe('rules');
    expect(r.category).toBe('plumbing');
    expect(r.fallbackReason).toMatch(/429/);
  });

  test('falls back when the model invents a category', async () => {
    const r = await triage({ title: 'WiFi down', description: '' }, { ...KEY, fetchImpl: geminiReply({ ...good, category: 'internet-stuff' }) });
    expect(r.source).toBe('rules');
    expect(r.category).toBe('network');
  });

  test('falls back on network error / timeout', async () => {
    const fetchImpl = async () => { throw new Error('The operation was aborted due to timeout'); };
    const r = await triage({ title: 'Fan noisy', description: '' }, { ...KEY, fetchImpl });
    expect(r.source).toBe('rules');
  });

  test('without an API key the rule engine is used and Gemini is never called', async () => {
    const fetchImpl = jest.fn();
    const r = await triage({ title: 'Fan noisy' }, { ...KEY, apiKey: '', fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.source).toBe('rules');
  });
});

describe('Output validation + priority merge', () => {
  test('clamps confidence and rejects bad severity', () => {
    expect(validate({ category: 'other', severity: 'low', title: 'x', confidence: 7 }).confidence).toBe(1);
    expect(() => validate({ category: 'other', severity: 'apocalyptic', title: 'x' })).toThrow(/severity/);
  });
  test('priority is the higher of crowd signal and AI severity', () => {
    expect(maxPriority('low', 'critical')).toBe('critical');
    expect(maxPriority('high', 'medium')).toBe('high');
  });
});
