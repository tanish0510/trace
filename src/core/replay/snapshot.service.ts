import type { DiffSnapshot } from "../repository/repository.types.js";
import { DiffService } from "../repository/diff.service.js";

const MAX_PATCH_DISPLAY_LINES = 80;

export class SnapshotService {
  private diffService = new DiffService();

  async getSessionDiffs(sessionId: string): Promise<DiffSnapshot[]> {
    return this.diffService.getBySession(sessionId);
  }

  formatPatchSummary(snapshot: DiffSnapshot): string[] {
    const lines: string[] = [];
    lines.push(`${snapshot.id} · ${snapshot.branch}`);
    lines.push(`+${snapshot.insertions} / -${snapshot.deletions} · ${snapshot.filesChanged.length} files`);
    for (const f of snapshot.filesChanged) {
      lines.push(`  ${f}`);
    }
    return lines;
  }

  formatPatchContent(snapshot: DiffSnapshot): string[] {
    if (!snapshot.diffPatch || snapshot.diffPatch.trim().length === 0) {
      return ["(no patch content)"];
    }

    const rawLines = snapshot.diffPatch.split("\n");
    const lines: string[] = [];

    for (const line of rawLines) {
      if (lines.length >= MAX_PATCH_DISPLAY_LINES) {
        const remaining = rawLines.length - lines.length;
        lines.push(`... ${remaining} more lines truncated`);
        break;
      }
      lines.push(line);
    }

    return lines;
  }

  computeDiffStats(diffs: DiffSnapshot[]): {
    totalInsertions: number;
    totalDeletions: number;
    totalFiles: number;
    allFiles: Set<string>;
  } {
    let totalInsertions = 0;
    let totalDeletions = 0;
    const allFiles = new Set<string>();

    for (const d of diffs) {
      totalInsertions += d.insertions;
      totalDeletions += d.deletions;
      for (const f of d.filesChanged) allFiles.add(f);
    }

    return {
      totalInsertions,
      totalDeletions,
      totalFiles: allFiles.size,
      allFiles,
    };
  }
}
