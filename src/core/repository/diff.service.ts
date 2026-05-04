import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { diffs } from "../../db/schema.js";
import { getDatabase } from "../storage/sqlite.js";
import { ensureSessionDir, getTraceHome } from "../session/session.utils.js";
import type { DiffSnapshot } from "./repository.types.js";

function generateDiffId(): string {
  return `diff_${randomBytes(6).toString("hex").slice(0, 8)}`;
}

export class DiffService {
  private get db() {
    return getDatabase();
  }

  async capture(
    sessionId: string,
    branch: string,
    filesChanged: string[],
    insertions: number,
    deletions: number,
    diffPatch: string,
  ): Promise<DiffSnapshot> {
    const snapshot: DiffSnapshot = {
      id: generateDiffId(),
      sessionId,
      branch,
      filesChanged,
      insertions,
      deletions,
      diffPatch,
      createdAt: new Date(),
    };

    this.persistToSqlite(snapshot);
    this.persistToFilesystem(snapshot);

    return snapshot;
  }

  async getBySession(sessionId: string): Promise<DiffSnapshot[]> {
    const rows = this.db
      .select()
      .from(diffs)
      .where(eq(diffs.sessionId, sessionId))
      .orderBy(diffs.createdAt)
      .all();

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      branch: row.branch,
      filesChanged: JSON.parse(row.filesChanged) as string[],
      insertions: row.insertions,
      deletions: row.deletions,
      diffPatch: row.diffPatch,
      createdAt: row.createdAt,
    }));
  }

  private persistToSqlite(snapshot: DiffSnapshot): void {
    this.db
      .insert(diffs)
      .values({
        id: snapshot.id,
        sessionId: snapshot.sessionId,
        branch: snapshot.branch,
        filesChanged: JSON.stringify(snapshot.filesChanged),
        insertions: snapshot.insertions,
        deletions: snapshot.deletions,
        diffPatch: snapshot.diffPatch,
        createdAt: snapshot.createdAt,
      })
      .run();
  }

  private persistToFilesystem(snapshot: DiffSnapshot): void {
    const sessionDir = ensureSessionDir(snapshot.sessionId);
    const diffsDir = path.join(sessionDir, "diffs");

    if (!fs.existsSync(diffsDir)) {
      fs.mkdirSync(diffsDir, { recursive: true });
    }

    const filename = `${snapshot.id}.json`;
    const data = {
      id: snapshot.id,
      branch: snapshot.branch,
      filesChanged: snapshot.filesChanged,
      insertions: snapshot.insertions,
      deletions: snapshot.deletions,
      createdAt: snapshot.createdAt.toISOString(),
      patch: snapshot.diffPatch,
    };

    fs.writeFileSync(
      path.join(diffsDir, filename),
      JSON.stringify(data, null, 2) + "\n",
      "utf-8",
    );
  }
}
