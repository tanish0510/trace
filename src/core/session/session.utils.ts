import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TRACE_HOME = path.join(os.homedir(), ".trace");
const SESSIONS_DIR = "sessions";

export function getTraceHome(): string {
  return TRACE_HOME;
}

export function generateSessionId(): string {
  const prefix = "sess_";
  const random = randomBytes(4).toString("hex").slice(0, 4);
  return `${prefix}${random}`;
}

export function generateSessionName(gitBranch: string, repoPath: string): string {
  const date = new Date().toISOString().split("T")[0];

  const branchSlug = gitBranch
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase();

  if (branchSlug && branchSlug !== "unknown" && branchSlug !== "head") {
    return `${branchSlug}-${date}`;
  }

  const dirName = path.basename(repoPath)
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase();

  if (dirName) {
    return `${dirName}-${date}`;
  }

  return `session-${date}`;
}

export function detectRepoPath(): string {
  return process.cwd();
}

export function detectGitBranch(repoPath: string): string {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return branch || "unknown";
  } catch {
    return "unknown";
  }
}

export function ensureTraceDir(): string {
  if (!fs.existsSync(TRACE_HOME)) {
    fs.mkdirSync(TRACE_HOME, { recursive: true });
  }

  const sessionsDir = path.join(TRACE_HOME, SESSIONS_DIR);
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  return TRACE_HOME;
}

export function getSessionDir(sessionId: string): string {
  return path.join(TRACE_HOME, SESSIONS_DIR, sessionId);
}

export function ensureSessionDir(sessionId: string): string {
  const dir = getSessionDir(sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getStatePath(): string {
  return path.join(TRACE_HOME, "state.json");
}
