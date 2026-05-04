import type { TraceEvent } from "../events/event.types.js";
import type { DiffSnapshot } from "../repository/repository.types.js";
import type { Session } from "../session/session.types.js";

export type ReplayMode = "story" | "chapters" | "focus" | "timeline" | "diff" | "commits";
export type ReplaySpeed = "slow" | "normal" | "fast";

export interface ReplayConfig {
  sessionId: string;
  mode: ReplayMode;
  speed: ReplaySpeed;
  showPatches: boolean;
  focus?: string;
  promptId?: string;
}

export interface ReplaySession {
  session: Session;
  events: TraceEvent[];
  diffs: DiffSnapshot[];
}

export interface TimelineEntry {
  timestamp: Date;
  kind: "session" | "tool" | "files" | "diff" | "commit" | "branch";
  label: string;
  details: string[];
}

export interface ReplaySummary {
  sessionName: string;
  sessionId: string;
  branch: string;
  repoPath: string;
  duration: string;
  eventCount: number;
  filesModified: number;
  filesCreated: number;
  filesDeleted: number;
  commitCount: number;
  diffCount: number;
  totalInsertions: number;
  totalDeletions: number;
}

export interface ReplaySpeedConfig {
  sessionDelayMs: number;
  toolDelayMs: number;
  fileDelayMs: number;
  diffDelayMs: number;
  commitDelayMs: number;
  branchDelayMs: number;
}

export const SPEED_CONFIGS: Record<ReplaySpeed, ReplaySpeedConfig> = {
  slow: {
    sessionDelayMs: 1200,
    toolDelayMs: 800,
    fileDelayMs: 600,
    diffDelayMs: 1000,
    commitDelayMs: 1000,
    branchDelayMs: 800,
  },
  normal: {
    sessionDelayMs: 600,
    toolDelayMs: 400,
    fileDelayMs: 300,
    diffDelayMs: 500,
    commitDelayMs: 500,
    branchDelayMs: 400,
  },
  fast: {
    sessionDelayMs: 150,
    toolDelayMs: 100,
    fileDelayMs: 50,
    diffDelayMs: 150,
    commitDelayMs: 150,
    branchDelayMs: 100,
  },
};
