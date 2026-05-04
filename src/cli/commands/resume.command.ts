import { Command } from "commander";
import chalk from "chalk";
import { SessionService } from "../../core/session/session.service.js";
import { EventService } from "../../core/events/event.service.js";
import { ClaudeService } from "../../core/integrations/claude/claude.service.js";
import { RepositoryTrackerService } from "../../core/repository/repository-tracker.service.js";
import { PromptPollerService } from "../../core/prompts/prompt-poller.service.js";
import { closeDatabase } from "../../core/storage/sqlite.js";

async function handleResume(id: string): Promise<void> {
  try {
    const sessionService = new SessionService();
    const eventService = new EventService();
    const session = await sessionService.getSession(id);

    if (!session) {
      console.error(chalk.red(`\n Error: Session "${id}" not found.\n`));
      process.exit(1);
    }

    if (!session.claudeSessionId) {
      console.error(
        chalk.red(`\n Error: Session "${id}" has no Claude session to resume.\n`) +
          chalk.gray(" This session may not have been started with ") +
          chalk.cyan("trc claude") +
          chalk.gray(".\n")
      );
      process.exit(1);
    }

    const claudeService = new ClaudeService();

    if (!claudeService.isClaudeInstalled()) {
      console.error(
        chalk.red(
          "Error: Claude CLI not found.\n" +
            "Install it from https://docs.anthropic.com/en/docs/claude-code"
        )
      );
      process.exit(1);
    }

    await sessionService.resumeSession(id);

    await eventService.sessionResumed(session.id, {
      name: session.name,
      claudeSessionId: session.claudeSessionId,
    });

    console.log(chalk.gray("─".repeat(48)));
    console.log(chalk.bold.cyan(" Trace — Resuming"));
    console.log(chalk.gray("─".repeat(48)));
    console.log(chalk.gray(" Session  ") + chalk.white(session.id));
    console.log(chalk.gray(" Name     ") + chalk.white(session.name));
    console.log(chalk.gray(" Branch   ") + chalk.white(session.gitBranch));
    console.log(chalk.gray(" Claude   ") + chalk.gray(session.claudeSessionId));
    console.log(chalk.gray(" Status   ") + chalk.green("ACTIVE"));
    console.log(chalk.gray("─".repeat(48)));
    console.log();

    const tracker = new RepositoryTrackerService(session.id, session.repoPath);
    await tracker.start();

    const promptPoller = new PromptPollerService(session.id, session.repoPath);
    promptPoller.start(session.claudeSessionId!);

    await eventService.claudeLaunched(session.id, {
      repoPath: session.repoPath,
      resumeId: session.claudeSessionId,
    });

    const result = await claudeService.launch({
      sessionId: session.id,
      repoPath: session.repoPath,
      resumeId: session.claudeSessionId,
    });

    await tracker.stop();

    if (result.claudeSessionId) {
      promptPoller.setClaudeSessionId(result.claudeSessionId);
      await sessionService.setClaudeSessionId(session.id, result.claudeSessionId);
    }

    const promptCount = await promptPoller.stop();

    await eventService.claudeExited(session.id, {
      exitCode: result.exitCode,
      claudeSessionId: result.claudeSessionId,
    });

    await eventService.sessionEnded(session.id, {
      exitCode: result.exitCode,
    });

    await sessionService.endSession(session.id);

    console.log();
    console.log(chalk.gray("─".repeat(48)));
    console.log(
      chalk.gray(" Session ") +
        chalk.white(session.id) +
        chalk.gray(" ended")
    );
    console.log(
      chalk.gray(" Exit    ") + chalk.white(result.exitCode ?? "unknown")
    );
    if (promptCount > 0) {
      console.log(
        chalk.gray(" Prompts ") +
          chalk.green(`${promptCount} captured`),
      );
    }
    if (result.claudeSessionId) {
      console.log(
        chalk.gray(" Resume  ") + chalk.cyan(`trc resume ${session.id}`)
      );
    }
    console.log(chalk.gray("─".repeat(48)));
  } catch (err) {
    console.error(
      chalk.red(`\nResume failed: ${(err as Error).message}`)
    );
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

export function createResumeCommand(): Command {
  return new Command("resume")
    .description("Resume a previous session — relaunches Claude with context")
    .argument("<id>", "Session ID to resume")
    .action(handleResume);
}

export function createSessionCommand(): Command {
  const cmd = new Command("session").description("Manage individual sessions");

  cmd
    .command("current")
    .description("Show detailed info about the current active session")
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

        console.log(chalk.gray("─".repeat(48)));
        console.log(chalk.bold.cyan(" Active Session"));
        console.log(chalk.gray("─".repeat(48)));
        console.log(chalk.gray(" ID        ") + chalk.white(current.id));
        console.log(chalk.gray(" Name      ") + chalk.white(current.name));
        console.log(chalk.gray(" Repo      ") + chalk.white(current.repoPath));
        console.log(chalk.gray(" Branch    ") + chalk.white(current.gitBranch));
        console.log(chalk.gray(" Tool      ") + chalk.white(current.tool));
        console.log(chalk.gray(" Status    ") + chalk.green(current.status));
        if (current.claudeSessionId) {
          console.log(chalk.gray(" Claude    ") + chalk.gray(current.claudeSessionId));
        }
        console.log(
          chalk.gray(" Created   ") +
            chalk.white(current.createdAt.toISOString())
        );
        console.log(
          chalk.gray(" Updated   ") +
            chalk.white(current.updatedAt.toISOString())
        );
        console.log(chalk.gray("─".repeat(48)));
        console.log();
      } finally {
        closeDatabase();
      }
    });

  cmd
    .command("end")
    .description("End the current active session")
    .action(async () => {
      try {
        const sessionService = new SessionService();
        const eventService = new EventService();
        const current = await sessionService.getCurrentSession();

        if (!current) {
          console.log(chalk.gray("\n No active session to end.\n"));
          return;
        }

        await eventService.sessionEnded(current.id, { manual: true });
        const ended = await sessionService.endSession(current.id);

        if (ended) {
          console.log();
          console.log(
            chalk.gray(" Session ") +
              chalk.white(ended.id) +
              chalk.gray(" ended")
          );
          console.log(chalk.gray(" Name    ") + chalk.white(ended.name));
          console.log(chalk.gray(" Status  ") + chalk.red("ENDED"));
          console.log();
        }
      } finally {
        closeDatabase();
      }
    });

  cmd
    .command("resume <id>")
    .description("Resume a previous session — relaunches Claude with context")
    .action(handleResume);

  return cmd;
}
