export interface Prompt {
  id: string;
  sessionId: string;
  content: string;
  createdAt: Date;
}

export interface PromptCorrelation {
  id: string;
  promptId: string;
  eventId: string | null;
  diffId: string | null;
  commitHash: string | null;
  filePath: string | null;
  confidenceScore: number;
  reason: string;
}

export interface EngineeringIntent {
  id: string;
  promptId: string;
  title: string;
  relatedFiles: string[];
  relatedCommits: string[];
  relatedEvents: string[];
  confidenceScore: number;
  prompt: Prompt;
}

export interface PromptSummary {
  prompt: Prompt;
  intent: EngineeringIntent;
  affectedFiles: string[];
  commits: { hash: string; message: string }[];
  duration: string | null;
  branch: string;
  correlationCount: number;
}

export interface WhyResult {
  filePath: string;
  prompts: {
    prompt: Prompt;
    confidence: number;
    reason: string;
  }[];
  commits: { hash: string; message: string; branch: string }[];
  relatedFiles: string[];
}
