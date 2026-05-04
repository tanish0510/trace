import type { TraceEvent } from "../../events/event.types.js";
import type { ActivityWindow, EngineeringBlock, CommitSummary, BranchChange, ToolEvent } from "./aggregation.types.js";
import { IntentDetectorService } from "../intelligence/intent-detector.service.js";

let blockCounter = 0;

export class EngineeringBlockBuilderService {
  private intentDetector = new IntentDetectorService();

  buildBlocks(windows: ActivityWindow[], branch: string): EngineeringBlock[] {
    blockCounter = 0;
    return windows.map((w) => this.windowToBlock(w, branch));
  }

  private windowToBlock(window: ActivityWindow, branch: string): EngineeringBlock {
    const allFiles = [
      ...window.filesCreated,
      ...window.filesModified,
      ...window.filesDeleted,
    ];

    const commits = this.extractCommits(window.events);
    const branchChanges = this.extractBranchChanges(window.events);
    const toolEvents = this.extractToolEvents(window.events);

    const commitMessages = commits.map((c) => c.message);
    const intent = this.intentDetector.detectIntent(allFiles, branch, commitMessages);
    const domain = this.intentDetector.detectDomain(allFiles);
    const title = this.intentDetector.generateBlockTitle(allFiles, commitMessages, branch);

    return {
      id: `block_${++blockCounter}`,
      intent: title,
      domain,
      startTime: window.startTime,
      endTime: window.endTime,
      duration: this.formatDuration(window.startTime, window.endTime),
      filesCreated: window.filesCreated,
      filesModified: window.filesModified,
      filesDeleted: window.filesDeleted,
      insertions: window.insertions,
      deletions: window.deletions,
      commits,
      branchChanges,
      toolEvents,
    };
  }

  private extractCommits(events: TraceEvent[]): CommitSummary[] {
    return events
      .filter((e) => e.type === "COMMIT_CREATED")
      .map((e) => ({
        hash: (e.payload.hash as string) || "",
        message: (e.payload.message as string) || "",
        branch: (e.payload.branch as string) || "",
        timestamp: e.createdAt,
      }));
  }

  private extractBranchChanges(events: TraceEvent[]): BranchChange[] {
    return events
      .filter((e) => e.type === "GIT_BRANCH_CHANGED")
      .map((e) => ({
        from: (e.payload.previousBranch as string) || "",
        to: (e.payload.currentBranch as string) || "",
        timestamp: e.createdAt,
      }));
  }

  private extractToolEvents(events: TraceEvent[]): ToolEvent[] {
    const result: ToolEvent[] = [];
    for (const e of events) {
      if (e.type === "CLAUDE_LAUNCHED") {
        result.push({ kind: "launched", tool: "Claude", timestamp: e.createdAt });
      } else if (e.type === "CLAUDE_EXITED") {
        result.push({
          kind: "exited",
          tool: "Claude",
          timestamp: e.createdAt,
          exitCode: e.payload.exitCode as number | undefined,
        });
      }
    }
    return result;
  }

  private formatDuration(start: Date, end: Date): string {
    const ms = end.getTime() - start.getTime();
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
