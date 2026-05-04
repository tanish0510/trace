import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { PromptIntelligenceService } from "./prompt-intelligence.service.js";
import { PromptRepository } from "./prompt-repository.js";
import { getRawConnection } from "../storage/sqlite.js";
import { loadPollState, savePollState, type PollStateData } from "./poll-state.js";

const POLL_INTERVAL_MS = 12_000;

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

export class PromptPollerService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private repoPath: string;
  private tracked = new Map<string, TrackedFile>();
  private intelligence = new PromptIntelligenceService();
  private repository = new PromptRepository();
  private state: PollStateData;

  private primarySessionId: string;
  private primaryClaudeId: string | null = null;

  constructor(sessionId: string, repoPath: string) {
    this.primarySessionId = sessionId;
    this.repoPath = repoPath;
    this.state = loadPollState();
  }

  start(claudeSessionId?: string): void {
    if (claudeSessionId) {
      this.primaryClaudeId = claudeSessionId;
      const jsonlPath = this.resolveJsonlPath(claudeSessionId);
      if (jsonlPath) {
        this.trackFile(jsonlPath, this.primarySessionId);
      }
    }

    this.discoverAndMapFiles();

    setTimeout(() => this.pollAll().catch(() => {}), 3000);

    this.interval = setInterval(() => {
      this.discoverAndMapFiles();
      this.pollAll().catch(() => {});
    }, POLL_INTERVAL_MS);
  }

  async stop(): Promise<number> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.discoverAndMapFiles();
    try { await this.pollAll(); } catch { /* best-effort */ }

    this.persistState();

    const primary = this.tracked.get(this.primarySessionId);
    return primary?.seenHashes.size ?? 0;
  }

  setClaudeSessionId(id: string): void {
    this.primaryClaudeId = id;
    const jsonlPath = this.resolveJsonlPath(id);
    if (jsonlPath) {
      this.trackFile(jsonlPath, this.primarySessionId);
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
        seenHashes.add(this.contentHash(p.content));
      }
    } catch { /* no existing prompts */ }

    this.tracked.set(traceSessionId, {
      jsonlPath,
      traceSessionId,
      byteOffset: this.state.files[jsonlPath]?.byteOffset ?? 0,
      seenHashes,
    });
  }

  private discoverAndMapFiles(): void {
    const projectDir = this.getProjectDir();
    if (!projectDir) return;

    let files: { name: string; mtime: number; filePath: string }[];
    try {
      files = fs.readdirSync(projectDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => ({
          name: f.replace(".jsonl", ""),
          mtime: fs.statSync(path.join(projectDir, f)).mtimeMs,
          filePath: path.join(projectDir, f),
        }))
        .sort((a, b) => b.mtime - a.mtime);
    } catch { return; }

    const alreadyMapped = new Set<string>();
    for (const t of this.tracked.values()) {
      alreadyMapped.add(path.basename(t.jsonlPath, ".jsonl"));
    }

    const traceSessionMap = this.getClaudeToTraceMap();

    for (const file of files) {
      if (alreadyMapped.has(file.name)) continue;

      const traceSessionId = traceSessionMap.get(file.name);
      if (traceSessionId) {
        this.trackFile(file.filePath, traceSessionId);
        continue;
      }

      const alreadyTrackedBySession = [...this.tracked.values()]
        .some((t) => t.traceSessionId === this.primarySessionId);

      if (!alreadyTrackedBySession || !this.primaryClaudeId) {
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        if (file.mtime > fiveMinAgo) {
          this.trackFile(file.filePath, this.primarySessionId);
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
    } catch { /* db may not be available */ }
    return map;
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

        const hash = this.contentHash(content);
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

  resolveJsonlPath(claudeSessionId: string): string | null {
    const projectDir = this.getProjectDir();
    if (!projectDir) return null;

    const direct = path.join(projectDir, `${claudeSessionId}.jsonl`);
    if (fs.existsSync(direct)) return direct;

    try {
      const allDirs = fs.readdirSync(path.join(os.homedir(), ".claude", "projects"));
      for (const dir of allDirs) {
        const candidate = path.join(os.homedir(), ".claude", "projects", dir, `${claudeSessionId}.jsonl`);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch { /* fallback search failed */ }

    return null;
  }

  getProjectDir(): string | null {
    const encoded = this.repoPath.replace(/\//g, "-").replace(/^-/, "-");
    const dir = path.join(os.homedir(), ".claude", "projects", encoded);
    if (fs.existsSync(dir)) return dir;

    try {
      const allDirs = fs.readdirSync(path.join(os.homedir(), ".claude", "projects"));
      for (const d of allDirs) {
        if (d.includes(path.basename(this.repoPath))) {
          return path.join(os.homedir(), ".claude", "projects", d);
        }
      }
    } catch { /* */ }

    return null;
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

  private contentHash(content: string): string {
    return createHash("sha256").update(content.trim()).digest("hex").slice(0, 16);
  }

  static async backfillSession(traceSessionId: string, claudeSessionId: string, repoPath: string): Promise<number> {
    const poller = new PromptPollerService(traceSessionId, repoPath);
    const jsonlPath = poller.resolveJsonlPath(claudeSessionId);
    if (!jsonlPath) return 0;

    poller.trackFile(jsonlPath, traceSessionId);
    await poller.pollFile(poller.tracked.get(traceSessionId)!);
    poller.persistState();
    return poller.tracked.get(traceSessionId)?.seenHashes.size ?? 0;
  }

  static async backfillAll(repoPath: string): Promise<number> {
    const conn = getRawConnection();
    if (!conn) return 0;

    const rows = conn
      .prepare("SELECT id, claude_session_id FROM sessions WHERE claude_session_id IS NOT NULL")
      .all() as { id: string; claude_session_id: string }[];

    let total = 0;
    for (const row of rows) {
      total += await PromptPollerService.backfillSession(row.id, row.claude_session_id, repoPath);
    }
    return total;
  }
}
