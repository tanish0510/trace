import { FuzzyMatcherService } from "./fuzzy-matcher.service.js";
import { SearchIndexService } from "./search-index.service.js";
import { RelevanceScorerService } from "./relevance-scorer.service.js";
import { RetrievalService } from "./retrieval.service.js";
import { MAX_RESULTS, MIN_SCORE_THRESHOLD } from "./search.constants.js";
import type { SearchQuery, SearchResult, IndexEntry } from "./search.types.js";
import type { SessionMeta } from "./relevance-scorer.service.js";

export class SearchEngineService {
  private fuzzy = new FuzzyMatcherService();
  private index = new SearchIndexService();
  private scorer = new RelevanceScorerService();
  private retrieval = new RetrievalService();

  find(
    rawQuery: string,
    currentRepoPath: string | null,
    currentBranch: string | null,
  ): SearchResult[] {
    const query = this.parseQuery(rawQuery, currentRepoPath, currentBranch);

    this.index.ensureFTS();
    this.index.rebuild();

    const ftsEntries = this.index.search(rawQuery, 100);
    const directEntries = this.retrieval.directSearch(rawQuery);

    const merged = this.dedup([...ftsEntries, ...directEntries]);
    const metaMap = this.retrieval.getSessionMeta();

    const scored = this.scorer.rankAll(merged, query, metaMap);

    const sessionBest = new Map<string, { score: number; entry: IndexEntry }>();
    for (const { entry, score } of scored) {
      if (score < MIN_SCORE_THRESHOLD) continue;

      const existing = sessionBest.get(entry.sessionId);
      if (!existing || score > existing.score) {
        sessionBest.set(entry.sessionId, { score, entry });
      }
    }

    const results: SearchResult[] = [];

    for (const [sessionId, { score, entry }] of sessionBest) {
      const meta = metaMap.get(sessionId);
      if (!meta) continue;

      results.push({
        sessionId,
        sessionName: meta.sessionName,
        repoName: meta.repoName,
        repoPath: meta.repoPath,
        branch: meta.branch,
        status: meta.status,
        score,
        matchedSource: entry.source,
        matchedText: entry.text,
        promptCount: meta.promptCount,
        commitCount: meta.commitCount,
        fileCount: meta.fileCount,
        lastActive: new Date(
          typeof meta.createdAt === "number" && meta.createdAt < 1e12
            ? meta.createdAt * 1000
            : meta.createdAt,
        ),
        claudeSessionId: meta.claudeSessionId,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, MAX_RESULTS);
  }

  private parseQuery(
    raw: string,
    currentRepoPath: string | null,
    currentBranch: string | null,
  ): SearchQuery {
    const tokens = this.fuzzy.tokenize(raw);
    const stems = this.fuzzy.stem(tokens);

    return { raw, tokens, stems, currentRepoPath, currentBranch };
  }

  private dedup(entries: IndexEntry[]): IndexEntry[] {
    const seen = new Set<string>();
    const result: IndexEntry[] = [];

    for (const e of entries) {
      const key = `${e.sessionId}:${e.source}:${e.text.slice(0, 100)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(e);
    }

    return result;
  }
}
