export interface SearchResult {
  sessionId: string;
  sessionName: string;
  repoName: string;
  repoPath: string;
  branch: string;
  status: string;
  score: number;
  matchedSource: MatchSource;
  matchedText: string;
  promptCount: number;
  commitCount: number;
  fileCount: number;
  lastActive: Date;
  claudeSessionId: string | null;
}

export type MatchSource =
  | "prompt"
  | "commit_message"
  | "branch_name"
  | "session_name"
  | "repo_name"
  | "file_path";

export interface SearchQuery {
  raw: string;
  tokens: string[];
  stems: string[];
  currentRepoPath: string | null;
  currentBranch: string | null;
}

export interface IndexEntry {
  sessionId: string;
  source: MatchSource;
  text: string;
  timestamp: number;
}

export interface RecentActivity {
  sessionId: string;
  sessionName: string;
  repoName: string;
  repoPath: string;
  branch: string;
  status: string;
  lastActive: Date;
  promptCount: number;
  commitCount: number;
  topPrompt: string | null;
}
