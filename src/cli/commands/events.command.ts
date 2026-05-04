import { Command } from "commander";
import chalk from "chalk";
import { EventService } from "../../core/events/event.service.js";
import { SessionService } from "../../core/session/session.service.js";
import { formatEventTime } from "../../core/events/event.utils.js";
import { closeDatabase } from "../../core/storage/sqlite.js";

export function createEventsCommand(): Command {
  const cmd = new Command("events")
    .description("Show raw event history for a session")
    .argument("<session-id>", "Session ID to show events for")
    .action(async (sessionId: string) => {
      try {
        const sessionService = new SessionService();
        const session = await sessionService.getSession(sessionId);

        if (!session) {
          console.error(
            chalk.red(`\n Error: Session "${sessionId}" not found.\n`)
          );
          process.exit(1);
        }

        const eventService = new EventService();
        const events = await eventService.getSessionEvents(sessionId);

        if (events.length === 0) {
          console.log(
            chalk.gray(`\n No events recorded for session ${sessionId}.\n`)
          );
          return;
        }

        console.log();
        console.log(
          chalk.bold(` Events`) +
            chalk.gray(` — ${session.name} (${sessionId})`)
        );
        console.log(chalk.gray("─".repeat(56)));

        for (const event of events) {
          const time = formatEventTime(event.createdAt);
          const type = event.type;

          console.log(
            chalk.gray(` ${time}  `) + chalk.white(type)
          );
        }

        console.log(chalk.gray("─".repeat(56)));
        console.log(chalk.gray(` ${events.length} events`));
        console.log();
      } finally {
        closeDatabase();
      }
    });

  return cmd;
}
