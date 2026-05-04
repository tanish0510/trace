export interface FileChange {
  filePath: string;
  changeType: "modified" | "created" | "deleted" | "renamed";
}

export interface DiffSnapshot {
  id: string;
  sessionId: string;
  branch: string;
  filesChanged: string[];
  insertions: number;
  deletions: number;
  diffPatch: string;
  createdAt: Date;
}

export interface CommitInfo {
  hash: string;
  message: string;
  branch: string;
  author: string;
  timestamp: Date;
}

export interface GitStatus {
  branch: string;
  modified: string[];
  created: string[];
  deleted: string[];
  renamed: string[];
  staged: string[];
}

export interface WatcherConfig {
  repoPath: string;
  sessionId: string;
  ignored: string[];
  debounceMs: number;
}

export const DEFAULT_IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.trace/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/out/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/*.pyc",
  "**/target/**",
  "**/.DS_Store",
  "**/*.swp",
  "**/*.swo",
  "**/*~",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
  "**/.env",
  "**/.env.*",
];

export const DEFAULT_DEBOUNCE_MS = 1000;
