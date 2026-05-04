import { Command } from "commander";
import chalk from "chalk";
import { ContextEngineService } from "../../core/context/context-engine.service.js";
import { ContextSelectorService } from "../../core/context/context-selector.service.js";
import { detectRepoPath, detectGitBranch } from "../../core/session/session.utils.js";
import { closeDatabase } from "../../core/storage/sqlite.js";

export function createContextCommand(): Command {
  const cmd = new Command("context")
    .description("Display repository-scoped engineering context")
    .argument("[mode]", "Context mode: recent, replay, or a focus keyword (e.g. auth)")
    .action(async (mode?: string) => {
      try {
        const repoPath = detectRepoPath();
        const branch = detectGitBranch(repoPath);

        const selector = new ContextSelectorService();
        const config = selector.parse(mode || true, repoPath, branch);

        if (!config) {
          console.error(chalk.red("\n Could not determine context configuration.\n"));
          process.exit(1);
        }

        const engine = new ContextEngineService();
        await engine.display(config);
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
