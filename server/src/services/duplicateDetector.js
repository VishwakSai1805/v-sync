// Duplicate Detection Engine (Level-2 DFD process 3.2).
//
// Pure functions, no DB access, so the clustering logic is unit-testable.
// A new report is compared against open / in-progress master tickets in the
// same CATEGORY (hard filter). For each candidate we compute:
//
//   locationScore  1.0 same building + same room
//                  0.8 same building, one side has no room given
//                  0.4 same building, different room
//                  0.0 different building (candidate dropped)
//   textScore      Jaccard similarity of normalised keyword sets (title + description,
//                  location words removed: location is scored separately). In the
//                  SAME room, a report whose keywords are all already on the ticket
//                  (containment) also counts: a short "wifi down here too" confirms a
//                  known problem without repeating every word. Without this, a ticket
//                  whose keyword set grows with each merged report would make later
//                  short reports look less and less similar.
//
//   score = 0.5 * locationScore + 0.5 * textScore
//
// The best candidate is a duplicate when score >= THRESHOLD. Same building +
// same room is already 0.5, so it needs only a little textual overlap; a
// different room needs strong textual overlap.

const THRESHOLD = 0.6;

const STOPWORDS = new Set(
  (
    'a an the and or but is are was were be been being am i we you he she it they this that these those ' +
    'of in on at to for from by with without into onto over under near not no yes very too so just also ' +
    'there here have has had do does did done can could should would will shall may might must ' +
    'my our your their its me us him her them please again still since ' +
    'room block floor near issue problem broken working work not-working'
  ).split(/\s+/)
);

// Light synonym folding so "wifi" / "wi-fi" / "internet" cluster together.
const SYNONYMS = {
  'wi-fi': 'wifi', wireless: 'wifi', internet: 'wifi', router: 'wifi', network: 'wifi',
  ac: 'aircon', 'air-conditioner': 'aircon', airconditioner: 'aircon', aircon: 'aircon', cooling: 'aircon',
  tap: 'tap', faucet: 'tap', pipe: 'pipe', pipes: 'pipe', leaking: 'leak', leakage: 'leak', leaks: 'leak',
  light: 'light', lights: 'light', bulb: 'light', tubelight: 'light', lamp: 'light',
  fan: 'fan', fans: 'fan', socket: 'socket', plug: 'socket', switch: 'switch', switches: 'switch',
  toilet: 'washroom', bathroom: 'washroom', restroom: 'washroom', washroom: 'washroom',
  chair: 'chair', chairs: 'chair', desk: 'desk', desks: 'desk', bench: 'bench', benches: 'bench',
  door: 'door', doors: 'door', lock: 'lock', locks: 'lock',
};

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/wi-fi/g, 'wifi')
    .replace(/air[\s-]?condition(er|ing)?/g, 'aircon')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stem(word) {
  // Very small stemmer — enough for "leaking"/"leaks", "flickering"/"flickers".
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function extractKeywords(...texts) {
  const words = normalizeText(texts.join(' '))
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  const out = new Set();
  for (const w of words) {
    const canonical = SYNONYMS[w] || SYNONYMS[stem(w)] || stem(w);
    if (!STOPWORDS.has(canonical)) out.add(canonical);
  }
  return [...out];
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

const normLoc = (s) => normalizeText(s).replace(/[\s-]/g, '');

function locationScore(a, b) {
  if (!a.building || !b.building || normLoc(a.building) !== normLoc(b.building)) return 0;
  const ra = normLoc(a.room);
  const rb = normLoc(b.room);
  if (ra && rb) return ra === rb ? 1 : 0.4;
  return 0.8;
}

/**
 * @param {object} report    { title, description, category, building, room }
 * @param {Array}  candidates master tickets: { _id, category, building, room, keywords, status }
 * @returns {{ match: object|null, score: number, keywords: string[], scored: Array }}
 */
// Share of A's words that also appear in B.
function containment(a, b) {
  const A = new Set(a);
  if (!A.size) return 0;
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / A.size;
}

// Building / room tokens ("sjt", "401") are not evidence of WHAT is broken.
function withoutLocation(keywords, building, room) {
  const loc = new Set(extractKeywords(building || '', room || ''));
  return keywords.filter((k) => !loc.has(k));
}

function findDuplicate(report, candidates, threshold = THRESHOLD) {
  const keywords = withoutLocation(extractKeywords(report.title, report.description), report.building, report.room);
  const scored = [];
  for (const c of candidates) {
    if (c.category !== report.category) continue;
    if (c.status && !['open', 'in_progress'].includes(c.status)) continue;
    const loc = locationScore(report, c);
    if (loc === 0) continue;
    const ticketWords = withoutLocation(
      c.keywords && c.keywords.length ? c.keywords : extractKeywords(c.title, c.description),
      c.building,
      c.room
    );
    const sim = jaccard(keywords, ticketWords);
    const text = loc === 1 ? Math.max(sim, containment(keywords, ticketWords)) : sim;
    const score = Number((0.5 * loc + 0.5 * text).toFixed(3));
    scored.push({ candidate: c, score, loc, text: Number(text.toFixed(3)) });
  }
  scored.sort((x, y) => y.score - x.score);
  const best = scored[0];
  if (best && best.score >= threshold) return { match: best.candidate, score: best.score, keywords, scored };
  return { match: null, score: best ? best.score : 0, keywords, scored };
}

// Priority escalates with the number of students reporting the same problem.
function priorityForCount(count) {
  if (count >= 7) return 'critical';
  if (count >= 4) return 'high';
  if (count >= 2) return 'medium';
  return 'low';
}

module.exports = { THRESHOLD, extractKeywords, jaccard, containment, locationScore, findDuplicate, priorityForCount, normalizeText };
