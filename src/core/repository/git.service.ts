import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import type { GitStatus, CommitInfo } from "./repository.types.js";

export class GitService {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.revparse(["--git-dir"]);
      return true;
    } catch {
      return false;
    }
  }

  async getBranch(): Promise<string> {
    try {
      const branch = await this.git.revparse(["--abbrev-ref", "HEAD"]);
      return branch.trim() || "unknown";
    } catch {
      return "unknown";
    }
  }

  async getStatus(): Promise<GitStatus> {
    try {
      const status: StatusResult = await this.git.status();

      return {
        branch: status.current || "unknown",
        modified: status.modified,
        created: status.not_added.concat(status.created),
        deleted: status.deleted,
        renamed: status.renamed.map((r) => r.to),
        staged: status.staged,
      };
    } catch {
      return {
        branch: "unknown",
        modified: [],
        created: [],
        deleted: [],
        renamed: [],
        staged: [],
      };
    }
  }

  async getDiff(): Promise<string> {
    try {
      const diff = await this.git.diff();
      return diff;
    } catch {
      return "";
    }
  }

  async getDiffStat(): Promise<{ insertions: number; deletions: number; files: string[] }> {
    try {
      const summary = await this.git.diffSummary();
      return {
        insertions: summary.insertions,
        deletions: summary.deletions,
        files: summary.files.map((f) => f.file),
      };
    } catch {
      return { insertions: 0, deletions: 0, files: [] };
    }
  }

  async getRecentCommits(since: Date): Promise<CommitInfo[]> {
    try {
      const raw = await this.git.raw([
        "log",
        `--since=${since.toISOString()}`,
        "--format=%H%n%s%n%an%n%aI",
      ]);

      if (!raw.trim()) return [];

      const lines = raw.trim().split("\n");
      const branch = await this.getBranch();
      const commits: CommitInfo[] = [];

      for (let i = 0; i + 3 < lines.length; i += 4) {
        commits.push({
          hash: lines[i]!,
          message: lines[i + 1]!,
          author: lines[i + 2]!,
          branch,
          timestamp: new Date(lines[i + 3]!),
        });
      }

      return commits;
    } catch {
      return [];
    }
  }

  async getLastCommitHash(): Promise<string | null> {
    try {
      const log = await this.git.log({ "-1": null });
      return log.latest?.hash || null;
    } catch {
      return null;
    }
  }
}
