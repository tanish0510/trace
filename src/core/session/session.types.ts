export type SessionStatus = "ACTIVE" | "PAUSED" | "ENDED";
export type SessionTool = "CLAUDE";

export interface Session {
  id: string;
  name: string;
  repoPath: string;
  gitBranch: string;
  createdAt: Date;
  updatedAt: Date;
  status: SessionStatus;
  tool: SessionTool;
  claudeSessionId: string | null;
}

export interface CreateSessionInput {
  repoPath: string;
  gitBranch: string;
  tool: SessionTool;
  name?: string;
}

export interface SessionMetadata {
  id: string;
  name: string;
  repoPath: string;
  gitBranch: string;
  status: SessionStatus;
  tool: SessionTool;
  claudeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}
