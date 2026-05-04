import { Command } from "commander";
import chalk from "chalk";
import { ReplayService } from "../../core/replay/replay.service.js";
import { closeDatabase } from "../../core/storage/sqlite.js";
import type { ReplayMode, ReplaySpeed } from "../../core/replay/replay.types.js";

export function createReplayCommand(): Command {
  const cmd = new Command("replay")
    .description("Replay engineering session as storytelling")
    .argument("<session-id>", "Session ID to replay")
    .option(
      "--mode <mode>",
      "Replay mode: story, chapters, focus, timeline, diff, commits",
      "story",
    )
    .option(
      "--speed <speed>",
      "Playback speed: slow, normal, fast",
      "normal",
    )
    .option(
      "--focus <term>",
      "Focus replay on a domain (e.g. auth, api, config)",
    )
    .option(
      "--prompt <id>",
      "Replay only activity correlated to a specific prompt",
    )
    .option(
      "--show-patches",
      "Show full git patch content inline",
      false,
    )
    .action(
      async (
        sessionId: string,
        opts: {
          mode: string;
          speed: string;
          focus?: string;
          prompt?: string;
          showPatches: boolean;
        },
      ) => {
        const validModes = ["story", "chapters", "focus", "timeline", "diff", "commits"];
        const validSpeeds = ["slow", "normal", "fast"];

        if (!validModes.includes(opts.mode)) {
          console.error(
            chalk.red(`\n Invalid mode "${opts.mode}". Use: ${validModes.join(", ")}\n`),
          );
          process.exit(1);
        }

        if (!validSpeeds.includes(opts.speed)) {
          console.error(
            chalk.red(`\n Invalid speed "${opts.speed}". Use: ${validSpeeds.join(", ")}\n`),
          );
          process.exit(1);
        }

        let mode = opts.mode as ReplayMode;
        if (opts.focus && mode !== "focus") {
          mode = "focus";
        }

        try {
          const replayService = new ReplayService();
          await replayService.replay({
            sessionId,
            mode,
            speed: opts.speed as ReplaySpeed,
            showPatches: opts.showPatches,
            focus: opts.focus,
            promptId: opts.prompt,
          });
        } catch (err) {
          console.error(chalk.red(`\n ${(err as Error).message}\n`));
          process.exit(1);
        } finally {
          closeDatabase();
        }
      },
    );

  return cmd;
}
