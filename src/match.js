// Answer matching: is what the player typed the same as the clue's answer?
//
// Rules (from the build plan, "Answer matching"):
//   1. Normalize both strings: lowercase, strip accents and punctuation,
//      collapse spaces, drop a leading "what/who/… is/are/…", drop leading
//      articles (a, an, the).
//   2. Exact match against the answer or any accept[] entry -> correct.
//   3. Damerau-Levenshtein distance within 1 edit (answers ≤ 5 chars),
//      2 (≤ 10) or 3 (longer) -> correct.
//   4. Word match, unless the clue is strict: the response is a subset of
//      the answer's words (surname only: "roosevelt" for "franklin
//      roosevelt") or contains every word of the answer -> correct.
//   5. Distance ≤ 40 % of the answer's length -> borderline (the UI shows
//      both and lets the player rule). Otherwise -> wrong.
// Purely numeric answers (years, counts) only match exactly or via accept[].

const QUESTION_PREFIX = /^(what|who|whom|where|when|which|how)\s*(is|are|was|were|s|re|d|did|does|do)?\s+/;
const ARTICLE_PREFIX = /^(a|an|the)\s+/;

/** Plain comparison form of a response or answer. */
export function normalize(text) {
  let s = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")   // punctuation -> space ("what's" -> "what s")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(QUESTION_PREFIX, "");
  s = s.replace(ARTICLE_PREFIX, "");
  return s.trim();
}

/** True when the raw response is phrased as a question ("What is…", "Who's…"). */
export function isPhrasedAsQuestion(text) {
  return /^\s*(what|who|whom|where|when|which|how)\b/i.test(String(text ?? ""));
}

/** Damerau-Levenshtein (optimal string alignment) edit distance. */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = [];
  for (let i = 0; i <= m; i += 1) {
    d[i] = new Array(n + 1);
    d[i][0] = i;
  }
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposition
      }
    }
  }
  return d[m][n];
}

/** How many edits a normalized answer of this length forgives. */
export function allowedEdits(length) {
  if (length <= 5) return 1;
  if (length <= 10) return 2;
  return 3;
}

const isNumeric = (s) => /^[0-9]+$/.test(s);

/**
 * Compares a typed response with a clue.
 * @param {string} response  what the player typed
 * @param {{answer: string, accept?: string[], strict?: boolean}} clue
 * @returns {{result: "correct"|"borderline"|"wrong", matched: string|null, distance: number, phrased: boolean}}
 */
export function matchAnswer(response, clue) {
  const phrased = isPhrasedAsQuestion(response);
  const given = normalize(response);
  const canonical = normalize(clue.answer);
  const candidates = [canonical, ...(clue.accept ?? []).map(normalize)].filter(Boolean);
  const strict = Boolean(clue.strict);

  if (!given) return { result: "wrong", matched: null, distance: Infinity, phrased };

  // 2. exact
  for (const candidate of candidates) {
    if (given === candidate) return { result: "correct", matched: candidate, distance: 0, phrased };
  }

  // Numbers: exact or accept[] only. "31" is not "32".
  if (isNumeric(canonical)) {
    return { result: "wrong", matched: null, distance: Infinity, phrased };
  }

  // 3. small typos
  let best = { candidate: canonical, distance: Infinity };
  for (const candidate of candidates) {
    if (isNumeric(candidate)) continue;
    const distance = editDistance(given, candidate);
    if (distance < best.distance) best = { candidate, distance };
    if (distance <= allowedEdits(candidate.length)) {
      return { result: "correct", matched: candidate, distance, phrased };
    }
  }

  // 4. word match (partial credit), not for strict clues
  if (!strict) {
    const givenWords = given.split(" ");
    for (const candidate of candidates) {
      const words = candidate.split(" ");
      const subset = givenWords.every((w) => words.includes(w)) && givenWords.some((w) => w.length >= 3);
      const superset = words.every((w) => givenWords.includes(w));
      if (subset || superset) return { result: "correct", matched: candidate, distance: best.distance, phrased };
    }
  }

  // 5. close but not close enough: let the player rule
  if (best.distance <= Math.floor(best.candidate.length * 0.4)) {
    return { result: "borderline", matched: best.candidate, distance: best.distance, phrased };
  }
  return { result: "wrong", matched: null, distance: best.distance, phrased };
}
