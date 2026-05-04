import { Command } from "commander";
import chalk from "chalk";
import { PromptIntelligenceService } from "../../core/prompts/prompt-intelligence.service.js";
import { StateService } from "../../core/state/state.service.js";
import { closeDatabase } from "../../core/storage/sqlite.js";

export function createNoteCommand(): Command {
  const cmd = new Command("note")
    .description("Quick note/intent capture for the active session (alias for trc prompt)")
    .argument("<content>", "Engineering note or intent")
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
        const { prompt, correlations } = await intelligence.captureAndCorrelate(
          activeId,
          content,
        );

        console.log();
        console.log(
          chalk.magenta(" ◆") +
            chalk.gray(" Note captured · ") +
            chalk.white(prompt.id) +
            (correlations.length > 0
              ? chalk.gray(` · ${correlations.length} correlations`)
              : ""),
        );
        console.log();
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
