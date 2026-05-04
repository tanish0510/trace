import type { TraceEvent } from "../../events/event.types.js";
import type { DiffSnapshot } from "../../repository/repository.types.js";

export interface ActivityWindow {
  startTime: Date;
  endTime: Date;
  events: TraceEvent[];
  diffs: DiffSnapshot[];
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  insertions: number;
  deletions: number;
}

export interface EngineeringBlock {
  id: string;
  intent: string;
  domain: string;
  startTime: Date;
  endTime: Date;
  duration: string;
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  insertions: number;
  deletions: number;
  commits: CommitSummary[];
  branchChanges: BranchChange[];
  toolEvents: ToolEvent[];
}

export interface CommitSummary {
  hash: string;
  message: string;
  branch: string;
  timestamp: Date;
}

export interface BranchChange {
  from: string;
  to: string;
  timestamp: Date;
}

export interface ToolEvent {
  kind: "launched" | "exited";
  tool: string;
  timestamp: Date;
  exitCode?: number;
}

export interface Chapter {
  number: number;
  title: string;
  blocks: EngineeringBlock[];
  startTime: Date;
  endTime: Date;
  duration: string;
  summary: ChapterSummary;
}

export interface ChapterSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  commits: number;
}

export interface StoryReplaySummary {
  sessionName: string;
  sessionId: string;
  branch: string;
  repoPath: string;
  duration: string;
  chapters: number;
  commits: number;
  filesChanged: number;
  insertions: number;
  deletions: number;
  primaryFocus: string;
  largestFile: string | null;
}
