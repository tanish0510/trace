import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface ExtractedPrompt {
  content: string;
  timestamp: Date;
}

const NOISE_PATTERNS = [
  /^<local-command-/,
  /^<command-name>/,
  /^<local-command-stdout>/,
  /^<local-command-caveat>/,
];

export class PromptExtractorService {
  extract(repoPath: string, claudeSessionId: string): ExtractedPrompt[] {
    const jsonlPath = this.resolveJsonlPath(repoPath, claudeSessionId);
    if (!jsonlPath || !fs.existsSync(jsonlPath)) return [];

    const raw = fs.readFileSync(jsonlPath, "utf-8");
    const prompts: ExtractedPrompt[] = [];

    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;

      let entry: Record<string, unknown>;
      try { entry = JSON.parse(line); } catch { continue; }

      if (entry.type !== "user") continue;

      const msg = entry.message as { content?: unknown } | undefined;
      if (!msg) continue;

      const content = typeof msg.content === "string" ? msg.content : null;
      if (!content) continue;

      if (this.isNoise(content)) continue;

      prompts.push({
        content: content.trim(),
        timestamp: new Date(entry.timestamp as string),
      });
    }

    return prompts;
  }

  private isNoise(content: string): boolean {
    const trimmed = content.trim();

    if (trimmed.length < 5) return true;

    if (trimmed.startsWith("/")) return true;

    for (const pattern of NOISE_PATTERNS) {
      if (pattern.test(trimmed)) return true;
    }

    return false;
  }

  private resolveJsonlPath(repoPath: string, claudeSessionId: string): string | null {
    const encoded = repoPath.replace(/\//g, "-").replace(/^-/, "-");
    const projectDir = path.join(os.homedir(), ".claude", "projects", encoded);
    const jsonlFile = path.join(projectDir, `${claudeSessionId}.jsonl`);

    if (fs.existsSync(jsonlFile)) return jsonlFile;

    try {
      const dirs = fs.readdirSync(path.join(os.homedir(), ".claude", "projects"));
      for (const dir of dirs) {
        const candidate = path.join(os.homedir(), ".claude", "projects", dir, `${claudeSessionId}.jsonl`);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch { /* projects dir may not exist */ }

    return null;
  }
}
