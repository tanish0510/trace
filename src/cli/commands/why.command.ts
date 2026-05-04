import { Command } from "commander";
import chalk from "chalk";
import { PromptIntelligenceService } from "../../core/prompts/prompt-intelligence.service.js";
import { truncatePrompt } from "../../core/prompts/prompt.constants.js";
import { closeDatabase } from "../../core/storage/sqlite.js";

export function createWhyCommand(): Command {
  const cmd = new Command("why")
    .description("Explain why a file was changed — links to prompts and commits")
    .argument("<file>", "File path to investigate")
    .action(async (filePath: string) => {
      try {
        const intelligence = new PromptIntelligenceService();
        const result = await intelligence.whyFile(filePath);

        console.log();
        console.log(
          chalk.bold(" Why: ") + chalk.white(result.filePath),
        );
        console.log(chalk.gray("─".repeat(64)));

        if (result.prompts.length === 0 && result.commits.length === 0) {
          console.log(
            chalk.gray(
              "\n No prompts or commits found linked to this file." +
                "\n Capture prompts during sessions with: " +
                chalk.cyan("trc prompt \"your intent\"") +
                "\n",
            ),
          );
          return;
        }

        if (result.prompts.length > 0) {
          console.log(chalk.bold.cyan("\n Linked Prompts"));
          for (const p of result.prompts) {
            const pct = Math.round(p.confidence * 100);
            const bar = pct >= 70 ? chalk.green(`${pct}%`) : pct >= 40 ? chalk.yellow(`${pct}%`) : chalk.gray(`${pct}%`);
            console.log(
              `   ${chalk.cyan("◆")} ${chalk.white(`"${truncatePrompt(p.prompt.content)}"`)}` +
                chalk.gray(` ${bar}`),
            );
            console.log(chalk.gray(`     ${p.prompt.id} · ${p.reason}`));
          }
        }

        if (result.commits.length > 0) {
          console.log(chalk.bold.green("\n Related Commits"));
          for (const c of result.commits) {
            console.log(
              `   ${chalk.green("✔")} ${chalk.yellow(c.hash)} ${chalk.white(`"${c.message}"`)}` +
                (c.branch ? chalk.gray(` · ${c.branch}`) : ""),
            );
          }
        }

        if (result.relatedFiles.length > 0) {
          console.log(chalk.bold.yellow("\n Related Files"));
          for (const f of result.relatedFiles.slice(0, 10)) {
            console.log(chalk.gray(`   ${f}`));
          }
        }

        console.log();
        console.log(chalk.gray("─".repeat(64)));
        console.log();
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
