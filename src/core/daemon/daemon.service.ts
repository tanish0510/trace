import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { createHash } from "node:crypto";
import { PromptIntelligenceService } from "../prompts/prompt-intelligence.service.js";
import { PromptRepository } from "../prompts/prompt-repository.js";
import { getRawConnection } from "../storage/sqlite.js";
import { getDatabase } from "../storage/sqlite.js";
import { closeDatabase } from "../storage/sqlite.js";
import { loadPollState, savePollState, type PollStateData } from "../prompts/poll-state.js";
import { ensureTraceDir, getTraceHome } from "../session/session.utils.js";

const POLL_INTERVAL_MS = 10_000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const NOISE_PATTERNS = [
  /^<local-command-/,
  /^<command-name>/,
  /^<local-command-stdout>/,
  /^<local-command-caveat>/,
];

interface TrackedFile {
  jsonlPath: string;
  traceSessionId: string;
  byteOffset: number;
  seenHashes: Set<string>;
}

export class TraceDaemon {
  private server: net.Server | null = null;
  private watchers: fs.FSWatcher[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private tracked = new Map<string, TrackedFile>();
  private state: PollStateData;
  private intelligence = new PromptIntelligenceService();
  private repository = new PromptRepository();
  private lastActivity = Date.now();
  private running = false;

  constructor() {
    ensureTraceDir();
    getDatabase();
    this.state = loadPollState();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.writePidFile();
    this.startIPC();
    this.startWatchers();
    this.startPolling();
    this.resetIdleTimer();

    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
  }

  private startIPC(): void {
    const sockPath = this.getSocketPath();
    try { fs.unlinkSync(sockPath); } catch { /* may not exist */ }

    this.server = net.createServer((conn) => {
      let data = "";
      conn.on("data", (chunk) => { data += chunk.toString(); });
      conn.on("end", () => {
        try {
          const msg = JSON.parse(data);
          const response = this.handleMessage(msg);
          conn.write(JSON.stringify(response));
        } catch {
          conn.write(JSON.stringify({ error: "invalid message" }));
        }
        conn.end();
      });
    });

    this.server.listen(sockPath);
  }

  private handleMessage(msg: Record<string, unknown>): Record<string, unknown> {
    this.resetIdleTimer();
    this.lastActivity = Date.now();

    switch (msg.type) {
      case "session_started":
        this.discoverAndMapFiles();
        this.pollAll().catch(() => {});
        return { ok: true, tracked: this.tracked.size };

      case "status":
        return {
          ok: true,
          pid: process.pid,
          uptime: process.uptime(),
          tracked: [...this.tracked.entries()].map(([id, t]) => ({
            sessionId: id,
            file: path.basename(t.jsonlPath),
            offset: t.byteOffset,
            prompts: t.seenHashes.size,
          })),
          lastActivity: this.lastActivity,
        };

      case "poll_now":
        this.discoverAndMapFiles();
        this.pollAll().catch(() => {});
        return { ok: true };

      case "shutdown":
        setTimeout(() => this.shutdown(), 100);
        return { ok: true };

      default:
        return { error: "unknown message type" };
    }
  }

  private startWatchers(): void {
    const projectsRoot = path.join(os.homedir(), ".claude", "projects");
    if (!fs.existsSync(projectsRoot)) return;

    try {
      const dirs = fs.readdirSync(projectsRoot);
      for (const dir of dirs) {
        const dirPath = path.join(projectsRoot, dir);
        try {
          const stat = fs.statSync(dirPath);
          if (!stat.isDirectory()) continue;

          const watcher = fs.watch(dirPath, (eventType, filename) => {
            if (filename && filename.endsWith(".jsonl")) {
              this.lastActivity = Date.now();
              this.resetIdleTimer();
              setTimeout(() => {
                this.discoverAndMapFiles();
                this.pollAll().catch(() => {});
              }, 500);
            }
          });
          this.watchers.push(watcher);
        } catch { continue; }
      }
    } catch { /* projects dir may not exist */ }
  }

  private startPolling(): void {
    this.discoverAndMapFiles();
    this.pollAll().catch(() => {});

    this.pollTimer = setInterval(() => {
      this.discoverAndMapFiles();
      this.pollAll().catch(() => {});
    }, POLL_INTERVAL_MS);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      const activeSessions = this.getActiveSessions();
      if (activeSessions.length === 0) {
        this.shutdown();
      } else {
        this.resetIdleTimer();
      }
    }, IDLE_TIMEOUT_MS);
  }

  private getActiveSessions(): { id: string }[] {
    try {
      const conn = getRawConnection();
      if (!conn) return [];
      return conn
        .prepare("SELECT id FROM sessions WHERE status = 'ACTIVE'")
        .all() as { id: string }[];
    } catch { return []; }
  }

  private discoverAndMapFiles(): void {
    const projectsRoot = path.join(os.homedir(), ".claude", "projects");
    if (!fs.existsSync(projectsRoot)) return;

    const traceSessionMap = this.getClaudeToTraceMap();
    const alreadyMapped = new Set<string>();
    for (const t of this.tracked.values()) {
      alreadyMapped.add(path.basename(t.jsonlPath, ".jsonl"));
    }

    let dirs: string[];
    try { dirs = fs.readdirSync(projectsRoot); } catch { return; }

    for (const dir of dirs) {
      const dirPath = path.join(projectsRoot, dir);
      let files: { name: string; mtime: number; filePath: string }[];
      try {
        files = fs.readdirSync(dirPath)
          .filter((f) => f.endsWith(".jsonl"))
          .map((f) => ({
            name: f.replace(".jsonl", ""),
            mtime: fs.statSync(path.join(dirPath, f)).mtimeMs,
            filePath: path.join(dirPath, f),
          }))
          .sort((a, b) => b.mtime - a.mtime);
      } catch { continue; }

      for (const file of files) {
        if (alreadyMapped.has(file.name)) continue;

        const traceSessionId = traceSessionMap.get(file.name);
        if (traceSessionId) {
          this.trackFile(file.filePath, traceSessionId);
          alreadyMapped.add(file.name);
        }
      }
    }
  }

  private getClaudeToTraceMap(): Map<string, string> {
    const map = new Map<string, string>();
    try {
      const conn = getRawConnection();
      if (!conn) return map;
      const rows = conn
        .prepare("SELECT id, claude_session_id FROM sessions WHERE claude_session_id IS NOT NULL")
        .all() as { id: string; claude_session_id: string }[];
      for (const row of rows) {
        map.set(row.claude_session_id, row.id);
      }
    } catch { /* */ }
    return map;
  }

  private trackFile(jsonlPath: string, traceSessionId: string): void {
    if (this.tracked.has(traceSessionId)) {
      const existing = this.tracked.get(traceSessionId)!;
      if (existing.jsonlPath === jsonlPath) return;
      existing.jsonlPath = jsonlPath;
      existing.byteOffset = this.state.files[jsonlPath]?.byteOffset ?? 0;
      return;
    }

    const seenHashes = new Set<string>(this.state.seenHashes);
    try {
      const existing = this.repository.getBySession(traceSessionId);
      for (const p of existing) {
        seenHashes.add(createHash("sha256").update(p.content.trim()).digest("hex").slice(0, 16));
      }
    } catch { /* */ }

    this.tracked.set(traceSessionId, {
      jsonlPath,
      traceSessionId,
      byteOffset: this.state.files[jsonlPath]?.byteOffset ?? 0,
      seenHashes,
    });
  }

  private async pollAll(): Promise<void> {
    for (const tracked of this.tracked.values()) {
      await this.pollFile(tracked).catch(() => {});
    }
    this.persistState();
  }

  private async pollFile(tracked: TrackedFile): Promise<void> {
    if (!fs.existsSync(tracked.jsonlPath)) return;

    const stat = fs.statSync(tracked.jsonlPath);
    if (stat.size <= tracked.byteOffset) return;

    const fd = fs.openSync(tracked.jsonlPath, "r");
    try {
      const buf = Buffer.alloc(stat.size - tracked.byteOffset);
      fs.readSync(fd, buf, 0, buf.length, tracked.byteOffset);
      tracked.byteOffset = stat.size;

      const newData = buf.toString("utf-8");
      for (const line of newData.split("\n")) {
        if (!line.trim()) continue;

        let entry: Record<string, unknown>;
        try { entry = JSON.parse(line); } catch { continue; }
        if (entry.type !== "user") continue;

        const msg = entry.message as { content?: unknown } | undefined;
        if (!msg) continue;

        const content = typeof msg.content === "string" ? msg.content : null;
        if (!content) continue;
        if (this.isNoise(content)) continue;

        const hash = createHash("sha256").update(content.trim()).digest("hex").slice(0, 16);
        if (tracked.seenHashes.has(hash)) continue;
        tracked.seenHashes.add(hash);

        try {
          await this.intelligence.captureAndCorrelate(tracked.traceSessionId, content.trim());
        } catch { /* best-effort */ }
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  private persistState(): void {
    for (const tracked of this.tracked.values()) {
      this.state.files[tracked.jsonlPath] = {
        byteOffset: tracked.byteOffset,
        lastSeen: Date.now(),
      };
    }
    const allHashes = new Set<string>();
    for (const tracked of this.tracked.values()) {
      for (const h of tracked.seenHashes) allHashes.add(h);
    }
    this.state.seenHashes = [...allHashes];
    savePollState(this.state);
  }

  private isNoise(content: string): boolean {
    const trimmed = content.trim();
    if (trimmed.length < 1) return true;
    if (trimmed.startsWith("/")) return true;
    for (const pattern of NOISE_PATTERNS) {
      if (pattern.test(trimmed)) return true;
    }
    return false;
  }

  private shutdown(): void {
    this.persistState();

    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    for (const w of this.watchers) w.close();

    if (this.server) {
      this.server.close();
      try { fs.unlinkSync(this.getSocketPath()); } catch { /* */ }
    }

    try { fs.unlinkSync(this.getPidPath()); } catch { /* */ }

    closeDatabase();
    process.exit(0);
  }

  private writePidFile(): void {
    fs.writeFileSync(this.getPidPath(), String(process.pid), "utf-8");
  }

  private getPidPath(): string {
    return path.join(getTraceHome(), "daemon.pid");
  }

  private getSocketPath(): string {
    return path.join(getTraceHome(), "daemon.sock");
  }
}
