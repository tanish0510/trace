export type ContextMode = "recent" | "replay" | "scoped";

export interface RepositoryIdentity {
  id: string;
  name: string;
  path: string;
  gitRemote: string | null;
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContextPack {
  repoName: string;
  branch: string;
  mode: ContextMode;
  focus: string | null;
  generatedAt: Date;
  sections: ContextSection[];
}

export interface ContextSection {
  title: string;
  items: string[];
}

export interface RelevanceScore {
  file: string;
  score: number;
  reasons: string[];
}

export interface ContextConfig {
  mode: ContextMode;
  focus: string | null;
  repoPath: string;
  branch: string;
}
