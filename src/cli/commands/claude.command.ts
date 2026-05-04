import { Command } from "commander";
import chalk from "chalk";
import { SessionService } from "../../core/session/session.service.js";
import { EventService } from "../../core/events/event.service.js";
import { ClaudeService } from "../../core/integrations/claude/claude.service.js";
import { RepositoryTrackerService } from "../../core/repository/repository-tracker.service.js";
import { ContextEngineService } from "../../core/context/context-engine.service.js";
import { ContextSelectorService } from "../../core/context/context-selector.service.js";
import { PromptPollerService } from "../../core/prompts/prompt-poller.service.js";
import {
  detectRepoPath,
  detectGitBranch,
  ensureTraceDir,
} from "../../core/session/session.utils.js";
import { closeDatabase } from "../../core/storage/sqlite.js";
import { notifySessionStarted } from "../../core/daemon/daemon.client.js";

export function createClaudeCommand(): Command {
  const cmd = new Command("claude")
    .description("Launch Claude CLI within a Trace session")
    .option("--context [mode]", "Inject repository context (recent, replay, or a focus keyword)")
    .argument("[args...]", "Arguments to pass through to Claude CLI")
    .action(async (args: string[], opts: { context?: string | boolean }) => {
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

      const repoPath = detectRepoPath();
      const gitBranch = detectGitBranch(repoPath);

      ensureTraceDir();

      const sessionService = new SessionService();
      const eventService = new EventService();

      const session = await sessionService.createSession({
        repoPath,
        gitBranch,
        tool: "CLAUDE",
      });

      await eventService.sessionStarted(session.id, {
        name: session.name,
        repoPath,
        gitBranch,
        tool: session.tool,
      });

      console.log(chalk.gray("─".repeat(48)));
      console.log(chalk.bold.cyan(" Trace"));
      console.log(chalk.gray("─".repeat(48)));
      console.log(chalk.gray(" Session  ") + chalk.white(session.id));
      console.log(chalk.gray(" Name     ") + chalk.white(session.name));
      console.log(chalk.gray(" Branch   ") + chalk.white(session.gitBranch));
      console.log(chalk.gray(" Status   ") + chalk.green("ACTIVE"));
      console.log(chalk.gray("─".repeat(48)));
      console.log();

      let contextMarkdown: string | null = null;
      if (opts.context) {
        const selector = new ContextSelectorService();
        const ctxConfig = selector.parse(opts.context, repoPath, gitBranch);
        if (ctxConfig) {
          const ctxEngine = new ContextEngineService();
          const pack = await ctxEngine.generate(ctxConfig);
          contextMarkdown = ctxEngine.getMarkdown(pack);

          console.log(
            chalk.magenta(" Context  ") +
              chalk.white(`${pack.mode}${pack.focus ? ` (${pack.focus})` : ""} — ${pack.sections.length} sections`),
          );
          console.log(chalk.gray("─".repeat(48)));
          console.log();
        }
      }

      if (contextMarkdown) {
        args.push("--system-prompt", contextMarkdown);
      }

      const tracker = new RepositoryTrackerService(session.id, repoPath);
      await tracker.start();

      const promptPoller = new PromptPollerService(session.id, repoPath);
      promptPoller.start();

      await eventService.claudeLaunched(session.id, { repoPath });

      notifySessionStarted(session.id, repoPath).catch(() => {});

      const claudeProjectDir = claudeService.getClaudeProjectDir(repoPath);
      const beforeSessionIds = claudeService.listClaudeSessions(claudeProjectDir);
      let earlyDetected = false;

      const idDetector = setInterval(() => {
        if (earlyDetected) return;
        const newId = claudeService.detectNewClaudeSession(
          claudeProjectDir, beforeSessionIds,
        );
        if (newId) {
          earlyDetected = true;
          promptPoller.setClaudeSessionId(newId);
          sessionService.setClaudeSessionId(session.id, newId);
          clearInterval(idDetector);
        }
      }, 3000);

      setTimeout(() => clearInterval(idDetector), 30_000);

      try {
        const result = await claudeService.launch({
          sessionId: session.id,
          repoPath,
          args,
        });

        clearInterval(idDetector);
        await tracker.stop();

        if (result.claudeSessionId && !earlyDetected) {
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
        await promptPoller.stop();
        await tracker.stop();
        await eventService.sessionEnded(session.id, {
          error: (err as Error).message,
        });
        await sessionService.endSession(session.id);
        console.error(
          chalk.red(`\nSession ended with error: ${(err as Error).message}`)
        );
        process.exit(1);
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
