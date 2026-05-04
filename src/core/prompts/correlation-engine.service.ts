import type { TraceEvent } from "../events/event.types.js";
import type { DiffSnapshot } from "../repository/repository.types.js";
import type { Prompt, PromptCorrelation } from "./prompt.types.js";
import { PromptRepository } from "./prompt-repository.js";
import { EventService } from "../events/event.service.js";
import { DiffService } from "../repository/diff.service.js";

const CORRELATION_WINDOW_MS = 10 * 60 * 1000;

export class CorrelationEngineService {
  private repository = new PromptRepository();
  private eventService = new EventService();
  private diffService = new DiffService();

  async correlate(prompt: Prompt): Promise<PromptCorrelation[]> {
    const events = await this.eventService.getSessionEvents(prompt.sessionId);
    const diffs = await this.diffService.getBySession(prompt.sessionId);

    const correlations: PromptCorrelation[] = [];
    const promptTime = prompt.createdAt.getTime();
    const promptWords = this.tokenize(prompt.content);

    const windowEvents = events.filter((e) => {
      const t = e.createdAt.getTime();
      return t >= promptTime - CORRELATION_WINDOW_MS && t <= promptTime + CORRELATION_WINDOW_MS;
    });

    const fileScores = new Map<string, { score: number; reason: string }>();

    for (const event of windowEvents) {
      if (event.type === "FILES_CHANGED") {
        const allFiles = [
          ...((event.payload.created as string[]) || []),
          ...((event.payload.modified as string[]) || []),
          ...((event.payload.deleted as string[]) || []),
        ];

        for (const file of allFiles) {
          const score = this.scoreFileMatch(file, promptWords, promptTime, event.createdAt.getTime());
          const existing = fileScores.get(file);
          if (!existing || score > existing.score) {
            fileScores.set(file, { score, reason: "file activity within prompt window" });
          }
        }
      }

      if (event.type === "COMMIT_CREATED") {
        const msg = (event.payload.message as string) || "";
        const hash = (event.payload.hash as string) || "";
        const msgScore = this.scoreTextMatch(msg, promptWords);
        const temporal = this.temporalScore(promptTime, event.createdAt.getTime());
        const score = Math.min(1, msgScore * 0.6 + temporal * 0.4);

        if (score > 0.2) {
          correlations.push(
            this.repository.addCorrelation({
              promptId: prompt.id,
              eventId: event.id,
              diffId: null,
              commitHash: hash,
              filePath: null,
              confidenceScore: score,
              reason: `commit message matches: "${msg}"`,
            }),
          );
        }
      }
    }

    for (const diff of diffs) {
      const diffTime = diff.createdAt.getTime();
      if (diffTime < promptTime - CORRELATION_WINDOW_MS || diffTime > promptTime + CORRELATION_WINDOW_MS) {
        continue;
      }

      for (const file of diff.filesChanged) {
        const existing = fileScores.get(file);
        const fileScore = this.scoreFileMatch(file, promptWords, promptTime, diffTime);
        const boosted = Math.min(1, fileScore + 0.1);
        if (!existing || boosted > existing.score) {
          fileScores.set(file, { score: boosted, reason: "file in diff within prompt window" });
        }
      }
    }

    for (const [file, { score, reason }] of fileScores) {
      if (score < 0.15) continue;
      correlations.push(
        this.repository.addCorrelation({
          promptId: prompt.id,
          eventId: null,
          diffId: null,
          commitHash: null,
          filePath: file,
          confidenceScore: score,
          reason,
        }),
      );
    }

    if (correlations.length > 0) {
      await this.eventService.emit({
        sessionId: prompt.sessionId,
        type: "PROMPT_CORRELATED",
        payload: {
          promptId: prompt.id,
          correlationCount: correlations.length,
          topFiles: [...fileScores.entries()]
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, 5)
            .map(([f]) => f),
        },
      });
    }

    return correlations;
  }

  private scoreFileMatch(
    filePath: string,
    promptWords: string[],
    promptTime: number,
    eventTime: number,
  ): number {
    let score = 0;
    const pathLower = filePath.toLowerCase();
    const segments = pathLower.split("/");
    const basename = segments[segments.length - 1] || "";
    const nameNoExt = basename.replace(/\.[^.]+$/, "");

    for (const word of promptWords) {
      if (pathLower.includes(word)) score += 0.3;
      if (nameNoExt.includes(word)) score += 0.2;
      for (const seg of segments) {
        if (seg.includes(word)) score += 0.1;
      }
    }

    score += this.temporalScore(promptTime, eventTime) * 0.3;

    return Math.min(1, score);
  }

  private scoreTextMatch(text: string, promptWords: string[]): number {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let matches = 0;
    for (const word of promptWords) {
      if (lower.includes(word)) matches++;
    }
    return promptWords.length > 0 ? matches / promptWords.length : 0;
  }

  private temporalScore(promptTime: number, eventTime: number): number {
    const gap = Math.abs(eventTime - promptTime);
    if (gap < 30_000) return 1;
    if (gap < 60_000) return 0.9;
    if (gap < 2 * 60_000) return 0.7;
    if (gap < 5 * 60_000) return 0.5;
    if (gap < CORRELATION_WINDOW_MS) return 0.3;
    return 0;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .filter((w) => !STOP_WORDS.has(w));
  }
}

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "are", "was",
  "were", "been", "have", "has", "had", "will", "would", "could",
  "should", "can", "may", "not", "but", "all", "its", "also",
  "into", "more", "some", "than", "then", "them", "these", "those",
  "add", "fix", "update", "make", "use", "get", "set",
]);
