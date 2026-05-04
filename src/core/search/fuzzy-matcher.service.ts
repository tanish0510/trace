import { ENGINEERING_STEMS, STOP_WORDS } from "./search.constants.js";

export class FuzzyMatcherService {
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s\-_./]/g, " ")
      .split(/[\s\-_./]+/)
      .filter((w) => w.length > 1)
      .filter((w) => !STOP_WORDS.has(w));
  }

  stem(tokens: string[]): string[] {
    const stemmed = new Set<string>();
    for (const token of tokens) {
      stemmed.add(token);

      for (const [stem, variants] of Object.entries(ENGINEERING_STEMS)) {
        if (token === stem || variants.includes(token)) {
          stemmed.add(stem);
          for (const v of variants) stemmed.add(v);
        }
      }

      if (token.endsWith("ing")) stemmed.add(token.slice(0, -3));
      if (token.endsWith("tion")) stemmed.add(token.slice(0, -4));
      if (token.endsWith("ment")) stemmed.add(token.slice(0, -4));
      if (token.endsWith("ed") && token.length > 4) stemmed.add(token.slice(0, -2));
      if (token.endsWith("er") && token.length > 4) stemmed.add(token.slice(0, -2));
      if (token.endsWith("ly") && token.length > 4) stemmed.add(token.slice(0, -2));
      if (token.endsWith("es") && token.length > 4) stemmed.add(token.slice(0, -2));
      if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) stemmed.add(token.slice(0, -1));
    }
    return [...stemmed];
  }

  exactPhraseScore(query: string, text: string): number {
    const q = query.toLowerCase().trim();
    const t = text.toLowerCase();
    if (t.includes(q)) return 1.0;

    const qTokens = q.split(/\s+/);
    if (qTokens.length >= 2) {
      let found = 0;
      for (let i = 0; i <= qTokens.length - 2; i++) {
        const bigram = `${qTokens[i]} ${qTokens[i + 1]}`;
        if (t.includes(bigram)) found++;
      }
      if (qTokens.length > 1) return found / (qTokens.length - 1) * 0.7;
    }

    return 0;
  }

  tokenOverlapScore(queryTokens: string[], textTokens: string[]): number {
    if (queryTokens.length === 0 || textTokens.length === 0) return 0;

    const textSet = new Set(textTokens);
    let matches = 0;
    for (const qt of queryTokens) {
      if (textSet.has(qt)) {
        matches++;
        continue;
      }
      let partialFound = false;
      for (const tt of textTokens) {
        if (tt.startsWith(qt) || qt.startsWith(tt)) {
          matches += 0.5;
          partialFound = true;
          break;
        }
      }
      if (!partialFound) {
        for (const tt of textTokens) {
          if (tt.includes(qt) && qt.length >= 3) {
            matches += 0.3;
            break;
          }
        }
      }
    }
    return Math.min(1, matches / queryTokens.length);
  }

  fuzzyScore(query: string, text: string): number {
    const q = query.toLowerCase();
    const t = text.toLowerCase();

    if (t === q) return 1.0;
    if (t.includes(q)) return 0.9;

    const dist = this.levenshtein(q, t.slice(0, Math.min(t.length, q.length + 10)));
    const maxLen = Math.max(q.length, t.length);
    if (maxLen === 0) return 0;

    const similarity = 1 - dist / maxLen;
    return Math.max(0, similarity);
  }

  stemOverlapScore(queryStems: string[], textTokens: string[]): number {
    if (queryStems.length === 0 || textTokens.length === 0) return 0;

    const textSet = new Set(textTokens);
    const textStems = new Set(this.stem(textTokens));

    let matches = 0;
    for (const qs of queryStems) {
      if (textSet.has(qs) || textStems.has(qs)) {
        matches++;
      }
    }
    return Math.min(1, matches / queryStems.length);
  }

  private levenshtein(a: string, b: string): number {
    if (a.length > 50 || b.length > 50) {
      return a === b ? 0 : Math.max(a.length, b.length);
    }

    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0]![j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j - 1]! + cost,
        );
      }
    }
    return matrix[a.length]![b.length]!;
  }
}
