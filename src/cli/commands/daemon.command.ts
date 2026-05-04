import { Command } from "commander";
import chalk from "chalk";
import {
  isDaemonRunning,
  startDaemon,
  stopDaemon,
  getDaemonStatus,
} from "../../core/daemon/daemon.client.js";

export function createDaemonCommand(): Command {
  const cmd = new Command("daemon")
    .description("Manage the Trace background daemon");

  cmd
    .command("status")
    .description("Show daemon status")
    .action(async () => {
      if (!isDaemonRunning()) {
        console.log(chalk.gray("\n Daemon is not running."));
        console.log(chalk.gray(" Start it with: ") + chalk.cyan("trc daemon start\n"));
        return;
      }

      const status = await getDaemonStatus();
      if (!status) {
        console.log(chalk.yellow("\n Daemon PID file exists but cannot connect.\n"));
        return;
      }

      console.log();
      console.log(chalk.bold.cyan(" Trace Daemon"));
      console.log(chalk.gray("─".repeat(48)));
      console.log(chalk.gray(" PID      ") + chalk.white(status.pid));
      console.log(chalk.gray(" Uptime   ") + chalk.white(`${Math.round(status.uptime as number)}s`));
      console.log(chalk.gray(" Tracked  ") + chalk.white(`${(status.tracked as unknown[]).length} sessions`));

      const tracked = status.tracked as { sessionId: string; file: string; offset: number; prompts: number }[];
      for (const t of tracked) {
        console.log(
          chalk.gray(`   ${t.sessionId}  `) +
          chalk.white(`${t.prompts} prompts  `) +
          chalk.gray(t.file.slice(0, 12) + "..."),
        );
      }

      console.log(chalk.gray("─".repeat(48)));
      console.log();
    });

  cmd
    .command("start")
    .description("Start the background daemon")
    .action(() => {
      if (isDaemonRunning()) {
        console.log(chalk.gray("\n Daemon is already running.\n"));
        return;
      }

      startDaemon();
      console.log(chalk.green("\n ✔ Daemon started.\n"));
    });

  cmd
    .command("stop")
    .description("Stop the background daemon")
    .action(async () => {
      if (!isDaemonRunning()) {
        console.log(chalk.gray("\n Daemon is not running.\n"));
        return;
      }

      await stopDaemon();
      console.log(chalk.green("\n ✔ Daemon stopped.\n"));
    });

  return cmd;
}
