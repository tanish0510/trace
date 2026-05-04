import { FuzzyMatcherService } from "./fuzzy-matcher.service.js";
import {
  SCORE_WEIGHTS,
  SOURCE_BOOST,
  RECENCY_DECAY_HOURS,
  CURRENT_REPO_BOOST,
  CURRENT_BRANCH_BOOST,
} from "./search.constants.js";
import type { SearchQuery, IndexEntry } from "./search.types.js";

interface ScoredEntry {
  entry: IndexEntry;
  score: number;
}

export class RelevanceScorerService {
  private fuzzy = new FuzzyMatcherService();

  score(entry: IndexEntry, query: SearchQuery, sessionMeta: SessionMeta): number {
    const textTokens = this.fuzzy.tokenize(entry.text);

    const exactPhrase = this.fuzzy.exactPhraseScore(query.raw, entry.text);
    const tokenOverlap = this.fuzzy.tokenOverlapScore(query.tokens, textTokens);
    const stemOverlap = this.fuzzy.stemOverlapScore(query.stems, textTokens);
    const fuzzy = Math.max(
      ...query.tokens.map((qt) =>
        Math.max(...textTokens.map((tt) => this.fuzzy.fuzzyScore(qt, tt)), 0),
      ),
      0,
    );

    const textScore =
      SCORE_WEIGHTS.EXACT_PHRASE * exactPhrase +
      SCORE_WEIGHTS.TOKEN_OVERLAP * Math.max(tokenOverlap, stemOverlap) +
      SCORE_WEIGHTS.FUZZY_MATCH * fuzzy;

    const bestTextSignal = Math.max(exactPhrase, tokenOverlap, stemOverlap);
    if (bestTextSignal < 0.1 && fuzzy < 0.7) return 0;

    const recency = this.recencyScore(entry.timestamp);
    const repoContext = this.repoContextScore(sessionMeta, query);
    const importance = this.importanceScore(sessionMeta);

    let total =
      textScore +
      SCORE_WEIGHTS.RECENCY * recency +
      SCORE_WEIGHTS.REPO_CONTEXT * repoContext +
      SCORE_WEIGHTS.ENGINEERING_IMPORTANCE * importance;

    total *= SOURCE_BOOST[entry.source] ?? 1.0;

    if (query.currentRepoPath && sessionMeta.repoPath === query.currentRepoPath) {
      total *= CURRENT_REPO_BOOST;
    }
    if (
      query.currentBranch &&
      query.currentBranch !== "unknown" &&
      sessionMeta.branch === query.currentBranch
    ) {
      total *= CURRENT_BRANCH_BOOST;
    }

    return Math.min(1, Math.max(0, total));
  }

  rankAll(entries: IndexEntry[], query: SearchQuery, metaMap: Map<string, SessionMeta>): ScoredEntry[] {
    const scored: ScoredEntry[] = [];

    for (const entry of entries) {
      const meta = metaMap.get(entry.sessionId);
      if (!meta) continue;

      const s = this.score(entry, query, meta);
      if (s > 0) scored.push({ entry, score: s });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  private recencyScore(timestamp: number): number {
    const now = Date.now();
    const ts = typeof timestamp === "number" && timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const hoursAgo = (now - ts) / (1000 * 60 * 60);
    if (hoursAgo <= 0) return 1;
    return Math.max(0, 1 - hoursAgo / RECENCY_DECAY_HOURS);
  }

  private repoContextScore(meta: SessionMeta, query: SearchQuery): number {
    if (!query.currentRepoPath) return 0.5;
    return meta.repoPath === query.currentRepoPath ? 1.0 : 0.2;
  }

  private importanceScore(meta: SessionMeta): number {
    let score = 0;
    if (meta.promptCount > 0) score += 0.3;
    if (meta.promptCount > 5) score += 0.2;
    if (meta.commitCount > 0) score += 0.3;
    if (meta.commitCount > 3) score += 0.1;
    if (meta.fileCount > 5) score += 0.1;
    return Math.min(1, score);
  }
}

export interface SessionMeta {
  sessionId: string;
  sessionName: string;
  repoPath: string;
  repoName: string;
  branch: string;
  status: string;
  createdAt: number;
  promptCount: number;
  commitCount: number;
  fileCount: number;
  claudeSessionId: string | null;
}
