import { Command } from "commander";
import { PromptSearchService } from "../../core/search/prompt-search.service.js";
import { detectRepoPath, detectGitBranch } from "../../core/session/session.utils.js";
import { closeDatabase, getDatabase } from "../../core/storage/sqlite.js";

export function createFindCommand(): Command {
  const cmd = new Command("find")
    .description("Search engineering memory — prompts, sessions, commits, branches")
    .argument("<query>", "Search query (supports fuzzy matching)")
    .action(async (query: string) => {
      try {
        getDatabase();
        const repoPath = detectRepoPath();
        const branch = detectGitBranch(repoPath);

        const search = new PromptSearchService();
        search.findAndRender(query, repoPath, branch);
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
