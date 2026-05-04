import type { TraceEvent } from "../../events/event.types.js";
import type { DiffSnapshot } from "../../repository/repository.types.js";
import type { ActivityWindow } from "./aggregation.types.js";

const WINDOW_GAP_MS = 5 * 60 * 1000;

export class ActivityAggregatorService {
  aggregate(events: TraceEvent[], diffs: DiffSnapshot[]): ActivityWindow[] {
    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const windows: ActivityWindow[] = [];
    let current: TraceEvent[] = [];

    for (const event of sorted) {
      if (this.isSessionBoundary(event)) {
        if (current.length > 0) {
          windows.push(this.buildWindow(current, diffs));
          current = [];
        }
        windows.push(this.buildWindow([event], diffs));
        continue;
      }

      if (this.isCommit(event)) {
        current.push(event);
        windows.push(this.buildWindow(current, diffs));
        current = [];
        continue;
      }

      if (current.length > 0) {
        const lastTime = current[current.length - 1]!.createdAt.getTime();
        const gap = event.createdAt.getTime() - lastTime;
        if (gap > WINDOW_GAP_MS) {
          windows.push(this.buildWindow(current, diffs));
          current = [];
        }
      }

      current.push(event);
    }

    if (current.length > 0) {
      windows.push(this.buildWindow(current, diffs));
    }

    return windows;
  }

  private buildWindow(events: TraceEvent[], allDiffs: DiffSnapshot[]): ActivityWindow {
    const start = events[0]!.createdAt;
    const end = events[events.length - 1]!.createdAt;

    const windowDiffs = allDiffs.filter((d) => {
      const t = d.createdAt.getTime();
      return t >= start.getTime() - 2000 && t <= end.getTime() + 2000;
    });

    const created = new Set<string>();
    const modified = new Set<string>();
    const deleted = new Set<string>();
    let insertions = 0;
    let deletions = 0;

    for (const e of events) {
      if (e.type === "FILES_CHANGED") {
        for (const f of (e.payload.created as string[]) || []) created.add(f);
        for (const f of (e.payload.modified as string[]) || []) modified.add(f);
        for (const f of (e.payload.deleted as string[]) || []) deleted.add(f);
      }
    }

    for (const d of windowDiffs) {
      insertions += d.insertions;
      deletions += d.deletions;
    }

    return {
      startTime: start,
      endTime: end,
      events,
      diffs: windowDiffs,
      filesCreated: [...created],
      filesModified: [...modified],
      filesDeleted: [...deleted],
      insertions,
      deletions,
    };
  }

  private isSessionBoundary(event: TraceEvent): boolean {
    return (
      event.type === "SESSION_STARTED" ||
      event.type === "SESSION_ENDED" ||
      event.type === "SESSION_RESUMED"
    );
  }

  private isCommit(event: TraceEvent): boolean {
    return event.type === "COMMIT_CREATED";
  }
}
