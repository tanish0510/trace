import chalk from "chalk";
import type { SearchResult, RecentActivity } from "./search.types.js";

export class SearchRendererService {
  renderSearchResults(results: SearchResult[], query: string): void {
    if (results.length === 0) {
      console.log();
      console.log(chalk.yellow(`  No results found for "${query}"`));
      console.log(chalk.dim("  Try broader terms or run: trc recent"));
      console.log();
      return;
    }

    const divider = chalk.dim("─".repeat(110));

    console.log();
    console.log(
      chalk.bold.white("  TRACE MEMORY SEARCH") +
        chalk.dim(` — "${query}"`) +
        chalk.dim(` — ${results.length} result${results.length === 1 ? "" : "s"}`),
    );
    console.log(divider);
    console.log();

    const hdr = (label: string, width: number) => chalk.dim(label.padEnd(width));
    console.log(
      "  " +
        hdr("MATCH", 8) +
        hdr("SESSION ID", 14) +
        hdr("SESSION NAME", 26) +
        hdr("REPO", 18) +
        hdr("BRANCH", 18) +
        hdr("STATUS", 9) +
        hdr("VIA", 10),
    );
    console.log("  " + chalk.dim("─".repeat(103)));

    for (const r of results) {
      const pct = Math.round(r.score * 100);
      const pctStr = `${pct}%`.padEnd(8);
      const coloredPct =
        pct >= 70
          ? chalk.green.bold(pctStr)
          : pct >= 40
            ? chalk.yellow(pctStr)
            : chalk.dim(pctStr);

      const sid = r.sessionId.padEnd(14);
      const name = truncate(r.sessionName, 24).padEnd(26);
      const repo = truncate(r.repoName, 16).padEnd(18);
      const branch = truncate(r.branch, 16).padEnd(18);
      const status =
        r.status === "ACTIVE"
          ? chalk.green(r.status.padEnd(9))
          : chalk.dim(r.status.padEnd(9));
      const via = chalk.dim(formatSource(r.matchedSource).padEnd(10));

      console.log("  " + coloredPct + sid + name + repo + branch + status + via);
    }

    console.log();
    console.log(divider);

    const topResult = results[0]!;
    console.log();
    console.log(chalk.bold("  Best Match"));
    console.log();

    const topPct = Math.round(topResult.score * 100);
    console.log(
      "  " +
        (topPct >= 70
          ? chalk.green.bold(`${topPct}% match`)
          : topPct >= 40
            ? chalk.yellow(`${topPct}% match`)
            : chalk.dim(`${topPct}% match`)),
    );

    console.log(
      chalk.dim("  Session:    ") + chalk.white(topResult.sessionName),
    );
    console.log(
      chalk.dim("  Repository: ") + chalk.white(topResult.repoName),
    );
    console.log(
      chalk.dim("  Branch:     ") + chalk.white(topResult.branch),
    );
    console.log(
      chalk.dim("  Matched:    ") +
        chalk.italic(truncate(topResult.matchedText, 80)),
    );
    console.log(
      chalk.dim("  Last Active: ") + chalk.white(formatRelative(topResult.lastActive)),
    );
    console.log(
      chalk.dim("  Session ID: ") + chalk.cyan(topResult.sessionId),
    );
    console.log(
      chalk.dim("  Stats:      ") +
        chalk.white(
          `${topResult.promptCount} prompts · ${topResult.commitCount} commits · ${topResult.fileCount} file events`,
        ),
    );

    console.log();
    console.log(
      chalk.dim("  Resume with: ") +
        chalk.cyan(`trc resume ${topResult.sessionId}`),
    );
    console.log();
  }

  renderRecentActivity(activities: RecentActivity[]): void {
    if (activities.length === 0) {
      console.log();
      console.log(chalk.yellow("  No recent activity found."));
      console.log();
      return;
    }

    const divider = chalk.dim("─".repeat(110));

    console.log();
    console.log(chalk.bold.white("  RECENT ENGINEERING ACTIVITY"));
    console.log(divider);
    console.log();

    const hdr = (label: string, width: number) => chalk.dim(label.padEnd(width));
    console.log(
      "  " +
        hdr("SESSION ID", 14) +
        hdr("SESSION NAME", 26) +
        hdr("REPO", 18) +
        hdr("BRANCH", 18) +
        hdr("STATUS", 9) +
        hdr("PROMPTS", 9) +
        hdr("COMMITS", 9) +
        hdr("WHEN", 14),
    );
    console.log("  " + chalk.dim("─".repeat(107)));

    for (const a of activities) {
      const sid = a.sessionId.padEnd(14);
      const name = truncate(a.sessionName, 24).padEnd(26);
      const repo = truncate(a.repoName, 16).padEnd(18);
      const branch = truncate(a.branch, 16).padEnd(18);
      const status =
        a.status === "ACTIVE"
          ? chalk.green(a.status.padEnd(9))
          : chalk.dim(a.status.padEnd(9));
      const prompts = String(a.promptCount).padEnd(9);
      const commits = String(a.commitCount).padEnd(9);
      const when = formatRelative(a.lastActive).padEnd(14);

      console.log("  " + sid + name + repo + branch + status + prompts + commits + chalk.dim(when));

      if (a.topPrompt) {
        console.log(
          "  " +
            " ".repeat(14) +
            chalk.dim("→ ") +
            chalk.italic.dim(truncate(a.topPrompt, 80)),
        );
      }
    }

    console.log();
    console.log(divider);

    const grouped = new Map<string, RecentActivity[]>();
    for (const a of activities) {
      const group = grouped.get(a.repoName) || [];
      group.push(a);
      grouped.set(a.repoName, group);
    }

    console.log();
    console.log(chalk.bold("  By Repository"));
    console.log();

    for (const [repo, sessions] of grouped) {
      console.log(chalk.white(`  ${repo}`));
      for (const s of sessions.slice(0, 3)) {
        console.log(
          chalk.dim("    → ") +
            chalk.dim(s.branch) +
            chalk.dim(` (${s.sessionId})`),
        );
      }
      if (sessions.length > 3) {
        console.log(chalk.dim(`    … and ${sessions.length - 3} more`));
      }
    }

    console.log();
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function formatSource(source: string): string {
  const labels: Record<string, string> = {
    prompt: "prompt",
    commit_message: "commit",
    session_name: "session",
    branch_name: "branch",
    repo_name: "repo",
    file_path: "file",
  };
  return labels[source] || source;
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
