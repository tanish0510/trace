import { Command } from "commander";
import chalk from "chalk";
import { EventService } from "../../core/events/event.service.js";
import { SessionService } from "../../core/session/session.service.js";
import { formatEventTime } from "../../core/events/event.utils.js";
import { closeDatabase } from "../../core/storage/sqlite.js";

export function createChangesCommand(): Command {
  const cmd = new Command("changes")
    .description("Show file changes for a session")
    .argument("<session-id>", "Session ID to show changes for")
    .action(async (sessionId: string) => {
      try {
        const sessionService = new SessionService();
        const session = await sessionService.getSession(sessionId);

        if (!session) {
          console.error(chalk.red(`\n Error: Session "${sessionId}" not found.\n`));
          process.exit(1);
        }

        const eventService = new EventService();
        const events = await eventService.getSessionEvents(sessionId);

        const fileEvents = events.filter((e) => e.type === "FILES_CHANGED");

        if (fileEvents.length === 0) {
          console.log(chalk.gray(`\n No file changes recorded for session ${sessionId}.\n`));
          return;
        }

        const allCreated = new Set<string>();
        const allModified = new Set<string>();
        const allDeleted = new Set<string>();

        for (const event of fileEvents) {
          const p = event.payload;
          for (const f of (p.created as string[]) || []) allCreated.add(f);
          for (const f of (p.modified as string[]) || []) allModified.add(f);
          for (const f of (p.deleted as string[]) || []) allDeleted.add(f);
        }

        console.log();
        console.log(
          chalk.bold(" File Changes") +
            chalk.gray(` — ${session.name} (${sessionId})`)
        );
        console.log(chalk.gray("─".repeat(56)));

        if (allCreated.size > 0) {
          console.log(chalk.green.bold("\n Created"));
          for (const f of allCreated) {
            console.log(chalk.green(`   + ${f}`));
          }
        }

        if (allModified.size > 0) {
          console.log(chalk.yellow.bold("\n Modified"));
          for (const f of allModified) {
            console.log(chalk.yellow(`   ~ ${f}`));
          }
        }

        if (allDeleted.size > 0) {
          console.log(chalk.red.bold("\n Deleted"));
          for (const f of allDeleted) {
            console.log(chalk.red(`   - ${f}`));
          }
        }

        console.log();
        console.log(chalk.gray("─".repeat(56)));

        const total = allCreated.size + allModified.size + allDeleted.size;
        console.log(
          chalk.gray(
            ` ${total} files · ${allCreated.size} created · ${allModified.size} modified · ${allDeleted.size} deleted`
          )
        );
        console.log();
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
