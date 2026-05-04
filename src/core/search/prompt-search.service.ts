import { SearchEngineService } from "./search-engine.service.js";
import { SearchRendererService } from "./search-renderer.service.js";
import { RetrievalService } from "./retrieval.service.js";
import type { SearchResult, RecentActivity } from "./search.types.js";

export class PromptSearchService {
  private engine = new SearchEngineService();
  private renderer = new SearchRendererService();
  private retrieval = new RetrievalService();

  find(
    query: string,
    currentRepoPath: string | null = null,
    currentBranch: string | null = null,
  ): SearchResult[] {
    return this.engine.find(query, currentRepoPath, currentBranch);
  }

  findAndRender(
    query: string,
    currentRepoPath: string | null = null,
    currentBranch: string | null = null,
  ): void {
    const results = this.find(query, currentRepoPath, currentBranch);
    this.renderer.renderSearchResults(results, query);
  }

  recent(limit = 10): RecentActivity[] {
    return this.retrieval.getRecentActivity(limit);
  }

  recentAndRender(limit = 10): void {
    const activities = this.recent(limit);
    this.renderer.renderRecentActivity(activities);
  }
}
