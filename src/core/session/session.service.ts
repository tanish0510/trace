import fs from "node:fs";
import type { Session, CreateSessionInput, SessionMetadata } from "./session.types.js";
import { SessionRepository } from "./session.repository.js";
import { StateService } from "../state/state.service.js";
import {
  generateSessionId,
  generateSessionName,
  ensureSessionDir,
} from "./session.utils.js";

export class SessionService {
  private repository = new SessionRepository();
  private stateService = new StateService();

  async createSession(input: CreateSessionInput): Promise<Session> {
    const existingActive = await this.repository.findActive();
    if (existingActive) {
      await this.endSession(existingActive.id);
    }

    const now = new Date();
    const id = generateSessionId();
    const name = input.name || generateSessionName(input.gitBranch, input.repoPath);

    const session: Session = {
      id,
      name,
      repoPath: input.repoPath,
      gitBranch: input.gitBranch,
      status: "ACTIVE",
      tool: input.tool,
      claudeSessionId: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.create(session);
    this.writeSessionMetadata(session);
    this.stateService.setActiveSession(session.id);

    return session;
  }

  async setClaudeSessionId(sessionId: string, claudeSessionId: string): Promise<void> {
    await this.repository.setClaudeSessionId(sessionId, claudeSessionId);
    const updated = await this.repository.findById(sessionId);
    if (updated) {
      this.writeSessionMetadata(updated);
    }
  }

  async endSession(sessionId?: string): Promise<Session | null> {
    const id = sessionId || this.stateService.getActiveSessionId();
    if (!id) return null;

    const session = await this.repository.findById(id);
    if (!session) return null;

    await this.repository.updateStatus(id, "ENDED");
    this.stateService.clearActiveSession();

    const updated = await this.repository.findById(id);
    if (updated) {
      this.writeSessionMetadata(updated);
    }

    return updated;
  }

  async resumeSession(sessionId: string): Promise<Session | null> {
    const session = await this.repository.findById(sessionId);
    if (!session) return null;

    const existingActive = await this.repository.findActive();
    if (existingActive && existingActive.id !== sessionId) {
      await this.endSession(existingActive.id);
    }

    await this.repository.updateStatus(sessionId, "ACTIVE");
    this.stateService.setActiveSession(sessionId);

    const updated = await this.repository.findById(sessionId);
    if (updated) {
      this.writeSessionMetadata(updated);
    }

    return updated;
  }

  async getCurrentSession(): Promise<Session | null> {
    const activeId = this.stateService.getActiveSessionId();
    if (!activeId) return null;
    return this.repository.findById(activeId);
  }

  async listSessions(): Promise<Session[]> {
    return this.repository.findAll();
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.repository.findById(sessionId);
  }

  private writeSessionMetadata(session: Session): void {
    const sessionDir = ensureSessionDir(session.id);
    const metadata: SessionMetadata = {
      id: session.id,
      name: session.name,
      repoPath: session.repoPath,
      gitBranch: session.gitBranch,
      status: session.status,
      tool: session.tool,
      claudeSessionId: session.claudeSessionId,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };

    const metadataPath = `${sessionDir}/metadata.json`;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf-8");
  }
}
