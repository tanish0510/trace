import { truncatePrompt } from "../prompts/prompt.constants.js";
import type { Prompt } from "../prompts/prompt.types.js";
import type { Chapter } from "../replay/aggregation/aggregation.types.js";
import type { RelevanceScore } from "./context.types.js";
import {
  MAX_CONTEXT_FILES,
  MAX_CONTEXT_COMMITS,
  MAX_CONTEXT_PROMPTS,
  MAX_CONTEXT_CHAPTERS,
} from "./context.constants.js";

export class ContextCompressionService {
  compressFiles(ranked: RelevanceScore[]): string[] {
    return ranked.slice(0, MAX_CONTEXT_FILES).map((r) => r.file);
  }

  compressPrompts(prompts: Prompt[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const p of prompts) {
      const normalized = p.content.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(truncatePrompt(p.content));
      if (result.length >= MAX_CONTEXT_PROMPTS) break;
    }

    return result;
  }

  compressCommits(events: { hash: string; message: string }[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const c of events) {
      const key = c.message.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(c.message);
      if (result.length >= MAX_CONTEXT_COMMITS) break;
    }

    return result;
  }

  compressChapters(chapters: Chapter[]): { title: string; files: string[]; commits: string[] }[] {
    return chapters.slice(0, MAX_CONTEXT_CHAPTERS).map((ch) => {
      const allFiles = new Set<string>();
      const commits: string[] = [];
      for (const b of ch.blocks) {
        for (const f of b.filesCreated) allFiles.add(f);
        for (const f of b.filesModified) allFiles.add(f);
        for (const c of b.commits) commits.push(c.message);
      }
      return {
        title: ch.title,
        files: [...allFiles].slice(0, 8),
        commits: commits.slice(0, 3),
      };
    });
  }
}
