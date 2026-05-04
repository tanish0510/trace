import type { TraceEvent } from "../../events/event.types.js";

const NOISE_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".DS_Store",
]);

const NOISE_DIRS = [
  "dist/",
  "build/",
  "coverage/",
  "generated/",
  ".next/",
  ".nuxt/",
  "out/",
  "__pycache__/",
  "node_modules/",
  ".git/",
];

export class NoiseFilterService {
  filterEvents(events: TraceEvent[]): TraceEvent[] {
    return events
      .map((e) => this.cleanEvent(e))
      .filter((e) => !this.isNoise(e));
  }

  isNoiseFile(filePath: string): boolean {
    const basename = filePath.split("/").pop() || "";
    if (NOISE_FILES.has(basename)) return true;
    if (basename.endsWith(".swp") || basename.endsWith(".swo") || basename.endsWith("~")) return true;
    for (const dir of NOISE_DIRS) {
      if (filePath.includes(dir)) return true;
    }
    return false;
  }

  private cleanEvent(event: TraceEvent): TraceEvent {
    if (event.type !== "FILES_CHANGED") return event;

    const p = event.payload;
    const clean = (arr: unknown): string[] => {
      if (!Array.isArray(arr)) return [];
      return (arr as string[]).filter((f) => !this.isNoiseFile(f));
    };

    return {
      ...event,
      payload: {
        ...p,
        files: clean(p.files),
        created: clean(p.created),
        modified: clean(p.modified),
        deleted: clean(p.deleted),
        count: clean(p.files).length,
      },
    };
  }

  private isNoise(event: TraceEvent): boolean {
    if (event.type !== "FILES_CHANGED") return false;
    const files = event.payload.files as string[] | undefined;
    return !files || files.length === 0;
  }
}
