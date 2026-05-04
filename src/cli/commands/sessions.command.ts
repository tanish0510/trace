import { Command } from "commander";
import path from "node:path";
import chalk from "chalk";
import { SessionService } from "../../core/session/session.service.js";
import { closeDatabase } from "../../core/storage/sqlite.js";

function statusColor(status: string): string {
  switch (status) {
    case "ACTIVE":
      return chalk.green(status);
    case "PAUSED":
      return chalk.yellow(status);
    case "ENDED":
      return chalk.gray(status);
    default:
      return status;
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortenPath(repoPath: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home && repoPath.startsWith(home)) {
    return "~" + repoPath.slice(home.length);
  }
  return repoPath;
}

function padEnd(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len - 1) + "…";
  return str + " ".repeat(len - str.length);
}

export function createSessionsCommand(): Command {
  const cmd = new Command("sessions")
    .description("List all Trace sessions")
    .action(async () => {
      try {
        const sessionService = new SessionService();
        const sessions = await sessionService.listSessions();

        if (sessions.length === 0) {
          console.log(chalk.gray("No sessions found."));
          console.log(
            chalk.gray("Start one with: ") + chalk.cyan("trc claude")
          );
          return;
        }

        console.log();
        console.log(chalk.bold(" Recent Sessions"));
        console.log(chalk.gray("─".repeat(100)));
        console.log(
          chalk.gray(
            ` ${padEnd("ID", 12)} ${padEnd("REPO", 28)} ${padEnd("BRANCH", 24)} ${padEnd("STATUS", 10)} ${padEnd("CREATED", 16)}`
          )
        );
        console.log(chalk.gray("─".repeat(100)));

        const sorted = [...sessions].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );

        for (const session of sorted) {
          const id = padEnd(session.id, 12);
          const repo = padEnd(path.basename(session.repoPath) || shortenPath(session.repoPath), 28);
          const branch = padEnd(session.gitBranch, 24);
          const status = statusColor(session.status) + " ".repeat(Math.max(0, 10 - session.status.length));
          const created = formatDate(session.createdAt);

          console.log(
            ` ${chalk.white(id)} ${chalk.cyan(repo)} ${chalk.yellow(branch)} ${status} ${chalk.gray(created)}`
          );
          console.log(
            chalk.gray(`              ${shortenPath(session.repoPath)}`)
          );
        }

        console.log(chalk.gray("─".repeat(100)));
        console.log(chalk.gray(` ${sessions.length} sessions`));
        console.log();
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
