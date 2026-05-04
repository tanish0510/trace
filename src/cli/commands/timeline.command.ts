import { Command } from "commander";
import chalk from "chalk";
import { EventService } from "../../core/events/event.service.js";
import { SessionService } from "../../core/session/session.service.js";
import { formatEventTime, humanizeEventType } from "../../core/events/event.utils.js";
import { closeDatabase } from "../../core/storage/sqlite.js";
import { truncatePrompt } from "../../core/prompts/prompt.constants.js";
import type { TraceEvent } from "../../core/events/event.types.js";

function eventIcon(type: string): string {
  switch (type) {
    case "SESSION_STARTED":
      return chalk.green("▶");
    case "SESSION_RESUMED":
      return chalk.cyan("↻");
    case "SESSION_ENDED":
      return chalk.red("■");
    case "CLAUDE_LAUNCHED":
      return chalk.blue("⬤");
    case "CLAUDE_EXITED":
      return chalk.gray("○");
    case "FILES_CHANGED":
      return chalk.yellow("✎");
    case "GIT_DIFF_CAPTURED":
      return chalk.magenta("±");
    case "COMMIT_CREATED":
      return chalk.green("✔");
    case "GIT_BRANCH_CHANGED":
      return chalk.cyan("⎇");
    case "PROMPT_CAPTURED":
      return chalk.magenta("◆");
    case "PROMPT_CORRELATED":
      return chalk.magenta("→");
    default:
      return chalk.gray("·");
  }
}

function formatPayloadDetail(event: TraceEvent): string | null {
  const p = event.payload;

  switch (event.type) {
    case "SESSION_STARTED": {
      const parts: string[] = [];
      if (p.gitBranch && p.gitBranch !== "unknown") parts.push(`branch: ${p.gitBranch}`);
      if (p.repoPath) parts.push(`${p.repoPath}`);
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    case "CLAUDE_EXITED": {
      if (p.exitCode !== undefined) return `exit: ${p.exitCode}`;
      return null;
    }
    case "SESSION_RESUMED": {
      return p.claudeSessionId ? `claude: ${(p.claudeSessionId as string).slice(0, 8)}…` : null;
    }
    case "FILES_CHANGED": {
      const files = p.files as string[] | undefined;
      if (!files || files.length === 0) return null;
      if (files.length <= 3) return files.join(", ");
      return `${files.slice(0, 2).join(", ")} +${files.length - 2} more`;
    }
    case "GIT_DIFF_CAPTURED": {
      const parts: string[] = [];
      if (p.insertions) parts.push(chalk.green(`+${p.insertions}`));
      if (p.deletions) parts.push(chalk.red(`-${p.deletions}`));
      const files = p.filesChanged as string[] | undefined;
      if (files && files.length > 0) {
        parts.push(`${files.length} file${files.length > 1 ? "s" : ""}`);
      }
      return parts.length > 0 ? parts.join(" ") : null;
    }
    case "COMMIT_CREATED": {
      const parts: string[] = [];
      if (p.hash) parts.push(chalk.yellow((p.hash as string).slice(0, 7)));
      if (p.message) parts.push(`"${p.message}"`);
      return parts.length > 0 ? parts.join(" ") : null;
    }
    case "GIT_BRANCH_CHANGED": {
      return `${p.previousBranch} → ${p.currentBranch}`;
    }
    case "PROMPT_CAPTURED": {
      return p.content ? `"${truncatePrompt(p.content as string)}"` : null;
    }
    case "PROMPT_CORRELATED": {
      const parts: string[] = [];
      if (p.correlationCount) parts.push(`${p.correlationCount} links`);
      const topFiles = p.topFiles as string[] | undefined;
      if (topFiles && topFiles.length > 0) parts.push(topFiles.slice(0, 3).join(", "));
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    default:
      return null;
  }
}

function formatFileList(event: TraceEvent): string[] | null {
  if (event.type !== "FILES_CHANGED") return null;

  const p = event.payload;
  const lines: string[] = [];

  const created = p.created as string[] | undefined;
  const modified = p.modified as string[] | undefined;
  const deleted = p.deleted as string[] | undefined;

  if (created && created.length > 0) {
    for (const f of created) {
      lines.push(chalk.green(`             + ${f}`));
    }
  }
  if (modified && modified.length > 0) {
    for (const f of modified) {
      lines.push(chalk.yellow(`             ~ ${f}`));
    }
  }
  if (deleted && deleted.length > 0) {
    for (const f of deleted) {
      lines.push(chalk.red(`             - ${f}`));
    }
  }

  return lines.length > 0 ? lines : null;
}

function computeDuration(events: TraceEvent[]): string | null {
  if (events.length < 2) return null;

  const first = events[0]!;
  const last = events[events.length - 1]!;
  const ms = last.createdAt.getTime() - first.createdAt.getTime();

  if (ms < 1000) return "< 1s";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function computeStats(events: TraceEvent[]): { files: number; commits: number; diffs: number } {
  let files = 0;
  let commits = 0;
  let diffs = 0;

  for (const e of events) {
    if (e.type === "FILES_CHANGED") {
      files += (e.payload.count as number) || 0;
    } else if (e.type === "COMMIT_CREATED") {
      commits++;
    } else if (e.type === "GIT_DIFF_CAPTURED") {
      diffs++;
    }
  }

  return { files, commits, diffs };
}

export function createTimelineCommand(): Command {
  const cmd = new Command("timeline")
    .description("Show formatted engineering timeline for a session")
    .argument("<session-id>", "Session ID to show timeline for")
    .action(async (sessionId: string) => {
      try {
        const sessionService = new SessionService();
        const session = await sessionService.getSession(sessionId);

        if (!session) {
          console.error(
            chalk.red(`\n Error: Session "${sessionId}" not found.\n`)
          );
          process.exit(1);
        }

        const eventService = new EventService();
        const events = await eventService.getSessionEvents(sessionId);

        if (events.length === 0) {
          console.log(
            chalk.gray(`\n No events recorded for session ${sessionId}.\n`)
          );
          return;
        }

        console.log();
        console.log(chalk.bold.cyan(" TRACE TIMELINE"));
        console.log(
          chalk.gray(` ${session.name}`) +
            chalk.gray(` · ${sessionId}`)
        );
        console.log(chalk.gray("─".repeat(64)));

        for (const event of events) {
          const time = formatEventTime(event.createdAt);
          const icon = eventIcon(event.type);
          const label = humanizeEventType(event.type);
          const detail = formatPayloadDetail(event);

          let line = ` ${chalk.gray(time)}  ${icon} ${chalk.white(label)}`;
          if (detail) {
            line += chalk.gray(` ${detail}`);
          }
          console.log(line);

          const fileList = formatFileList(event);
          if (fileList) {
            for (const fl of fileList) {
              console.log(fl);
            }
          }
        }

        const duration = computeDuration(events);
        const stats = computeStats(events);
        console.log(chalk.gray("─".repeat(64)));

        const summaryParts: string[] = [];
        if (duration) summaryParts.push(`Duration: ${duration}`);
        summaryParts.push(`${events.length} events`);
        if (stats.files > 0) summaryParts.push(`${stats.files} file changes`);
        if (stats.commits > 0) summaryParts.push(`${stats.commits} commits`);
        if (stats.diffs > 0) summaryParts.push(`${stats.diffs} diffs`);

        console.log(chalk.gray(` ${summaryParts.join(" · ")}`));
        console.log();
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
