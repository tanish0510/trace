import { GitService } from "./git.service.js";
import { DiffService } from "./diff.service.js";
import { WatcherService } from "./watcher.service.js";
import { EventService } from "../events/event.service.js";
import { SessionRepository } from "../session/session.repository.js";
import type { FileChange } from "./repository.types.js";

export class RepositoryTrackerService {
  private gitService: GitService;
  private diffService: DiffService;
  private watcherService: WatcherService;
  private eventService: EventService;

  private sessionId: string;
  private repoPath: string;
  private isGit: boolean = false;
  private lastBranch: string = "unknown";
  private lastCommitHash: string | null = null;
  private commitPollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(sessionId: string, repoPath: string) {
    this.sessionId = sessionId;
    this.repoPath = repoPath;
    this.gitService = new GitService(repoPath);
    this.diffService = new DiffService();
    this.eventService = new EventService();
    this.watcherService = new WatcherService({ repoPath, sessionId });
  }

  async start(): Promise<void> {
    this.isGit = await this.gitService.isGitRepo();

    if (this.isGit) {
      this.lastBranch = await this.gitService.getBranch();
      this.lastCommitHash = await this.gitService.getLastCommitHash();
    }

    this.watcherService.start((changes) => {
      this.handleFileChanges(changes).catch(() => {});
    });

    this.commitPollInterval = setInterval(() => {
      this.pollGit().catch(() => {});
    }, 5000);
  }

  private async pollGit(): Promise<void> {
    if (!this.isGit) {
      this.isGit = await this.gitService.isGitRepo();
      if (this.isGit) {
        this.lastBranch = await this.gitService.getBranch();
        this.lastCommitHash = await this.gitService.getLastCommitHash();
        try {
          const sessionRepo = new SessionRepository();
          await sessionRepo.update(this.sessionId, { gitBranch: this.lastBranch });
        } catch { /* best-effort */ }
      }
      return;
    }

    await this.checkForNewCommits();
    await this.checkForBranchChange();
  }

  async stop(): Promise<void> {
    if (this.commitPollInterval) {
      clearInterval(this.commitPollInterval);
      this.commitPollInterval = null;
    }
    await this.watcherService.stop();

    if (!this.isGit) {
      this.isGit = await this.gitService.isGitRepo();
      if (this.isGit) {
        this.lastBranch = await this.gitService.getBranch();
        try {
          const sessionRepo = new SessionRepository();
          await sessionRepo.update(this.sessionId, { gitBranch: this.lastBranch });
        } catch { /* best-effort */ }
      }
    }

    if (this.isGit) {
      await this.captureAllMissedCommits();
      await this.captureFinalDiff();
    }
  }

  private async handleFileChanges(changes: FileChange[]): Promise<void> {
    const modified = changes.filter((c) => c.changeType === "modified");
    const created = changes.filter((c) => c.changeType === "created");
    const deleted = changes.filter((c) => c.changeType === "deleted");

    const payload: Record<string, unknown> = {
      files: changes.map((c) => c.filePath),
      modified: modified.map((c) => c.filePath),
      created: created.map((c) => c.filePath),
      deleted: deleted.map((c) => c.filePath),
      count: changes.length,
    };

    await this.eventService.emit({
      sessionId: this.sessionId,
      type: "FILES_CHANGED",
      payload,
    });

    if (!this.isGit) {
      this.isGit = await this.gitService.isGitRepo();
      if (this.isGit) {
        this.lastBranch = await this.gitService.getBranch();
        this.lastCommitHash = await this.gitService.getLastCommitHash();
      }
    }

    if (this.isGit) {
      await this.captureGitDiff();
    }
  }

  private async captureGitDiff(): Promise<void> {
    const stat = await this.gitService.getDiffStat();

    if (stat.files.length === 0 && stat.insertions === 0 && stat.deletions === 0) {
      return;
    }

    const diffPatch = await this.gitService.getDiff();
    const branch = await this.gitService.getBranch();

    const snapshot = await this.diffService.capture(
      this.sessionId,
      branch,
      stat.files,
      stat.insertions,
      stat.deletions,
      diffPatch,
    );

    await this.eventService.emit({
      sessionId: this.sessionId,
      type: "GIT_DIFF_CAPTURED",
      payload: {
        diffId: snapshot.id,
        filesChanged: stat.files,
        insertions: stat.insertions,
        deletions: stat.deletions,
        branch,
      },
    });
  }

  private async captureFinalDiff(): Promise<void> {
    const stat = await this.gitService.getDiffStat();
    if (stat.files.length === 0 && stat.insertions === 0 && stat.deletions === 0) {
      return;
    }

    const diffPatch = await this.gitService.getDiff();
    const branch = await this.gitService.getBranch();

    await this.diffService.capture(
      this.sessionId,
      branch,
      stat.files,
      stat.insertions,
      stat.deletions,
      diffPatch,
    );

    await this.eventService.emit({
      sessionId: this.sessionId,
      type: "GIT_DIFF_CAPTURED",
      payload: {
        filesChanged: stat.files,
        insertions: stat.insertions,
        deletions: stat.deletions,
        branch,
        final: true,
      },
    });
  }

  private async captureAllMissedCommits(): Promise<void> {
    const branch = await this.gitService.getBranch();
    const since = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const commits = await this.gitService.getRecentCommits(since);

    for (const commit of commits) {
      if (this.lastCommitHash && commit.hash === this.lastCommitHash) continue;

      await this.eventService.emit({
        sessionId: this.sessionId,
        type: "COMMIT_CREATED",
        payload: {
          hash: commit.hash,
          message: commit.message,
          branch,
          author: commit.author,
        },
      });
    }

    const currentHash = await this.gitService.getLastCommitHash();
    if (currentHash) {
      this.lastCommitHash = currentHash;
    }
  }

  private async checkForNewCommits(): Promise<void> {
    const currentHash = await this.gitService.getLastCommitHash();
    if (!currentHash || currentHash === this.lastCommitHash) return;

    const branch = await this.gitService.getBranch();

    const since = new Date(Date.now() - 10_000);
    const commits = await this.gitService.getRecentCommits(since);

    for (const commit of commits) {
      if (commit.hash === this.lastCommitHash) continue;

      await this.eventService.emit({
        sessionId: this.sessionId,
        type: "COMMIT_CREATED",
        payload: {
          hash: commit.hash,
          message: commit.message,
          branch,
          author: commit.author,
        },
      });
    }

    this.lastCommitHash = currentHash;
  }

  private async checkForBranchChange(): Promise<void> {
    const currentBranch = await this.gitService.getBranch();
    if (currentBranch === this.lastBranch) return;

    await this.eventService.emit({
      sessionId: this.sessionId,
      type: "GIT_BRANCH_CHANGED",
      payload: {
        previousBranch: this.lastBranch,
        currentBranch,
      },
    });

    this.lastBranch = currentBranch;

    try {
      const sessionRepo = new SessionRepository();
      await sessionRepo.update(this.sessionId, { gitBranch: currentBranch });
    } catch { /* best-effort */ }
  }
}
