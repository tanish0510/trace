import fs from "node:fs";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { prompts, promptCorrelations } from "../../db/schema.js";
import { getDatabase } from "../storage/sqlite.js";
import { ensureSessionDir } from "../session/session.utils.js";
import type { Prompt, PromptCorrelation } from "./prompt.types.js";

function generatePromptId(): string {
  return `prm_${randomBytes(6).toString("hex").slice(0, 8)}`;
}

function generateCorrelationId(): string {
  return `cor_${randomBytes(6).toString("hex").slice(0, 8)}`;
}

export class PromptRepository {
  private get db() {
    return getDatabase();
  }

  create(sessionId: string, content: string): Prompt {
    const contentHash = createHash("sha256").update(content.trim()).digest("hex").slice(0, 16);

    const prompt: Prompt = {
      id: generatePromptId(),
      sessionId,
      content,
      createdAt: new Date(),
    };

    try {
      this.db.insert(prompts).values({
        id: prompt.id,
        sessionId: prompt.sessionId,
        content: prompt.content,
        contentHash,
        createdAt: prompt.createdAt,
      }).run();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("UNIQUE constraint")) {
        const existing = this.db.select().from(prompts)
          .where(eq(prompts.sessionId, sessionId))
          .all()
          .find((p) => p.contentHash === contentHash);
        if (existing) return this.toPrompt(existing);
      }
      throw err;
    }

    this.persistToFilesystem(prompt);
    return prompt;
  }

  getById(id: string): Prompt | null {
    const row = this.db.select().from(prompts).where(eq(prompts.id, id)).get();
    return row ? this.toPrompt(row) : null;
  }

  getBySession(sessionId: string): Prompt[] {
    return this.db
      .select()
      .from(prompts)
      .where(eq(prompts.sessionId, sessionId))
      .orderBy(prompts.createdAt)
      .all()
      .map(this.toPrompt);
  }

  addCorrelation(correlation: Omit<PromptCorrelation, "id">): PromptCorrelation {
    const full: PromptCorrelation = { id: generateCorrelationId(), ...correlation };

    this.db.insert(promptCorrelations).values({
      id: full.id,
      promptId: full.promptId,
      eventId: full.eventId,
      diffId: full.diffId,
      commitHash: full.commitHash,
      filePath: full.filePath,
      confidenceScore: Math.round(full.confidenceScore * 100),
      reason: full.reason,
    }).run();

    return full;
  }

  getCorrelations(promptId: string): PromptCorrelation[] {
    return this.db
      .select()
      .from(promptCorrelations)
      .where(eq(promptCorrelations.promptId, promptId))
      .all()
      .map((row) => ({
        id: row.id,
        promptId: row.promptId,
        eventId: row.eventId,
        diffId: row.diffId,
        commitHash: row.commitHash,
        filePath: row.filePath,
        confidenceScore: row.confidenceScore / 100,
        reason: row.reason,
      }));
  }

  getCorrelationsForFile(filePath: string): (PromptCorrelation & { prompt: Prompt })[] {
    const corRows = this.db
      .select()
      .from(promptCorrelations)
      .where(eq(promptCorrelations.filePath, filePath))
      .all();

    return corRows.map((row) => {
      const prompt = this.getById(row.promptId);
      return {
        id: row.id,
        promptId: row.promptId,
        eventId: row.eventId,
        diffId: row.diffId,
        commitHash: row.commitHash,
        filePath: row.filePath,
        confidenceScore: row.confidenceScore / 100,
        reason: row.reason,
        prompt: prompt!,
      };
    }).filter((c) => c.prompt);
  }

  getAllCorrelationsForSession(sessionId: string): PromptCorrelation[] {
    const sessionPrompts = this.getBySession(sessionId);
    const ids = new Set(sessionPrompts.map((p) => p.id));
    return this.db
      .select()
      .from(promptCorrelations)
      .all()
      .map((row) => ({
        id: row.id,
        promptId: row.promptId,
        eventId: row.eventId,
        diffId: row.diffId,
        commitHash: row.commitHash,
        filePath: row.filePath,
        confidenceScore: row.confidenceScore / 100,
        reason: row.reason,
      }))
      .filter((c) => ids.has(c.promptId));
  }

  private toPrompt(row: { id: string; sessionId: string; content: string; createdAt: Date }): Prompt {
    return { id: row.id, sessionId: row.sessionId, content: row.content, createdAt: row.createdAt };
  }

  private persistToFilesystem(prompt: Prompt): void {
    const sessionDir = ensureSessionDir(prompt.sessionId);
    const promptsDir = path.join(sessionDir, "prompts");
    if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });

    fs.writeFileSync(
      path.join(promptsDir, `${prompt.id}.json`),
      JSON.stringify({
        id: prompt.id,
        content: prompt.content,
        createdAt: prompt.createdAt.toISOString(),
      }, null, 2) + "\n",
      "utf-8",
    );
  }
}
