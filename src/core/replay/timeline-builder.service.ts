import type { TraceEvent } from "../events/event.types.js";
import type { DiffSnapshot } from "../repository/repository.types.js";
import type { TimelineEntry } from "./replay.types.js";

export class TimelineBuilderService {
  build(events: TraceEvent[], diffs: DiffSnapshot[]): TimelineEntry[] {
    const diffMap = new Map<string, DiffSnapshot>();
    for (const d of diffs) {
      diffMap.set(d.id, d);
    }

    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const grouped = this.groupAdjacentFileEvents(sorted);
    const entries: TimelineEntry[] = [];

    for (const item of grouped) {
      if (Array.isArray(item)) {
        entries.push(this.buildFilesEntry(item));
      } else {
        const entry = this.buildEntry(item, diffMap);
        if (entry) entries.push(entry);
      }
    }

    return entries;
  }

  buildForMode(
    events: TraceEvent[],
    diffs: DiffSnapshot[],
    mode: "timeline" | "diff" | "commits",
  ): TimelineEntry[] {
    const all = this.build(events, diffs);

    switch (mode) {
      case "timeline":
        return all;
      case "diff":
        return all.filter((e) => e.kind === "diff");
      case "commits":
        return all.filter((e) => e.kind === "commit" || e.kind === "branch");
    }
  }

  /**
   * Groups consecutive FILES_CHANGED events that occur within 3 seconds
   * of each other into arrays, leaving other events as singletons.
   */
  private groupAdjacentFileEvents(
    events: TraceEvent[],
  ): (TraceEvent | TraceEvent[])[] {
    const result: (TraceEvent | TraceEvent[])[] = [];
    let fileGroup: TraceEvent[] = [];

    const flushGroup = () => {
      if (fileGroup.length === 0) return;
      if (fileGroup.length === 1) {
        result.push(fileGroup[0]!);
      } else {
        result.push([...fileGroup]);
      }
      fileGroup = [];
    };

    for (const event of events) {
      if (event.type === "FILES_CHANGED") {
        if (fileGroup.length > 0) {
          const last = fileGroup[fileGroup.length - 1]!;
          const gap = event.createdAt.getTime() - last.createdAt.getTime();
          if (gap > 3000) {
            flushGroup();
          }
        }
        fileGroup.push(event);
      } else {
        flushGroup();
        result.push(event);
      }
    }

    flushGroup();
    return result;
  }

  private buildFilesEntry(events: TraceEvent[]): TimelineEntry {
    const allCreated = new Set<string>();
    const allModified = new Set<string>();
    const allDeleted = new Set<string>();

    for (const e of events) {
      const p = e.payload;
      for (const f of (p.created as string[]) || []) allCreated.add(f);
      for (const f of (p.modified as string[]) || []) allModified.add(f);
      for (const f of (p.deleted as string[]) || []) allDeleted.add(f);
    }

    const details: string[] = [];
    for (const f of allCreated) details.push(`+ ${f}`);
    for (const f of allModified) details.push(`~ ${f}`);
    for (const f of allDeleted) details.push(`- ${f}`);

    const total = allCreated.size + allModified.size + allDeleted.size;
    const label =
      total === 1
        ? `${total} file changed`
        : `${total} files changed`;

    return {
      timestamp: events[0]!.createdAt,
      kind: "files",
      label,
      details,
    };
  }

  private buildEntry(
    event: TraceEvent,
    diffMap: Map<string, DiffSnapshot>,
  ): TimelineEntry | null {
    const p = event.payload;

    switch (event.type) {
      case "SESSION_STARTED":
        return {
          timestamp: event.createdAt,
          kind: "session",
          label: "Session started",
          details: this.sessionDetails(p),
        };

      case "SESSION_RESUMED":
        return {
          timestamp: event.createdAt,
          kind: "session",
          label: "Session resumed",
          details: [],
        };

      case "SESSION_ENDED":
        return {
          timestamp: event.createdAt,
          kind: "session",
          label: "Session ended",
          details: [],
        };

      case "CLAUDE_LAUNCHED":
        return {
          timestamp: event.createdAt,
          kind: "tool",
          label: "Claude launched",
          details: [],
        };

      case "CLAUDE_EXITED":
        return {
          timestamp: event.createdAt,
          kind: "tool",
          label: "Claude exited",
          details: p.exitCode !== undefined ? [`exit: ${p.exitCode}`] : [],
        };

      case "FILES_CHANGED":
        return this.buildFilesEntry([event]);

      case "GIT_DIFF_CAPTURED": {
        const details: string[] = [];
        const ins = p.insertions as number | undefined;
        const del = p.deletions as number | undefined;
        if (ins || del) {
          details.push(`+${ins || 0} insertions / -${del || 0} deletions`);
        }
        const files = p.filesChanged as string[] | undefined;
        if (files) {
          for (const f of files) details.push(f);
        }
        return {
          timestamp: event.createdAt,
          kind: "diff",
          label: "Git diff captured",
          details,
        };
      }

      case "COMMIT_CREATED": {
        const hash = p.hash as string | undefined;
        const msg = p.message as string | undefined;
        const label = msg
          ? `Commit: "${msg}"`
          : `Commit: ${hash?.slice(0, 7) || "unknown"}`;
        const details: string[] = [];
        if (hash) details.push(hash.slice(0, 7));
        if (p.branch) details.push(`branch: ${p.branch}`);
        if (p.author) details.push(`by ${p.author}`);
        return {
          timestamp: event.createdAt,
          kind: "commit",
          label,
          details,
        };
      }

      case "GIT_BRANCH_CHANGED":
        return {
          timestamp: event.createdAt,
          kind: "branch",
          label: `Branch: ${p.previousBranch} → ${p.currentBranch}`,
          details: [],
        };

      default:
        return null;
    }
  }

  private sessionDetails(p: Record<string, unknown>): string[] {
    const details: string[] = [];
    if (p.repoPath) details.push(`${p.repoPath}`);
    if (p.gitBranch && p.gitBranch !== "unknown") {
      details.push(`branch: ${p.gitBranch}`);
    }
    return details;
  }
}
