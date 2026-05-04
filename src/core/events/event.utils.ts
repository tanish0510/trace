import { randomBytes } from "node:crypto";
import path from "node:path";
import { getTraceHome } from "../session/session.utils.js";

export function generateEventId(): string {
  const prefix = "evt_";
  const random = randomBytes(6).toString("hex").slice(0, 8);
  return `${prefix}${random}`;
}

export function getEventsJsonlPath(sessionId: string): string {
  return path.join(getTraceHome(), "sessions", sessionId, "events.jsonl");
}

export function formatEventTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function humanizeEventType(type: string): string {
  switch (type) {
    case "SESSION_STARTED":
      return "Session started";
    case "SESSION_RESUMED":
      return "Session resumed";
    case "SESSION_ENDED":
      return "Session ended";
    case "CLAUDE_LAUNCHED":
      return "Claude launched";
    case "CLAUDE_EXITED":
      return "Claude exited";
    case "FILES_CHANGED":
      return "Files changed";
    case "GIT_DIFF_CAPTURED":
      return "Diff captured";
    case "COMMIT_CREATED":
      return "Commit created";
    case "GIT_BRANCH_CHANGED":
      return "Branch changed";
    case "PROMPT_CAPTURED":
      return "Prompt captured";
    case "PROMPT_CORRELATED":
      return "Prompt correlated";
    default:
      return type.toLowerCase().replace(/_/g, " ");
  }
}
