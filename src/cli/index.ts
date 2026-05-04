#!/usr/bin/env node

import { Command } from "commander";
import { createClaudeCommand } from "./commands/claude.command.js";
import { createSessionsCommand } from "./commands/sessions.command.js";
import { createStatusCommand } from "./commands/status.command.js";
import { createSessionCommand, createResumeCommand } from "./commands/resume.command.js";
import { createEventsCommand } from "./commands/events.command.js";
import { createTimelineCommand } from "./commands/timeline.command.js";
import { createChangesCommand } from "./commands/changes.command.js";
import { createDiffCommand } from "./commands/diff.command.js";
import { createReplayCommand } from "./commands/replay.command.js";
import { createPromptCommand } from "./commands/prompt.command.js";
import { createPromptsCommand } from "./commands/prompts.command.js";
import { createWhyCommand } from "./commands/why.command.js";
import { createNoteCommand } from "./commands/note.command.js";
import { createContextCommand } from "./commands/context.command.js";
import { createDaemonCommand } from "./commands/daemon.command.js";
import { createFindCommand } from "./commands/find.command.js";
import { createRecentCommand } from "./commands/recent.command.js";

const program = new Command();

program
  .name("trc")
  .description(
    "Local-first memory and observability layer for AI-assisted engineering workflows"
  )
  .version("0.1.0");

program.addCommand(createClaudeCommand());
program.addCommand(createSessionsCommand());
program.addCommand(createStatusCommand());
program.addCommand(createSessionCommand());
program.addCommand(createResumeCommand());
program.addCommand(createEventsCommand());
program.addCommand(createTimelineCommand());
program.addCommand(createChangesCommand());
program.addCommand(createDiffCommand());
program.addCommand(createReplayCommand());
program.addCommand(createPromptCommand());
program.addCommand(createPromptsCommand());
program.addCommand(createWhyCommand());
program.addCommand(createNoteCommand());
program.addCommand(createContextCommand());
program.addCommand(createDaemonCommand());
program.addCommand(createFindCommand());
program.addCommand(createRecentCommand());

program.parse();
