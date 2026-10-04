const { findDuplicate, extractKeywords, priorityForCount, locationScore } = require('../src/services/duplicateDetector');
const { computeTrustScore } = require('../src/services/trust');
const { nextWalletStatus } = require('../src/services/karma');

const ticket = (o) => ({ _id: 'T1', status: 'open', category: 'network', building: 'SJT', room: '401', ...o, keywords: extractKeywords(o.title || 'WiFi not working', o.description || 'router down') });

describe('Duplicate Detection Engine', () => {
  test('reworded report in same room is merged', () => {
    const r = findDuplicate({ category: 'network', building: 'sjt', room: '401', title: 'Wi-Fi is down', description: 'internet not connecting' }, [ticket({})]);
    expect(r.match).not.toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(0.6);
  });

  test('short confirmation in the same room merges even into a ticket with many keywords', () => {
    const grown = ticket({ title: 'WiFi router not working', description: 'No internet in the study room since morning, connection drops, page timeout' });
    const r = findDuplicate({ category: 'network', building: 'SJT', room: '401', title: 'No internet in SJT 401', description: 'wifi router not working' }, [grown]);
    expect(r.match).not.toBeNull();
    expect(r.keywords).not.toContain('sjt'); // location words are not evidence
  });

  test('same room, unrelated network fault stays a new ticket', () => {
    const r = findDuplicate({ category: 'network', building: 'SJT', room: '401', title: 'LAN port damaged', description: 'ethernet socket broken' }, [ticket({})]);
    expect(r.match).toBeNull();
  });

  test('different room needs a near-identical description to merge', () => {
    // Same building, identical fault description: likely one shared fault (e.g. a floor router).
    const same = findDuplicate({ category: 'network', building: 'SJT', room: '405', title: 'WiFi not working', description: 'router down' }, [ticket({})]);
    expect(same.match).not.toBeNull();
    // Same building, only partly similar: a separate repair. Containment does NOT apply across rooms.
    const partial = findDuplicate({ category: 'network', building: 'SJT', room: '405', title: 'WiFi slow', description: 'speed drops in the evening' }, [ticket({})]);
    expect(partial.match).toBeNull();
  });

  test('different category is never a duplicate', () => {
    const r = findDuplicate({ category: 'electrical', building: 'SJT', room: '401', title: 'WiFi not working' }, [ticket({})]);
    expect(r.match).toBeNull();
  });

  test('different building is never a duplicate', () => {
    const r = findDuplicate({ category: 'network', building: 'TT', room: '401', title: 'WiFi not working router down' }, [ticket({})]);
    expect(r.match).toBeNull();
  });

  test('different room with weak text overlap is a new ticket', () => {
    const r = findDuplicate({ category: 'network', building: 'SJT', room: '405', title: 'slow wifi' }, [ticket({})]);
    expect(r.match).toBeNull();
  });

  test('resolved tickets are not reused', () => {
    const r = findDuplicate({ category: 'network', building: 'SJT', room: '401', title: 'WiFi not working' }, [ticket({ status: 'resolved' })]);
    expect(r.match).toBeNull();
  });

  test('picks the best of several candidates', () => {
    const a = ticket({ _id: 'A', title: 'LAN port damaged', description: 'ethernet socket broken' });
    const b = ticket({ _id: 'B' });
    const r = findDuplicate({ category: 'network', building: 'SJT', room: '401', title: 'wifi router down again' }, [a, b]);
    expect(r.match._id).toBe('B');
  });

  test('synonyms and stemming fold together', () => {
    expect(extractKeywords('Taps leaking')).toEqual(expect.arrayContaining(['tap', 'leak']));
    expect(extractKeywords('Air conditioner')).toContain('aircon');
  });

  test('location scoring', () => {
    expect(locationScore({ building: 'SJT', room: '401' }, { building: 'sjt', room: '401' })).toBe(1);
    expect(locationScore({ building: 'SJT', room: '' }, { building: 'SJT', room: '401' })).toBe(0.8);
    expect(locationScore({ building: 'SJT', room: '402' }, { building: 'SJT', room: '401' })).toBe(0.4);
    expect(locationScore({ building: 'TT' }, { building: 'SJT' })).toBe(0);
  });

  test('priority escalates with report count', () => {
    expect(priorityForCount(1)).toBe('low');
    expect(priorityForCount(2)).toBe('medium');
    expect(priorityForCount(4)).toBe('high');
    expect(priorityForCount(7)).toBe('critical');
  });
});

describe('Trust & Rating algorithm', () => {
  test('new user starts neutral', () => {
    expect(computeTrustScore({})).toBe(50);
  });
  test('good ratings and punctual returns raise trust', () => {
    expect(computeTrustScore({ ratingSum: 25, ratingCount: 5, onTimeReturns: 5 })).toBeGreaterThan(70);
  });
  test('bad ratings and late returns lower trust', () => {
    expect(computeTrustScore({ ratingSum: 5, ratingCount: 5, lateReturns: 5 })).toBeLessThan(35);
  });
  test('score stays within 0-100', () => {
    const s = computeTrustScore({ ratingSum: 500, ratingCount: 100, onTimeReturns: 100 });
    expect(s).toBeLessThanOrEqual(100);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

describe('Karma wallet state machine', () => {
  test('violation with positive balance -> penalty_applied', () => {
    expect(nextWalletStatus('active', 80, -20)).toBe('penalty_applied');
  });
  test('balance <= 0 -> restricted', () => {
    expect(nextWalletStatus('penalty_applied', 0, -20)).toBe('restricted');
    expect(nextWalletStatus('active', -5, -20)).toBe('restricted');
  });
  test('earning back above zero -> active', () => {
    expect(nextWalletStatus('restricted', 5, 10)).toBe('active');
    expect(nextWalletStatus('penalty_applied', 50, 3)).toBe('active');
  });
  test('earning but still <= 0 stays restricted', () => {
    expect(nextWalletStatus('restricted', -3, 2)).toBe('restricted');
  });
});
