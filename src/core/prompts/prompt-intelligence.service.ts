import { randomBytes } from "node:crypto";
import { PromptRepository } from "./prompt-repository.js";
import { CorrelationEngineService } from "./correlation-engine.service.js";
import { EventService } from "../events/event.service.js";
import { DiffService } from "../repository/diff.service.js";
import type { Prompt, EngineeringIntent, PromptSummary, WhyResult, PromptCorrelation } from "./prompt.types.js";

export class PromptIntelligenceService {
  private repository = new PromptRepository();
  private correlationEngine = new CorrelationEngineService();
  private eventService = new EventService();
  private diffService = new DiffService();
  private correlationQueue: Prompt[] = [];
  private processing = false;

  async captureAndCorrelate(sessionId: string, content: string): Promise<{
    prompt: Prompt;
    intent: EngineeringIntent;
    correlations: PromptCorrelation[];
  }> {
    const prompt = this.repository.create(sessionId, content);

    await this.eventService.emit({
      sessionId,
      type: "PROMPT_CAPTURED",
      payload: { promptId: prompt.id, content },
    });

    this.correlationQueue.push(prompt);
    this.drainQueue();

    return { prompt, intent: this.buildIntent(prompt, []), correlations: [] };
  }

  private drainQueue(): void {
    if (this.processing) return;
    this.processing = true;

    const run = async () => {
      while (this.correlationQueue.length > 0) {
        const prompt = this.correlationQueue.shift()!;
        try {
          await this.correlationEngine.correlate(prompt);
        } catch { /* best-effort */ }
      }
      this.processing = false;
    };

    setTimeout(() => run().catch(() => { this.processing = false; }), 0);
  }

  async recorrelateSession(sessionId: string): Promise<number> {
    const prompts = this.repository.getBySession(sessionId);
    let count = 0;
    for (const prompt of prompts) {
      const existing = this.repository.getCorrelations(prompt.id);
      if (existing.length > 0) continue;
      try {
        const correlations = await this.correlationEngine.correlate(prompt);
        count += correlations.length;
      } catch { /* */ }
    }
    return count;
  }

  async recorrelateAll(): Promise<number> {
    const { getRawConnection } = await import("../storage/sqlite.js");
    const conn = getRawConnection();
    if (!conn) return 0;

    const sessions = conn
      .prepare("SELECT DISTINCT session_id FROM prompts")
      .all() as { session_id: string }[];

    let total = 0;
    for (const s of sessions) {
      total += await this.recorrelateSession(s.session_id);
    }
    return total;
  }

  buildIntent(prompt: Prompt, correlations: PromptCorrelation[]): EngineeringIntent {
    const files = new Set<string>();
    const commits = new Set<string>();
    const events = new Set<string>();
    let totalScore = 0;

    for (const c of correlations) {
      if (c.filePath) files.add(c.filePath);
      if (c.commitHash) commits.add(c.commitHash);
      if (c.eventId) events.add(c.eventId);
      totalScore += c.confidenceScore;
    }

    const avgScore = correlations.length > 0 ? totalScore / correlations.length : 0;

    return {
      id: `int_${randomBytes(6).toString("hex").slice(0, 8)}`,
      promptId: prompt.id,
      title: this.inferTitle(prompt.content),
      relatedFiles: [...files],
      relatedCommits: [...commits],
      relatedEvents: [...events],
      confidenceScore: Math.min(1, avgScore),
      prompt,
    };
  }

  async getPromptSummary(promptId: string): Promise<PromptSummary | null> {
    const prompt = this.repository.getById(promptId);
    if (!prompt) return null;

    const correlations = this.repository.getCorrelations(promptId);
    const intent = this.buildIntent(prompt, correlations);

    const events = await this.eventService.getSessionEvents(prompt.sessionId);
    const commitEvents = events.filter((e) => e.type === "COMMIT_CREATED");

    const relatedCommits = commitEvents
      .filter((e) => intent.relatedCommits.includes(e.payload.hash as string))
      .map((e) => ({
        hash: (e.payload.hash as string).slice(0, 7),
        message: (e.payload.message as string) || "",
      }));

    const sessionStarted = events.find((e) => e.type === "SESSION_STARTED");
    const branch = sessionStarted
      ? (sessionStarted.payload.gitBranch as string) || "unknown"
      : "unknown";

    return {
      prompt,
      intent,
      affectedFiles: intent.relatedFiles,
      commits: relatedCommits,
      duration: null,
      branch,
      correlationCount: correlations.length,
    };
  }

  async whyFile(filePath: string): Promise<WhyResult> {
    const correlations = this.repository.getCorrelationsForFile(filePath);

    const promptResults = correlations.map((c) => ({
      prompt: c.prompt,
      confidence: c.confidenceScore,
      reason: c.reason,
    }));

    promptResults.sort((a, b) => b.confidence - a.confidence);

    const commits: { hash: string; message: string; branch: string }[] = [];
    const relatedFiles = new Set<string>();

    for (const c of correlations) {
      const otherCorrelations = this.repository.getCorrelations(c.promptId);
      for (const oc of otherCorrelations) {
        if (oc.filePath && oc.filePath !== filePath) relatedFiles.add(oc.filePath);
        if (oc.commitHash) {
          const events = await this.eventService.getSessionEvents(c.prompt.sessionId);
          const commitEvent = events.find(
            (e) => e.type === "COMMIT_CREATED" && e.payload.hash === oc.commitHash,
          );
          if (commitEvent) {
            commits.push({
              hash: (commitEvent.payload.hash as string).slice(0, 7),
              message: (commitEvent.payload.message as string) || "",
              branch: (commitEvent.payload.branch as string) || "",
            });
          }
        }
      }
    }

    const uniqueCommits = [...new Map(commits.map((c) => [c.hash, c])).values()];

    return {
      filePath,
      prompts: promptResults,
      commits: uniqueCommits,
      relatedFiles: [...relatedFiles],
    };
  }

  private inferTitle(content: string): string {
    const trimmed = content.trim();
    if (trimmed.length <= 60) return trimmed;
    return trimmed.slice(0, 57) + "...";
  }
}
