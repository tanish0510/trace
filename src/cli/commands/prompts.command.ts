import { Command } from "commander";
import chalk from "chalk";
import { PromptCaptureService } from "../../core/prompts/prompt-capture.service.js";
import { PromptRepository } from "../../core/prompts/prompt-repository.js";
import { PromptPollerService } from "../../core/prompts/prompt-poller.service.js";
import { PromptIntelligenceService } from "../../core/prompts/prompt-intelligence.service.js";
import { truncatePrompt } from "../../core/prompts/prompt.constants.js";
import { SessionService } from "../../core/session/session.service.js";
import { closeDatabase } from "../../core/storage/sqlite.js";
import { detectRepoPath } from "../../core/session/session.utils.js";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function createPromptsCommand(): Command {
  const cmd = new Command("prompts")
    .description("Show prompts captured during a session")
    .argument("<session-id>", "Session ID to show prompts for")
    .option("--backfill", "Retroactively capture prompts from Claude JSONL files")
    .option("--recorrelate", "Re-run correlation engine on all prompts missing correlations")
    .action(async (sessionId: string, opts: { backfill?: boolean; recorrelate?: boolean }) => {
      try {
        const sessionService = new SessionService();
        const session = await sessionService.getSession(sessionId);

        if (!session) {
          console.error(chalk.red(`\n Session "${sessionId}" not found.\n`));
          process.exit(1);
        }

        if (opts.backfill) {
          if (session.claudeSessionId) {
            const count = await PromptPollerService.backfillSession(
              sessionId,
              session.claudeSessionId,
              session.repoPath,
            );
            console.log(chalk.green(`\n ✔ Backfilled ${count} prompts for ${sessionId}\n`));
          } else {
            const repoPath = detectRepoPath();
            const count = await PromptPollerService.backfillAll(repoPath);
            console.log(chalk.green(`\n ✔ Backfilled ${count} prompts across all sessions\n`));
          }
        }

        if (opts.recorrelate) {
          const intel = new PromptIntelligenceService();
          const count = await intel.recorrelateSession(sessionId);
          console.log(chalk.green(`\n ✔ Re-correlated ${count} new links for ${sessionId}\n`));
        }

        const captureService = new PromptCaptureService();
        const sessionPrompts = captureService.getSessionPrompts(sessionId);

        if (sessionPrompts.length === 0) {
          console.log(chalk.gray(`\n No prompts captured for session ${sessionId}.\n`));
          return;
        }

        const repository = new PromptRepository();

        console.log();
        console.log(
          chalk.bold(" Prompts") +
            chalk.gray(` — ${session.name} (${sessionId})`),
        );
        console.log(chalk.gray("─".repeat(64)));

        for (const prompt of sessionPrompts) {
          const time = formatTime(prompt.createdAt);
          const correlations = repository.getCorrelations(prompt.id);
          const fileCount = correlations.filter((c) => c.filePath).length;
          const commitCount = correlations.filter((c) => c.commitHash).length;

          console.log();
          console.log(
            ` ${chalk.gray(time)}  ${chalk.cyan("◆")} ${chalk.white(`"${prompt.content}"`)}`,
          );
          console.log(
            chalk.gray(`              ${prompt.id}`),
          );

          if (correlations.length > 0) {
            const parts: string[] = [];
            if (fileCount > 0) parts.push(`${fileCount} files`);
            if (commitCount > 0) parts.push(`${commitCount} commits`);
            console.log(chalk.gray(`              → ${parts.join(", ")}`));
          }
        }

        console.log();
        console.log(chalk.gray("─".repeat(64)));
        console.log(chalk.gray(` ${sessionPrompts.length} prompts`));
        console.log();
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
