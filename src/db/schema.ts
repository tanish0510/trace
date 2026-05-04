import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repoPath: text("repo_path").notNull(),
  gitBranch: text("git_branch").notNull(),
  status: text("status", { enum: ["ACTIVE", "PAUSED", "ENDED"] }).notNull(),
  tool: text("tool", { enum: ["CLAUDE"] }).notNull(),
  claudeSessionId: text("claude_session_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const diffs = sqliteTable("diffs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  branch: text("branch").notNull(),
  filesChanged: text("files_changed").notNull(),
  insertions: integer("insertions").notNull(),
  deletions: integer("deletions").notNull(),
  diffPatch: text("diff_patch").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const prompts = sqliteTable("prompts", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const promptCorrelations = sqliteTable("prompt_correlations", {
  id: text("id").primaryKey(),
  promptId: text("prompt_id").notNull(),
  eventId: text("event_id"),
  diffId: text("diff_id"),
  commitHash: text("commit_hash"),
  filePath: text("file_path"),
  confidenceScore: integer("confidence_score").notNull(),
  reason: text("reason").notNull(),
});
