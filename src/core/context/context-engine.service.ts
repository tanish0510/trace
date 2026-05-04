import fs from "node:fs";
import path from "node:path";
import { SessionService } from "../session/session.service.js";
import { EventService } from "../events/event.service.js";
import { SnapshotService } from "../replay/snapshot.service.js";
import { PromptRepository } from "../prompts/prompt-repository.js";
import { NoiseFilterService } from "../replay/intelligence/noise-filter.service.js";
import { ActivityAggregatorService } from "../replay/aggregation/activity-aggregator.service.js";
import { EngineeringBlockBuilderService } from "../replay/aggregation/engineering-block-builder.service.js";
import { ChapterBuilderService } from "../replay/aggregation/chapter-builder.service.js";
import { RepositoryContextService } from "./repository-context.service.js";
import { ContextPackBuilderService } from "./context-pack-builder.service.js";
import { ContextRendererService } from "./context-renderer.service.js";
import type { ContextConfig, ContextPack, RepositoryIdentity } from "./context.types.js";
import { MAX_RECENT_SESSIONS, CONTEXT_RECENCY_WINDOW_DAYS } from "./context.constants.js";

export class ContextEngineService {
  private sessionService = new SessionService();
  private eventService = new EventService();
  private snapshotService = new SnapshotService();
  private promptRepo = new PromptRepository();
  private repoContext = new RepositoryContextService();
  private packBuilder = new ContextPackBuilderService();
  private renderer = new ContextRendererService();

  async generate(config: ContextConfig): Promise<ContextPack> {
    const identity = this.repoContext.identify(config.repoPath);

    const allSessions = await this.sessionService.listSessions();
    const cutoff = Date.now() - CONTEXT_RECENCY_WINDOW_DAYS * 86_400_000;
    const repoSessions = allSessions
      .filter((s) => s.repoPath === config.repoPath || s.repoPath === identity.path)
      .filter((s) => s.createdAt.getTime() > cutoff)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, MAX_RECENT_SESSIONS);

    const allEvents = (await Promise.all(
      repoSessions.map((s) => this.eventService.getSessionEvents(s.id)),
    )).flat();

    const allDiffs = (await Promise.all(
      repoSessions.map((s) => this.snapshotService.getSessionDiffs(s.id)),
    )).flat();

    const allPrompts = repoSessions.flatMap((s) => this.promptRepo.getBySession(s.id));

    const noiseFilter = new NoiseFilterService();
    const filtered = noiseFilter.filterEvents(allEvents);

    const aggregator = new ActivityAggregatorService();
    const windows = aggregator.aggregate(filtered, allDiffs);

    const branch = config.branch;
    const blockBuilder = new EngineeringBlockBuilderService();
    const blocks = blockBuilder.buildBlocks(windows, branch);

    const chapterBuilder = new ChapterBuilderService();
    const chapters = chapterBuilder.buildChapters(blocks);

    const pack = this.packBuilder.build(
      config,
      repoSessions,
      allEvents,
      allDiffs,
      allPrompts,
      chapters,
    );

    this.persist(identity, pack);
    return pack;
  }

  async display(config: ContextConfig): Promise<void> {
    const pack = await this.generate(config);
    this.renderer.renderCli(pack);
  }

  getMarkdown(pack: ContextPack): string {
    return this.renderer.renderMarkdown(pack);
  }

  private persist(identity: RepositoryIdentity, pack: ContextPack): void {
    const repoDir = this.repoContext.ensureRepoDir(identity);
    const contextDir = path.join(repoDir, "context");

    const filename = pack.focus
      ? `${pack.focus.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`
      : `${pack.mode}.md`;

    fs.writeFileSync(
      path.join(contextDir, filename),
      this.renderer.renderMarkdown(pack),
      "utf-8",
    );
  }
}
