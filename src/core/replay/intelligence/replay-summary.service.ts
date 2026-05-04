import type { TraceEvent } from "../../events/event.types.js";
import type { DiffSnapshot } from "../../repository/repository.types.js";
import type { Session } from "../../session/session.types.js";
import type { Chapter, StoryReplaySummary } from "../aggregation/aggregation.types.js";
import { IntentDetectorService } from "./intent-detector.service.js";

export class ReplaySummaryService {
  private intentDetector = new IntentDetectorService();

  computeSummary(
    session: Session,
    events: TraceEvent[],
    diffs: DiffSnapshot[],
    chapters: Chapter[],
  ): StoryReplaySummary {
    const allFiles = new Set<string>();
    let totalIns = 0;
    let totalDel = 0;
    let commits = 0;

    for (const ch of chapters) {
      for (const b of ch.blocks) {
        for (const f of b.filesCreated) allFiles.add(f);
        for (const f of b.filesModified) allFiles.add(f);
        for (const f of b.filesDeleted) allFiles.add(f);
        totalIns += b.insertions;
        totalDel += b.deletions;
        commits += b.commits.length;
      }
    }

    const fileCount = new Map<string, number>();
    for (const d of diffs) {
      for (const f of d.filesChanged) {
        fileCount.set(f, (fileCount.get(f) || 0) + d.insertions + d.deletions);
      }
    }
    const largestFile = fileCount.size > 0
      ? [...fileCount.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      : null;

    const commitMessages = events
      .filter((e) => e.type === "COMMIT_CREATED")
      .map((e) => (e.payload.message as string) || "");
    const allFilesList = [...allFiles];
    const primaryFocus = this.intentDetector.detectIntent(
      allFilesList,
      session.gitBranch,
      commitMessages,
    );

    return {
      sessionName: session.name,
      sessionId: session.id,
      branch: session.gitBranch,
      repoPath: session.repoPath,
      duration: this.computeDuration(events),
      chapters: chapters.length,
      commits,
      filesChanged: allFiles.size,
      insertions: totalIns,
      deletions: totalDel,
      primaryFocus,
      largestFile,
    };
  }

  private computeDuration(events: TraceEvent[]): string {
    if (events.length < 2) return "< 1s";
    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const ms = sorted[sorted.length - 1]!.createdAt.getTime() - sorted[0]!.createdAt.getTime();
    if (ms < 1000) return "< 1s";
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    if (ms < 3_600_000) return s > 0 ? `${m}m ${s}s` : `${m}m`;
    const h = Math.floor(ms / 3_600_000);
    const rm = Math.round((ms % 3_600_000) / 60_000);
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  }
}
