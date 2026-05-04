import { EventRepository } from "./event.repository.js";
import { generateEventId } from "./event.utils.js";
import type { TraceEvent, EventType, CreateEventInput } from "./event.types.js";

export class EventService {
  private repository = new EventRepository();

  async emit(input: CreateEventInput): Promise<TraceEvent> {
    const event: TraceEvent = {
      id: generateEventId(),
      sessionId: input.sessionId,
      type: input.type,
      payload: input.payload || {},
      createdAt: new Date(),
    };

    return this.repository.append(event);
  }

  async sessionStarted(
    sessionId: string,
    payload: Record<string, unknown> = {},
  ): Promise<TraceEvent> {
    return this.emit({ sessionId, type: "SESSION_STARTED", payload });
  }

  async sessionResumed(
    sessionId: string,
    payload: Record<string, unknown> = {},
  ): Promise<TraceEvent> {
    return this.emit({ sessionId, type: "SESSION_RESUMED", payload });
  }

  async sessionEnded(
    sessionId: string,
    payload: Record<string, unknown> = {},
  ): Promise<TraceEvent> {
    return this.emit({ sessionId, type: "SESSION_ENDED", payload });
  }

  async claudeLaunched(
    sessionId: string,
    payload: Record<string, unknown> = {},
  ): Promise<TraceEvent> {
    return this.emit({ sessionId, type: "CLAUDE_LAUNCHED", payload });
  }

  async claudeExited(
    sessionId: string,
    payload: Record<string, unknown> = {},
  ): Promise<TraceEvent> {
    return this.emit({ sessionId, type: "CLAUDE_EXITED", payload });
  }

  async getSessionEvents(sessionId: string): Promise<TraceEvent[]> {
    return this.repository.getBySession(sessionId);
  }

  async getEventsByType(type: EventType): Promise<TraceEvent[]> {
    return this.repository.getByType(type);
  }

  async getRecentEvents(): Promise<TraceEvent[]> {
    return this.repository.getAll();
  }
}
