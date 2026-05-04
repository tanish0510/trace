import { eq } from "drizzle-orm";
import { sessions } from "../../db/schema.js";
import { getDatabase } from "../storage/sqlite.js";
import type { Session, SessionStatus } from "./session.types.js";

function rowToSession(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repoPath,
    gitBranch: row.gitBranch,
    status: row.status,
    tool: row.tool,
    claudeSessionId: row.claudeSessionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SessionRepository {
  private get db() {
    return getDatabase();
  }

  async create(session: Session): Promise<Session> {
    this.db.insert(sessions).values({
      id: session.id,
      name: session.name,
      repoPath: session.repoPath,
      gitBranch: session.gitBranch,
      status: session.status,
      tool: session.tool,
      claudeSessionId: session.claudeSessionId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }).run();

    return session;
  }

  async findById(id: string): Promise<Session | null> {
    const rows = this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .all();

    const row = rows[0];
    return row ? rowToSession(row) : null;
  }

  async findAll(): Promise<Session[]> {
    const rows = this.db.select().from(sessions).all();
    return rows.map(rowToSession);
  }

  async findActive(): Promise<Session | null> {
    const rows = this.db
      .select()
      .from(sessions)
      .where(eq(sessions.status, "ACTIVE"))
      .all();

    const row = rows[0];
    return row ? rowToSession(row) : null;
  }

  async updateStatus(id: string, status: SessionStatus): Promise<void> {
    this.db
      .update(sessions)
      .set({ status, updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .run();
  }

  async setClaudeSessionId(id: string, claudeSessionId: string): Promise<void> {
    this.db
      .update(sessions)
      .set({ claudeSessionId, updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .run();
  }

  async update(id: string, data: Partial<Session>): Promise<void> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.gitBranch !== undefined) updateData.gitBranch = data.gitBranch;
    if (data.claudeSessionId !== undefined) updateData.claudeSessionId = data.claudeSessionId;

    this.db.update(sessions).set(updateData).where(eq(sessions.id, id)).run();
  }
}
