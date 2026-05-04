import type { TraceEvent } from "../events/event.types.js";
import type { DiffSnapshot } from "../repository/repository.types.js";
import type { Session } from "../session/session.types.js";
import type { ReplayConfig, ReplaySummary, TimelineEntry } from "./replay.types.js";
import { TimelineBuilderService } from "./timeline-builder.service.js";
import { SnapshotService } from "./snapshot.service.js";
import { PlaybackService } from "./playback.service.js";

export class ReplayEngineService {
  private timelineBuilder = new TimelineBuilderService();
  private snapshotService = new SnapshotService();
  private playback: PlaybackService;
  private config: ReplayConfig;

  constructor(config: ReplayConfig) {
    this.config = config;
    this.playback = new PlaybackService(config.speed);
  }

  async execute(
    session: Session,
    events: TraceEvent[],
    diffs: DiffSnapshot[],
  ): Promise<void> {
    const summary = this.buildSummary(session, events, diffs);
    await this.playback.renderSummary(summary);

    const legacyMode = this.config.mode as "timeline" | "diff" | "commits";
    const entries = this.timelineBuilder.buildForMode(
      events,
      diffs,
      legacyMode,
    );

    if (entries.length === 0) {
      return;
    }

    const diffMap = new Map<string, DiffSnapshot>();
    for (const d of diffs) {
      diffMap.set(d.id, d);
    }

    for (const entry of entries) {
      await this.playback.renderEntry(entry);

      if (this.config.showPatches && entry.kind === "diff") {
        const matchingDiff = this.findDiffForEntry(entry, diffs);
        if (matchingDiff) {
          const patchLines = this.snapshotService.formatPatchContent(matchingDiff);
          await this.playback.renderPatch(matchingDiff, patchLines);
        }
      }
    }

    await this.playback.renderFooter(entries.length);
  }

  private buildSummary(
    session: Session,
    events: TraceEvent[],
    diffs: DiffSnapshot[],
  ): ReplaySummary {
    const diffStats = this.snapshotService.computeDiffStats(diffs);
    const fileStats = this.computeFileStats(events);

    return {
      sessionName: session.name,
      sessionId: session.id,
      branch: session.gitBranch,
      repoPath: session.repoPath,
      duration: this.computeDuration(events),
      eventCount: events.length,
      filesModified: fileStats.modified,
      filesCreated: fileStats.created,
      filesDeleted: fileStats.deleted,
      commitCount: events.filter((e) => e.type === "COMMIT_CREATED").length,
      diffCount: diffs.length,
      totalInsertions: diffStats.totalInsertions,
      totalDeletions: diffStats.totalDeletions,
    };
  }

  private computeFileStats(events: TraceEvent[]): {
    created: number;
    modified: number;
    deleted: number;
  } {
    const created = new Set<string>();
    const modified = new Set<string>();
    const deleted = new Set<string>();

    for (const e of events) {
      if (e.type !== "FILES_CHANGED") continue;
      const p = e.payload;
      for (const f of (p.created as string[]) || []) created.add(f);
      for (const f of (p.modified as string[]) || []) modified.add(f);
      for (const f of (p.deleted as string[]) || []) deleted.add(f);
    }

    return {
      created: created.size,
      modified: modified.size,
      deleted: deleted.size,
    };
  }

  private computeDuration(events: TraceEvent[]): string {
    if (events.length < 2) return "< 1s";

    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const ms = last.createdAt.getTime() - first.createdAt.getTime();

    if (ms < 1000) return "< 1s";
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;

    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    if (ms < 3_600_000) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;

    const hours = Math.floor(ms / 3_600_000);
    const remainMinutes = Math.round((ms % 3_600_000) / 60_000);
    return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
  }

  private findDiffForEntry(
    entry: TimelineEntry,
    diffs: DiffSnapshot[],
  ): DiffSnapshot | null {
    const entryTime = entry.timestamp.getTime();

    let best: DiffSnapshot | null = null;
    let bestDelta = Infinity;

    for (const d of diffs) {
      const delta = Math.abs(d.createdAt.getTime() - entryTime);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = d;
      }
    }

    return bestDelta < 5000 ? best : null;
  }
}
