export type EventType =
  | "SESSION_STARTED"
  | "SESSION_RESUMED"
  | "SESSION_ENDED"
  | "CLAUDE_LAUNCHED"
  | "CLAUDE_EXITED"
  | "FILES_CHANGED"
  | "GIT_DIFF_CAPTURED"
  | "COMMIT_CREATED"
  | "GIT_BRANCH_CHANGED"
  | "PROMPT_CAPTURED"
  | "PROMPT_CORRELATED";

export interface TraceEvent {
  id: string;
  sessionId: string;
  type: EventType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface TraceEventRecord {
  id: string;
  sessionId: string;
  type: string;
  payload: string;
  createdAt: Date;
}

export interface CreateEventInput {
  sessionId: string;
  type: EventType;
  payload?: Record<string, unknown>;
}
