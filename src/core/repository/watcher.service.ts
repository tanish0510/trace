import chokidar, { type FSWatcher } from "chokidar";
import type { WatcherConfig, FileChange } from "./repository.types.js";
import { DEFAULT_IGNORE_PATTERNS, DEFAULT_DEBOUNCE_MS } from "./repository.types.js";

export type ChangeHandler = (changes: FileChange[]) => void;

export class WatcherService {
  private watcher: FSWatcher | null = null;
  private pendingChanges: Map<string, FileChange> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private config: WatcherConfig;
  private onChanges: ChangeHandler | null = null;

  constructor(config: Partial<WatcherConfig> & { repoPath: string; sessionId: string }) {
    this.config = {
      repoPath: config.repoPath,
      sessionId: config.sessionId,
      ignored: config.ignored || DEFAULT_IGNORE_PATTERNS,
      debounceMs: config.debounceMs || DEFAULT_DEBOUNCE_MS,
    };
  }

  start(handler: ChangeHandler): void {
    this.onChanges = handler;

    this.watcher = chokidar.watch(this.config.repoPath, {
      ignored: (filePath: string) => {
        const relative = filePath.startsWith(this.config.repoPath)
          ? filePath.slice(this.config.repoPath.length + 1)
          : filePath;
        if (!relative) return false;

        const segments = relative.split("/");
        const blocked = [
          ".git", "node_modules", "dist", "build", "coverage",
          ".trace", ".next", ".nuxt", "out", "__pycache__", ".venv", "target",
        ];
        if (segments.some((s) => blocked.includes(s))) return true;

        const name = segments[segments.length - 1] || "";
        if (name.endsWith(".swp") || name.endsWith(".swo") || name.endsWith("~")) return true;
        if (name === ".DS_Store") return true;
        if (name === "package-lock.json" || name === "pnpm-lock.yaml" || name === "yarn.lock") return true;

        return false;
      },
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher.on("change", (filePath) => {
      this.queueChange(filePath, "modified");
    });

    this.watcher.on("add", (filePath) => {
      this.queueChange(filePath, "created");
    });

    this.watcher.on("unlink", (filePath) => {
      this.queueChange(filePath, "deleted");
    });
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.flushPending();
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private queueChange(filePath: string, changeType: FileChange["changeType"]): void {
    const relative = filePath.startsWith(this.config.repoPath)
      ? filePath.slice(this.config.repoPath.length + 1)
      : filePath;

    this.pendingChanges.set(relative, { filePath: relative, changeType });

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushPending();
    }, this.config.debounceMs);
  }

  private flushPending(): void {
    if (this.pendingChanges.size === 0) return;

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();
    this.debounceTimer = null;

    if (this.onChanges) {
      this.onChanges(changes);
    }
  }
}
