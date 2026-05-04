import { getRawConnection } from "../storage/sqlite.js";
import type { SessionMeta } from "./relevance-scorer.service.js";
import type { IndexEntry, MatchSource, RecentActivity } from "./search.types.js";

export class RetrievalService {
  getSessionMeta(): Map<string, SessionMeta> {
    const conn = getRawConnection();
    if (!conn) return new Map();

    const sessions = conn
      .prepare("SELECT id, name, repo_path, git_branch, status, claude_session_id, created_at FROM sessions ORDER BY created_at DESC")
      .all() as {
        id: string; name: string; repo_path: string; git_branch: string;
        status: string; claude_session_id: string | null; created_at: number;
      }[];

    const map = new Map<string, SessionMeta>();

    for (const s of sessions) {
      const promptCount = (conn
        .prepare("SELECT COUNT(*) as cnt FROM prompts WHERE session_id = ?")
        .get(s.id) as { cnt: number }).cnt;

      const commitCount = (conn
        .prepare("SELECT COUNT(*) as cnt FROM events WHERE session_id = ? AND type = 'COMMIT_CREATED'")
        .get(s.id) as { cnt: number }).cnt;

      const fileCount = (conn
        .prepare("SELECT COUNT(*) as cnt FROM events WHERE session_id = ? AND type = 'FILES_CHANGED'")
        .get(s.id) as { cnt: number }).cnt;

      map.set(s.id, {
        sessionId: s.id,
        sessionName: s.name,
        repoPath: s.repo_path,
        repoName: s.repo_path.split("/").pop() || s.repo_path,
        branch: s.git_branch,
        status: s.status,
        createdAt: s.created_at,
        promptCount,
        commitCount,
        fileCount,
        claudeSessionId: s.claude_session_id,
      });
    }

    return map;
  }

  directSearch(query: string): IndexEntry[] {
    const conn = getRawConnection();
    if (!conn) return [];

    const pattern = `%${query.toLowerCase()}%`;
    const results: IndexEntry[] = [];

    const prompts = conn
      .prepare("SELECT session_id, content, created_at FROM prompts WHERE lower(content) LIKE ? AND length(content) < 2000 LIMIT 100")
      .all(pattern) as { session_id: string; content: string; created_at: number }[];

    for (const p of prompts) {
      results.push({
        sessionId: p.session_id,
        source: "prompt" as MatchSource,
        text: p.content,
        timestamp: p.created_at,
      });
    }

    const sessions = conn
      .prepare("SELECT id, name, repo_path, git_branch, created_at FROM sessions WHERE lower(name) LIKE ? OR lower(repo_path) LIKE ? OR lower(git_branch) LIKE ? LIMIT 50")
      .all(pattern, pattern, pattern) as {
        id: string; name: string; repo_path: string; git_branch: string; created_at: number;
      }[];

    for (const s of sessions) {
      if (s.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({ sessionId: s.id, source: "session_name", text: s.name, timestamp: s.created_at });
      }
      const repoName = s.repo_path.split("/").pop() || "";
      if (repoName.toLowerCase().includes(query.toLowerCase())) {
        results.push({ sessionId: s.id, source: "repo_name", text: repoName, timestamp: s.created_at });
      }
      if (s.git_branch.toLowerCase().includes(query.toLowerCase())) {
        results.push({ sessionId: s.id, source: "branch_name", text: s.git_branch, timestamp: s.created_at });
      }
    }

    const commitEvents = conn
      .prepare("SELECT session_id, payload, created_at FROM events WHERE type = 'COMMIT_CREATED' AND lower(payload) LIKE ? LIMIT 50")
      .all(pattern) as { session_id: string; payload: string; created_at: number }[];

    for (const e of commitEvents) {
      try {
        const payload = JSON.parse(e.payload);
        if (payload.message) {
          results.push({
            sessionId: e.session_id,
            source: "commit_message",
            text: payload.message,
            timestamp: e.created_at,
          });
        }
      } catch { /* */ }
    }

    return results;
  }

  getRecentActivity(limit = 10): RecentActivity[] {
    const conn = getRawConnection();
    if (!conn) return [];

    const sessions = conn
      .prepare("SELECT id, name, repo_path, git_branch, status, created_at FROM sessions ORDER BY created_at DESC LIMIT ?")
      .all(limit) as {
        id: string; name: string; repo_path: string; git_branch: string;
        status: string; created_at: number;
      }[];

    return sessions.map((s) => {
      const promptCount = (conn
        .prepare("SELECT COUNT(*) as cnt FROM prompts WHERE session_id = ?")
        .get(s.id) as { cnt: number }).cnt;

      const commitCount = (conn
        .prepare("SELECT COUNT(*) as cnt FROM events WHERE session_id = ? AND type = 'COMMIT_CREATED'")
        .get(s.id) as { cnt: number }).cnt;

      const topPrompt = conn
        .prepare("SELECT content FROM prompts WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(s.id) as { content: string } | undefined;

      return {
        sessionId: s.id,
        sessionName: s.name,
        repoName: s.repo_path.split("/").pop() || s.repo_path,
        repoPath: s.repo_path,
        branch: s.git_branch,
        status: s.status,
        lastActive: new Date(typeof s.created_at === "number" && s.created_at < 1e12 ? s.created_at * 1000 : s.created_at),
        promptCount,
        commitCount,
        topPrompt: topPrompt?.content ?? null,
      };
    });
  }
}
