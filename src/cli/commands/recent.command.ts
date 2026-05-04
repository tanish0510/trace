import { Command } from "commander";
import { PromptSearchService } from "../../core/search/prompt-search.service.js";
import { closeDatabase, getDatabase } from "../../core/storage/sqlite.js";

export function createRecentCommand(): Command {
  const cmd = new Command("recent")
    .description("Show recent engineering activity across sessions and repos")
    .option("-n, --limit <count>", "Number of recent sessions to show", "10")
    .action(async (opts: { limit: string }) => {
      try {
        getDatabase();
        const search = new PromptSearchService();
        search.recentAndRender(parseInt(opts.limit, 10));
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
