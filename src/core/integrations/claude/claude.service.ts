import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ClaudeLaunchOptions, ClaudeLaunchResult } from "./claude.types.js";

export class ClaudeService {
  isClaudeInstalled(): boolean {
    try {
      execSync("which claude", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return true;
    } catch {
      return false;
    }
  }

  async launch(options: ClaudeLaunchOptions): Promise<ClaudeLaunchResult> {
    const claudeProjectDir = this.getClaudeProjectDir(options.repoPath);
    const beforeSessionIds = this.listClaudeSessions(claudeProjectDir);

    return new Promise((resolve, reject) => {
      const args = [...(options.args || [])];

      if (options.resumeId) {
        args.push("--resume", options.resumeId);
      }

      const child = spawn("claude", args, {
        cwd: options.repoPath,
        stdio: "inherit",
        env: {
          ...process.env,
          TRACE_SESSION_ID: options.sessionId,
        },
      });

      child.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(
            new Error(
              "Claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code"
            )
          );
        } else {
          reject(err);
        }
      });

      child.on("close", (code) => {
        const claudeSessionId = this.detectNewClaudeSession(
          claudeProjectDir,
          beforeSessionIds,
          options.resumeId
        );
        resolve({ exitCode: code, claudeSessionId });
      });
    });
  }

  getClaudeProjectDir(repoPath: string): string {
    const encoded = repoPath.replace(/\//g, "-").replace(/^-/, "-");
    return path.join(os.homedir(), ".claude", "projects", encoded);
  }

  listClaudeSessions(projectDir: string): Set<string> {
    const sessions = new Set<string>();
    try {
      const files = fs.readdirSync(projectDir);
      for (const f of files) {
        if (f.endsWith(".jsonl")) {
          sessions.add(f.replace(".jsonl", ""));
        }
      }
    } catch {
      // directory may not exist yet
    }
    return sessions;
  }

  detectNewClaudeSession(
    projectDir: string,
    beforeIds: Set<string>,
    resumeId?: string,
  ): string | null {
    if (resumeId) return resumeId;

    try {
      const files = fs.readdirSync(projectDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => ({
          name: f.replace(".jsonl", ""),
          mtime: fs.statSync(path.join(projectDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      const newSession = files.find((f) => !beforeIds.has(f.name));
      if (newSession) return newSession.name;

      if (files[0]) return files[0].name;
    } catch {
      // projectDir may not exist — scan all project dirs
    }

    return this.scanAllProjectDirs(beforeIds);
  }

  private scanAllProjectDirs(beforeIds: Set<string>): string | null {
    try {
      const projectsRoot = path.join(os.homedir(), ".claude", "projects");
      const dirs = fs.readdirSync(projectsRoot);

      let best: { name: string; mtime: number } | null = null;

      for (const dir of dirs) {
        const dirPath = path.join(projectsRoot, dir);
        try {
          const files = fs.readdirSync(dirPath)
            .filter((f) => f.endsWith(".jsonl"))
            .map((f) => ({
              name: f.replace(".jsonl", ""),
              mtime: fs.statSync(path.join(dirPath, f)).mtimeMs,
            }));

          for (const f of files) {
            if (!beforeIds.has(f.name) && (!best || f.mtime > best.mtime)) {
              best = f;
            }
          }
        } catch { continue; }
      }

      return best?.name ?? null;
    } catch { return null; }
  }
}
