import { EventService } from "../events/event.service.js";
import { SessionService } from "../session/session.service.js";
import { SnapshotService } from "./snapshot.service.js";
import { ReplayEngineService } from "./replay-engine.service.js";
import { NoiseFilterService } from "./intelligence/noise-filter.service.js";
import { ActivityAggregatorService } from "./aggregation/activity-aggregator.service.js";
import { EngineeringBlockBuilderService } from "./aggregation/engineering-block-builder.service.js";
import { ChapterBuilderService } from "./aggregation/chapter-builder.service.js";
import { FocusAnalyzerService } from "./intelligence/focus-analyzer.service.js";
import { ReplaySummaryService } from "./intelligence/replay-summary.service.js";
import { ReplayRendererService } from "./replay-renderer.service.js";
import { PromptRepository } from "../prompts/prompt-repository.js";
import type { ReplayConfig } from "./replay.types.js";

export class ReplayService {
  private eventService = new EventService();
  private sessionService = new SessionService();
  private snapshotService = new SnapshotService();

  async replay(config: ReplayConfig): Promise<void> {
    const session = await this.sessionService.getSession(config.sessionId);
    if (!session) {
      throw new Error(`Session "${config.sessionId}" not found.`);
    }

    const rawEvents = await this.eventService.getSessionEvents(config.sessionId);
    if (rawEvents.length === 0) {
      throw new Error(`No events found for session "${config.sessionId}".`);
    }

    const diffs = await this.snapshotService.getSessionDiffs(config.sessionId);

    if (config.mode === "timeline" || config.mode === "diff" || config.mode === "commits") {
      const engine = new ReplayEngineService(config);
      return engine.execute(session, rawEvents, diffs);
    }

    const noiseFilter = new NoiseFilterService();
    const events = noiseFilter.filterEvents(rawEvents);

    const aggregator = new ActivityAggregatorService();
    const windows = aggregator.aggregate(events, diffs);

    const blockBuilder = new EngineeringBlockBuilderService();
    let blocks = blockBuilder.buildBlocks(windows, session.gitBranch);

    const chapterBuilder = new ChapterBuilderService();
    let chapters = chapterBuilder.buildChapters(blocks);

    if (config.focus) {
      const focusAnalyzer = new FocusAnalyzerService();
      chapters = focusAnalyzer.filterChapters(chapters, config.focus);
    }

    if (config.promptId) {
      const promptRepo = new PromptRepository();
      const correlations = promptRepo.getCorrelations(config.promptId);
      const linkedFiles = new Set(correlations.filter((c) => c.filePath).map((c) => c.filePath!));
      const linkedCommits = new Set(correlations.filter((c) => c.commitHash).map((c) => c.commitHash!));

      chapters = chapters
        .map((ch) => ({
          ...ch,
          blocks: ch.blocks.filter((b) => {
            const allFiles = [...b.filesCreated, ...b.filesModified, ...b.filesDeleted];
            if (allFiles.some((f) => linkedFiles.has(f))) return true;
            if (b.commits.some((c) => linkedCommits.has(c.hash))) return true;
            return false;
          }),
        }))
        .filter((ch) => ch.blocks.length > 0);
    }

    const promptRepo = config.promptId ? null : new PromptRepository();
    const sessionPrompts = promptRepo ? promptRepo.getBySession(config.sessionId) : [];

    const summaryService = new ReplaySummaryService();
    const summary = summaryService.computeSummary(session, events, diffs, chapters);

    const renderer = new ReplayRendererService(config.speed);
    await renderer.renderSummaryCard(summary);

    let totalBlocks = 0;

    for (const chapter of chapters) {
      await renderer.renderChapter(chapter, config.showPatches, diffs, sessionPrompts);
      totalBlocks += chapter.blocks.length;
    }

    await renderer.renderFooter(chapters.length, totalBlocks);
  }
}
