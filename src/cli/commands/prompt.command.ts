import { Command } from "commander";
import chalk from "chalk";
import { PromptIntelligenceService } from "../../core/prompts/prompt-intelligence.service.js";
import { truncatePrompt } from "../../core/prompts/prompt.constants.js";
import { StateService } from "../../core/state/state.service.js";
import { closeDatabase } from "../../core/storage/sqlite.js";

export function createPromptCommand(): Command {
  const cmd = new Command("prompt")
    .description("Capture an engineering prompt/intent for the active session")
    .argument("<content>", "The prompt or engineering intent to capture")
    .action(async (content: string) => {
      try {
        const stateService = new StateService();
        const activeId = stateService.getActiveSessionId();

        if (!activeId) {
          console.error(
            chalk.red("\n No active session.") +
              chalk.gray("\n Start one with: ") +
              chalk.cyan("trc claude\n"),
          );
          process.exit(1);
        }

        const intelligence = new PromptIntelligenceService();
        const { prompt, intent, correlations } = await intelligence.captureAndCorrelate(
          activeId,
          content,
        );

        console.log();
        console.log(chalk.bold.cyan(" Prompt Captured"));
        console.log(chalk.gray("─".repeat(56)));
        console.log(chalk.gray(" ID       ") + chalk.white(prompt.id));
        console.log(chalk.gray(" Session  ") + chalk.white(activeId));
        console.log(chalk.gray(" Content  ") + chalk.white(`"${truncatePrompt(content)}"`));

        if (correlations.length > 0) {
          console.log(
            chalk.gray(" Linked   ") +
              chalk.green(`${correlations.length} correlations`),
          );

          if (intent.relatedFiles.length > 0) {
            console.log(chalk.gray(" Files    ") + chalk.yellow(intent.relatedFiles.slice(0, 5).join(", ")));
          }
          if (intent.relatedCommits.length > 0) {
            console.log(
              chalk.gray(" Commits  ") +
                chalk.yellow(intent.relatedCommits.map((h) => h.slice(0, 7)).join(", ")),
            );
          }
        } else {
          console.log(chalk.gray(" Linked   ") + chalk.gray("no correlations yet (activity will link later)"));
        }

        console.log(chalk.gray("─".repeat(56)));
        console.log();
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
