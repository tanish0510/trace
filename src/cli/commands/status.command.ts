import { Command } from "commander";
import chalk from "chalk";
import { SessionService } from "../../core/session/session.service.js";
import { closeDatabase } from "../../core/storage/sqlite.js";

export function createStatusCommand(): Command {
  const cmd = new Command("status")
    .description("Show current Trace status")
    .action(async () => {
      try {
        const sessionService = new SessionService();
        const current = await sessionService.getCurrentSession();

        console.log();

        if (!current) {
          console.log(chalk.gray(" No active session."));
          console.log(
            chalk.gray(" Start one with: ") + chalk.cyan("trc claude")
          );
          console.log();
          return;
        }

        console.log(chalk.bold(" Current Session:"));
        console.log(chalk.white(` ${current.name}`));
        console.log();
        console.log(chalk.bold(" Tool:"));
        console.log(chalk.white(` ${current.tool}`));
        console.log();
        console.log(chalk.bold(" Status:"));
        console.log(chalk.green(` ${current.status}`));
        console.log();
        console.log(chalk.bold(" Directory:"));
        console.log(chalk.white(` ${current.repoPath}`));
        console.log();
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
