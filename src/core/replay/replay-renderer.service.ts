import chalk from "chalk";
import type {
  EngineeringBlock,
  Chapter,
  StoryReplaySummary,
} from "./aggregation/aggregation.types.js";
import type { DiffSnapshot } from "../repository/repository.types.js";
import type { Prompt } from "../prompts/prompt.types.js";
import { truncatePrompt } from "../prompts/prompt.constants.js";
import type { ReplaySpeed } from "./replay.types.js";
import { SPEED_CONFIGS } from "./replay.types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function shortenPath(p: string): string {
  const home = process.env.HOME || "";
  return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

const MAX_PATCH_LINES = 60;

export class ReplayRendererService {
  private speed: ReplaySpeed;
  private renderedPromptIds = new Set<string>();

  constructor(speed: ReplaySpeed = "normal") {
    this.speed = speed;
  }

  async renderSummaryCard(summary: StoryReplaySummary): Promise<void> {
    const cfg = SPEED_CONFIGS[this.speed];
    console.log();
    console.log(chalk.bold.cyan(" TRACE REPLAY"));
    console.log(chalk.gray("═".repeat(64)));
    console.log();
    console.log(chalk.gray(" Session      ") + chalk.white.bold(summary.sessionName));
    console.log(chalk.gray(" Repository   ") + chalk.white(shortenPath(summary.repoPath)));
    console.log(chalk.gray(" Branch       ") + chalk.yellow(summary.branch));
    console.log(chalk.gray(" Duration     ") + chalk.white(summary.duration));
    console.log(chalk.gray(" Focus        ") + chalk.cyan(summary.primaryFocus));
    console.log();

    const stats: string[] = [];
    if (summary.chapters > 0) stats.push(`${summary.chapters} chapters`);
    if (summary.commits > 0) stats.push(`${summary.commits} commits`);
    if (summary.filesChanged > 0) stats.push(`${summary.filesChanged} files`);
    if (summary.insertions > 0 || summary.deletions > 0) {
      stats.push(`${chalk.green(`+${summary.insertions}`)} ${chalk.red(`-${summary.deletions}`)}`);
    }
    if (summary.largestFile) {
      stats.push(`largest: ${summary.largestFile}`);
    }

    console.log(chalk.gray(` ${stats.join("  ·  ")}`));
    console.log();
    console.log(chalk.gray("═".repeat(64)));
    console.log();
    await sleep(cfg.sessionDelayMs);
  }

  async renderChapter(chapter: Chapter, showPatches: boolean, diffs: DiffSnapshot[], prompts?: Prompt[]): Promise<void> {
    const cfg = SPEED_CONFIGS[this.speed];

    console.log(
      chalk.bold.white(` CHAPTER ${chapter.number}`) +
        chalk.gray(" — ") +
        chalk.bold.cyan(chapter.title),
    );

    const meta: string[] = [chapter.duration];
    if (chapter.summary.filesChanged > 0) {
      meta.push(`${chapter.summary.filesChanged} files`);
    }
    if (chapter.summary.commits > 0) {
      meta.push(`${chapter.summary.commits} commit${chapter.summary.commits > 1 ? "s" : ""}`);
    }
    if (chapter.summary.insertions > 0 || chapter.summary.deletions > 0) {
      meta.push(`${chalk.green(`+${chapter.summary.insertions}`)} ${chalk.red(`-${chapter.summary.deletions}`)}`);
    }
    console.log(chalk.gray(` ${meta.join("  ·  ")}`));
    console.log(chalk.gray(" ─".repeat(32)));
    console.log();

    await sleep(cfg.sessionDelayMs);

    for (const block of chapter.blocks) {
      await this.renderBlock(block, showPatches, diffs, prompts);
    }

    console.log();
  }

  async renderBlock(block: EngineeringBlock, showPatches: boolean, diffs: DiffSnapshot[], prompts?: Prompt[]): Promise<void> {
    const cfg = SPEED_CONFIGS[this.speed];

    if (prompts && prompts.length > 0) {
      const blockPrompts = prompts.filter((p) => {
        if (this.renderedPromptIds.has(p.id)) return false;
        const t = p.createdAt.getTime();
        return t >= block.startTime.getTime() - 5000 && t <= block.endTime.getTime() + 5000;
      });
      for (const p of blockPrompts) {
        this.renderedPromptIds.add(p.id);
        console.log(
          `   ${chalk.gray(formatTime(p.createdAt))}  ${chalk.magenta("◆")} ${chalk.magenta("PROMPT")} ${chalk.white.bold(`"${truncatePrompt(p.content)}"`)}`,
        );
        console.log(chalk.gray(`              ${p.id}`));
        await sleep(cfg.toolDelayMs);
      }
    }

    for (const te of block.toolEvents) {
      if (te.kind === "launched") {
        console.log(
          `   ${chalk.gray(formatTime(te.timestamp))}  ${chalk.blue("⬤")} ${chalk.blue(`${te.tool} launched`)}`,
        );
        await sleep(cfg.toolDelayMs);
      } else {
        const exit = te.exitCode !== undefined ? chalk.gray(` (exit: ${te.exitCode})`) : "";
        console.log(
          `   ${chalk.gray(formatTime(te.timestamp))}  ${chalk.gray("○")} ${chalk.gray(`${te.tool} exited`)}${exit}`,
        );
        await sleep(cfg.toolDelayMs);
      }
    }

    for (const bc of block.branchChanges) {
      console.log(
        `   ${chalk.gray(formatTime(bc.timestamp))}  ${chalk.cyan("⎇")} ${chalk.cyan(`${bc.from} → ${bc.to}`)}`,
      );
      await sleep(cfg.branchDelayMs);
    }

    const allFiles = [
      ...block.filesCreated,
      ...block.filesModified,
      ...block.filesDeleted,
    ];

    if (allFiles.length > 0) {
      const time = formatTime(block.startTime);

      if (block.commits.length > 0) {
        const msg = block.commits[block.commits.length - 1]!.message;
        console.log(
          `   ${chalk.gray(time)}  ${chalk.yellow("✎")} ${chalk.white.bold(msg || block.intent)}`,
        );
      } else {
        console.log(
          `   ${chalk.gray(time)}  ${chalk.yellow("✎")} ${chalk.white(block.intent)}`,
        );
      }

      for (const f of block.filesCreated) {
        console.log(chalk.green(`              + ${f}`));
      }
      for (const f of block.filesModified) {
        console.log(chalk.yellow(`              ~ ${f}`));
      }
      for (const f of block.filesDeleted) {
        console.log(chalk.red(`              - ${f}`));
      }

      if (block.insertions > 0 || block.deletions > 0) {
        console.log(
          chalk.gray("              ") +
            chalk.green(`+${block.insertions}`) +
            chalk.gray(" / ") +
            chalk.red(`-${block.deletions}`),
        );
      }

      await sleep(cfg.fileDelayMs);
    }

    for (const commit of block.commits) {
      console.log(
        `   ${chalk.gray(formatTime(commit.timestamp))}  ${chalk.green("✔")} ${chalk.green(`"${commit.message}"`)}` +
          chalk.gray(` ${commit.hash.slice(0, 7)}`),
      );
      await sleep(cfg.commitDelayMs);
    }

    if (showPatches && diffs.length > 0) {
      const blockDiffs = diffs.filter((d) => {
        const t = d.createdAt.getTime();
        return t >= block.startTime.getTime() - 2000 && t <= block.endTime.getTime() + 2000;
      });

      for (const d of blockDiffs) {
        if (!d.diffPatch || d.diffPatch.trim().length === 0) continue;
        this.renderPatchInline(d);
      }
    }

    console.log();
  }

  async renderStoryBlock(block: EngineeringBlock): Promise<void> {
    const cfg = SPEED_CONFIGS[this.speed];
    const allFiles = [
      ...block.filesCreated,
      ...block.filesModified,
      ...block.filesDeleted,
    ];

    if (
      allFiles.length === 0 &&
      block.commits.length === 0 &&
      block.branchChanges.length === 0 &&
      block.toolEvents.length === 0
    ) {
      return;
    }

    await this.renderBlock(block, false, []);
    await sleep(cfg.fileDelayMs);
  }

  async renderFooter(chapters: number, totalBlocks: number): Promise<void> {
    console.log(chalk.gray("═".repeat(64)));
    console.log(
      chalk.gray(` Replay complete · ${chapters} chapters · ${totalBlocks} blocks`),
    );
    console.log();
  }

  private renderPatchInline(snapshot: DiffSnapshot): void {
    const rawLines = snapshot.diffPatch.split("\n");
    const lines = rawLines.slice(0, MAX_PATCH_LINES);
    const truncated = rawLines.length > MAX_PATCH_LINES;

    console.log(chalk.gray("              ┌─ patch ───────────────────────────"));

    for (const line of lines) {
      let colored: string;
      if (line.startsWith("+") && !line.startsWith("+++")) {
        colored = chalk.green(line);
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        colored = chalk.red(line);
      } else if (line.startsWith("@@")) {
        colored = chalk.cyan(line);
      } else {
        colored = chalk.gray(line);
      }
      console.log(`${chalk.gray("              │")} ${colored}`);
    }

    if (truncated) {
      console.log(chalk.gray(`              │ ... ${rawLines.length - MAX_PATCH_LINES} more lines`));
    }
    console.log(chalk.gray("              └──────────────────────────────────"));
  }
}
