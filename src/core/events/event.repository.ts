import fs from "node:fs";
import path from "node:path";
import { eq, desc } from "drizzle-orm";
import { events } from "../../db/schema.js";
import { getDatabase } from "../storage/sqlite.js";
import { ensureSessionDir } from "../session/session.utils.js";
import { getEventsJsonlPath } from "./event.utils.js";
import type { TraceEvent, EventType } from "./event.types.js";

function rowToEvent(row: typeof events.$inferSelect): TraceEvent {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    // corrupted payload — use empty
  }

  return {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type as EventType,
    payload,
    createdAt: row.createdAt,
  };
}

export class EventRepository {
  private get db() {
    return getDatabase();
  }

  async append(event: TraceEvent): Promise<TraceEvent> {
    this.persistToSqlite(event);
    this.appendToJsonl(event);
    return event;
  }

  async getBySession(sessionId: string): Promise<TraceEvent[]> {
    const rows = this.db
      .select()
      .from(events)
      .where(eq(events.sessionId, sessionId))
      .orderBy(events.createdAt)
      .all();

    return rows.map(rowToEvent);
  }

  async getByType(type: EventType): Promise<TraceEvent[]> {
    const rows = this.db
      .select()
      .from(events)
      .where(eq(events.type, type))
      .orderBy(desc(events.createdAt))
      .all();

    return rows.map(rowToEvent);
  }

  async getAll(): Promise<TraceEvent[]> {
    const rows = this.db
      .select()
      .from(events)
      .orderBy(desc(events.createdAt))
      .all();

    return rows.map(rowToEvent);
  }

  private persistToSqlite(event: TraceEvent): void {
    this.db
      .insert(events)
      .values({
        id: event.id,
        sessionId: event.sessionId,
        type: event.type,
        payload: JSON.stringify(event.payload),
        createdAt: event.createdAt,
      })
      .run();
  }

  private appendToJsonl(event: TraceEvent): void {
    ensureSessionDir(event.sessionId);
    const jsonlPath = getEventsJsonlPath(event.sessionId);

    const line = JSON.stringify({
      id: event.id,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    });

    fs.appendFileSync(jsonlPath, line + "\n", "utf-8");
  }
}
