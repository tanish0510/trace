import type { TraceEvent } from "../events/event.types.js";
import type { DiffSnapshot } from "../repository/repository.types.js";
import type { Prompt } from "../prompts/prompt.types.js";
import type { Chapter } from "../replay/aggregation/aggregation.types.js";
import type { RelevanceScore } from "./context.types.js";

export class RelevanceEngineService {
  scoreFiles(
    events: TraceEvent[],
    diffs: DiffSnapshot[],
    focus: string | null,
  ): RelevanceScore[] {
    const scores = new Map<string, { score: number; reasons: Set<string> }>();

    const bump = (file: string, points: number, reason: string) => {
      const entry = scores.get(file) || { score: 0, reasons: new Set<string>() };
      entry.score += points;
      entry.reasons.add(reason);
      scores.set(file, entry);
    };

    for (const event of events) {
      if (event.type !== "FILES_CHANGED") continue;
      const files = [
        ...((event.payload.created as string[]) || []),
        ...((event.payload.modified as string[]) || []),
      ];
      for (const f of files) bump(f, 1, "activity");
    }

    for (const diff of diffs) {
      const churn = diff.insertions + diff.deletions;
      for (const f of diff.filesChanged) {
        bump(f, Math.min(churn / 20, 5), "churn");
      }
    }

    const now = Date.now();
    for (const diff of diffs) {
      const ageHours = (now - diff.createdAt.getTime()) / 3_600_000;
      const recencyBoost = ageHours < 1 ? 3 : ageHours < 6 ? 2 : ageHours < 24 ? 1 : 0;
      if (recencyBoost > 0) {
        for (const f of diff.filesChanged) bump(f, recencyBoost, "recent");
      }
    }

    if (focus) {
      const lower = focus.toLowerCase();
      for (const [file, entry] of scores) {
        if (file.toLowerCase().includes(lower)) {
          entry.score *= 2;
          entry.reasons.add("focus match");
        }
      }
    }

    return [...scores.entries()]
      .map(([file, { score, reasons }]) => ({
        file,
        score,
        reasons: [...reasons],
      }))
      .sort((a, b) => b.score - a.score);
  }

  scorePrompts(prompts: Prompt[], focus: string | null): Prompt[] {
    let sorted = [...prompts].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    if (focus) {
      const lower = focus.toLowerCase();
      const matching = sorted.filter((p) => p.content.toLowerCase().includes(lower));
      const rest = sorted.filter((p) => !p.content.toLowerCase().includes(lower));
      sorted = [...matching, ...rest];
    }

    return sorted;
  }

  scoreChapters(chapters: Chapter[], focus: string | null): Chapter[] {
    if (!focus) return chapters;

    const lower = focus.toLowerCase();
    return chapters.filter((ch) => {
      if (ch.title.toLowerCase().includes(lower)) return true;
      return ch.blocks.some((b) => {
        const allFiles = [...b.filesCreated, ...b.filesModified, ...b.filesDeleted];
        return allFiles.some((f) => f.toLowerCase().includes(lower))
          || b.intent.toLowerCase().includes(lower)
          || b.commits.some((c) => c.message.toLowerCase().includes(lower));
      });
    });
  }
}
