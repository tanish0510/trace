export interface ClaudeLaunchOptions {
  sessionId: string;
  repoPath: string;
  args?: string[];
  resumeId?: string;
}

export interface ClaudeLaunchResult {
  exitCode: number | null;
  claudeSessionId: string | null;
}
