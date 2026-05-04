import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema.js";
import { ensureTraceDir } from "../session/session.utils.js";
import path from "node:path";

let db: ReturnType<typeof drizzle> | null = null;
let sqliteConn: Database.Database | null = null;

export function getTraceDatabasePath(): string {
  const traceDir = ensureTraceDir();
  return path.join(traceDir, "trace.db");
}

export function getDatabase() {
  if (db) return db;

  const dbPath = getTraceDatabasePath();
  sqliteConn = new Database(dbPath);
  sqliteConn.pragma("journal_mode = WAL");
  sqliteConn.pragma("foreign_keys = ON");

  db = drizzle(sqliteConn, { schema });
  runMigrations(sqliteConn);

  return db;
}

function runMigrations(conn: Database.Database): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_path TEXT NOT NULL,
      git_branch TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'PAUSED', 'ENDED')),
      tool TEXT NOT NULL CHECK(tool IN ('CLAUDE')),
      claude_session_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  conn.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
  `);

  conn.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
  `);

  conn.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  `);

  conn.exec(`
    CREATE TABLE IF NOT EXISTS diffs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      files_changed TEXT NOT NULL DEFAULT '[]',
      insertions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      diff_patch TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);

  conn.exec(`
    CREATE INDEX IF NOT EXISTS idx_diffs_session_id ON diffs(session_id);
  `);

  conn.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  conn.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompts_session_id ON prompts(session_id);
  `);

  conn.exec(`
    CREATE TABLE IF NOT EXISTS prompt_correlations (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      event_id TEXT,
      diff_id TEXT,
      commit_hash TEXT,
      file_path TEXT,
      confidence_score INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT ''
    );
  `);

  conn.exec(`
    CREATE INDEX IF NOT EXISTS idx_correlations_prompt_id ON prompt_correlations(prompt_id);
  `);

  const sessionCols = conn.pragma("table_info(sessions)") as Array<{ name: string }>;
  if (!sessionCols.some((c) => c.name === "claude_session_id")) {
    conn.exec(`ALTER TABLE sessions ADD COLUMN claude_session_id TEXT;`);
  }

  const promptCols = conn.pragma("table_info(prompts)") as Array<{ name: string }>;
  if (!promptCols.some((c) => c.name === "content_hash")) {
    conn.exec(`ALTER TABLE prompts ADD COLUMN content_hash TEXT;`);
    conn.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_dedup ON prompts(session_id, content_hash);`);
  }
}

export function getRawConnection(): Database.Database | null {
  if (!sqliteConn) getDatabase();
  return sqliteConn;
}

export function closeDatabase(): void {
  if (sqliteConn) {
    try {
      sqliteConn.pragma("wal_checkpoint(TRUNCATE)");
    } catch { /* best-effort checkpoint */ }
    sqliteConn.close();
    sqliteConn = null;
    db = null;
  }
}
