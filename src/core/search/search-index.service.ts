import { getRawConnection } from "../storage/sqlite.js";
import type { IndexEntry, MatchSource } from "./search.types.js";

export class SearchIndexService {
  ensureFTS(): void {
    const conn = getRawConnection();
    if (!conn) return;

    conn.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        session_id,
        source,
        text,
        timestamp UNINDEXED,
        tokenize='porter unicode61'
      );
    `);
  }

  rebuild(): number {
    const conn = getRawConnection();
    if (!conn) return 0;

    this.ensureFTS();

    conn.exec("DELETE FROM search_index");

    let count = 0;

    const sessions = conn
      .prepare("SELECT id, name, repo_path, git_branch, created_at FROM sessions")
      .all() as { id: string; name: string; repo_path: string; git_branch: string; created_at: number }[];

    const insert = conn.prepare(
      "INSERT INTO search_index(session_id, source, text, timestamp) VALUES (?, ?, ?, ?)",
    );

    const txn = conn.transaction(() => {
      for (const s of sessions) {
        const repoName = s.repo_path.split("/").pop() || s.repo_path;

        insert.run(s.id, "session_name", s.name, s.created_at);
        insert.run(s.id, "repo_name", repoName, s.created_at);
        insert.run(s.id, "branch_name", s.git_branch, s.created_at);
        count += 3;

        const prompts = conn
          .prepare("SELECT content, created_at FROM prompts WHERE session_id = ?")
          .all(s.id) as { content: string; created_at: number }[];

        for (const p of prompts) {
          const indexable = p.content.length > 500 ? p.content.slice(0, 500) : p.content;
          insert.run(s.id, "prompt", indexable, p.created_at);
          count++;
        }

        const events = conn
          .prepare("SELECT payload, created_at FROM events WHERE session_id = ? AND type = 'COMMIT_CREATED'")
          .all(s.id) as { payload: string; created_at: number }[];

        for (const e of events) {
          try {
            const payload = JSON.parse(e.payload);
            if (payload.message) {
              insert.run(s.id, "commit_message", payload.message, e.created_at);
              count++;
            }
          } catch { /* */ }
        }

        const fileEvents = conn
          .prepare("SELECT payload, created_at FROM events WHERE session_id = ? AND type = 'FILES_CHANGED'")
          .all(s.id) as { payload: string; created_at: number }[];

        for (const e of fileEvents) {
          try {
            const payload = JSON.parse(e.payload);
            const files = [
              ...((payload.created as string[]) || []),
              ...((payload.modified as string[]) || []),
            ];
            for (const f of files) {
              insert.run(s.id, "file_path", f, e.created_at);
              count++;
            }
          } catch { /* */ }
        }
      }
    });

    txn();
    return count;
  }

  search(query: string, limit = 50): IndexEntry[] {
    const conn = getRawConnection();
    if (!conn) return [];

    this.ensureFTS();

    const ftsQuery = this.buildFTSQuery(query);
    if (!ftsQuery) return [];

    try {
      const rows = conn
        .prepare(`
          SELECT session_id, source, text, timestamp,
                 rank
          FROM search_index
          WHERE search_index MATCH ?
          ORDER BY rank
          LIMIT ?
        `)
        .all(ftsQuery, limit) as {
          session_id: string;
          source: string;
          text: string;
          timestamp: number;
          rank: number;
        }[];

      return rows.map((r) => ({
        sessionId: r.session_id,
        source: r.source as MatchSource,
        text: r.text,
        timestamp: r.timestamp,
      }));
    } catch {
      return this.fallbackSearch(query, limit);
    }
  }

  private buildFTSQuery(query: string): string {
    const tokens = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);

    if (tokens.length === 0) return "";

    if (tokens.length === 1) return `"${tokens[0]}" OR ${tokens[0]}*`;

    const parts = tokens.map((t) => `${t}*`);
    const phrase = `"${tokens.join(" ")}"`;
    return `${phrase} OR (${parts.join(" OR ")})`;
  }

  private fallbackSearch(query: string, limit: number): IndexEntry[] {
    const conn = getRawConnection();
    if (!conn) return [];

    const pattern = `%${query.toLowerCase()}%`;

    const rows = conn
      .prepare(`
        SELECT session_id, source, text, timestamp
        FROM search_index
        WHERE lower(text) LIKE ?
        LIMIT ?
      `)
      .all(pattern, limit) as {
        session_id: string;
        source: string;
        text: string;
        timestamp: number;
      }[];

    return rows.map((r) => ({
      sessionId: r.session_id,
      source: r.source as MatchSource,
      text: r.text,
      timestamp: r.timestamp,
    }));
  }
}
