import { Command } from "commander";
import chalk from "chalk";
import { SessionService } from "../../core/session/session.service.js";
import { DiffService } from "../../core/repository/diff.service.js";
import { formatEventTime } from "../../core/events/event.utils.js";
import { closeDatabase } from "../../core/storage/sqlite.js";

export function createDiffCommand(): Command {
  const cmd = new Command("diff")
    .description("Show captured diff snapshots for a session")
    .argument("<session-id>", "Session ID to show diffs for")
    .action(async (sessionId: string) => {
      try {
        const sessionService = new SessionService();
        const session = await sessionService.getSession(sessionId);

        if (!session) {
          console.error(chalk.red(`\n Error: Session "${sessionId}" not found.\n`));
          process.exit(1);
        }

        const diffService = new DiffService();
        const snapshots = await diffService.getBySession(sessionId);

        if (snapshots.length === 0) {
          console.log(chalk.gray(`\n No diffs captured for session ${sessionId}.\n`));
          return;
        }

        console.log();
        console.log(
          chalk.bold(" Diff Snapshots") +
            chalk.gray(` — ${session.name} (${sessionId})`)
        );
        console.log(chalk.gray("─".repeat(64)));

        let totalIns = 0;
        let totalDel = 0;

        for (const snap of snapshots) {
          totalIns += snap.insertions;
          totalDel += snap.deletions;

          const time = formatEventTime(snap.createdAt);

          console.log();
          console.log(
            ` ${chalk.gray(time)}  ${chalk.magenta("±")} ${chalk.white(snap.id)}` +
              chalk.gray(` · ${snap.branch}`)
          );
          console.log(
            chalk.gray("           ") +
              chalk.green(`+${snap.insertions}`) +
              chalk.gray(" / ") +
              chalk.red(`-${snap.deletions}`) +
              chalk.gray(` · ${snap.filesChanged.length} files`)
          );

          for (const file of snap.filesChanged) {
            console.log(chalk.gray(`           ${file}`));
          }
        }

        console.log();
        console.log(chalk.gray("─".repeat(64)));
        console.log(
          chalk.gray(
            ` ${snapshots.length} snapshots · ` +
              `${chalk.green(`+${totalIns}`)} / ${chalk.red(`-${totalDel}`)} total`
          )
        );
        console.log();
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
