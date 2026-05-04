import chalk from "chalk";
import type { TimelineEntry, ReplaySpeed, ReplaySpeedConfig, ReplaySummary } from "./replay.types.js";
import { SPEED_CONFIGS } from "./replay.types.js";
import type { DiffSnapshot } from "../repository/repository.types.js";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PlaybackService {
  private speedConfig: ReplaySpeedConfig;

  constructor(speed: ReplaySpeed = "normal") {
    this.speedConfig = SPEED_CONFIGS[speed];
  }

  async renderSummary(summary: ReplaySummary): Promise<void> {
    console.log();
    console.log(chalk.bold.cyan(" TRACE REPLAY"));
    console.log(chalk.gray("─".repeat(64)));
    console.log(chalk.gray(" Session    ") + chalk.white(summary.sessionName));
    console.log(chalk.gray(" ID         ") + chalk.white(summary.sessionId));
    console.log(chalk.gray(" Repo       ") + chalk.white(summary.repoPath));
    console.log(chalk.gray(" Branch     ") + chalk.yellow(summary.branch));
    console.log(chalk.gray(" Duration   ") + chalk.white(summary.duration));
    console.log();

    const statLine = [
      `${summary.eventCount} events`,
      summary.commitCount > 0 ? `${summary.commitCount} commits` : null,
      summary.diffCount > 0 ? `${summary.diffCount} diffs` : null,
      summary.filesCreated > 0 ? `${summary.filesCreated} created` : null,
      summary.filesModified > 0 ? `${summary.filesModified} modified` : null,
      summary.filesDeleted > 0 ? `${summary.filesDeleted} deleted` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(chalk.gray(` ${statLine}`));

    if (summary.totalInsertions > 0 || summary.totalDeletions > 0) {
      console.log(
        chalk.gray(" Code       ") +
          chalk.green(`+${summary.totalInsertions}`) +
          chalk.gray(" / ") +
          chalk.red(`-${summary.totalDeletions}`),
      );
    }

    console.log(chalk.gray("─".repeat(64)));
    console.log();
  }

  async renderEntry(entry: TimelineEntry): Promise<void> {
    const time = formatTime(entry.timestamp);
    const icon = this.kindIcon(entry.kind);
    const labelColor = this.kindLabelColor(entry.kind);

    console.log(` ${chalk.gray(`[${time}]`)}`);
    console.log(` ${icon} ${labelColor(entry.label)}`);

    if (entry.details.length > 0) {
      for (const detail of entry.details) {
        const colored = this.colorDetail(entry.kind, detail);
        console.log(`   ${colored}`);
      }
    }

    console.log();
    await sleep(this.delayForKind(entry.kind));
  }

  async renderPatch(snapshot: DiffSnapshot, patchLines: string[]): Promise<void> {
    console.log(chalk.gray("   ┌─ patch ─────────────────────────────────────"));

    for (const line of patchLines) {
      let colored: string;
      if (line.startsWith("+") && !line.startsWith("+++")) {
        colored = chalk.green(line);
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        colored = chalk.red(line);
      } else if (line.startsWith("@@")) {
        colored = chalk.cyan(line);
      } else if (line.startsWith("diff ") || line.startsWith("index ")) {
        colored = chalk.gray(line);
      } else {
        colored = chalk.gray(line);
      }
      console.log(`   ${chalk.gray("│")} ${colored}`);
    }

    console.log(chalk.gray("   └────────────────────────────────────────────"));
    console.log();
  }

  async renderFooter(entryCount: number): Promise<void> {
    console.log(chalk.gray("─".repeat(64)));
    console.log(chalk.gray(` Replay complete · ${entryCount} entries`));
    console.log();
  }

  private kindIcon(kind: TimelineEntry["kind"]): string {
    switch (kind) {
      case "session":
        return chalk.green("▶");
      case "tool":
        return chalk.blue("⬤");
      case "files":
        return chalk.yellow("✎");
      case "diff":
        return chalk.magenta("±");
      case "commit":
        return chalk.green("✔");
      case "branch":
        return chalk.cyan("⎇");
    }
  }

  private kindLabelColor(kind: TimelineEntry["kind"]): (s: string) => string {
    switch (kind) {
      case "session":
        return chalk.white.bold;
      case "tool":
        return chalk.blue;
      case "files":
        return chalk.yellow;
      case "diff":
        return chalk.magenta;
      case "commit":
        return chalk.green;
      case "branch":
        return chalk.cyan;
    }
  }

  private colorDetail(kind: TimelineEntry["kind"], detail: string): string {
    if (kind === "files") {
      if (detail.startsWith("+ ")) return chalk.green(detail);
      if (detail.startsWith("~ ")) return chalk.yellow(detail);
      if (detail.startsWith("- ")) return chalk.red(detail);
    }
    if (kind === "diff") {
      if (detail.startsWith("+")) return chalk.green(detail);
      if (detail.startsWith("-")) return chalk.red(detail);
    }
    return chalk.gray(detail);
  }

  private delayForKind(kind: TimelineEntry["kind"]): number {
    switch (kind) {
      case "session":
        return this.speedConfig.sessionDelayMs;
      case "tool":
        return this.speedConfig.toolDelayMs;
      case "files":
        return this.speedConfig.fileDelayMs;
      case "diff":
        return this.speedConfig.diffDelayMs;
      case "commit":
        return this.speedConfig.commitDelayMs;
      case "branch":
        return this.speedConfig.branchDelayMs;
    }
  }
}
