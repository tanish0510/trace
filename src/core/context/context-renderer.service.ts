import chalk from "chalk";
import type { ContextPack } from "./context.types.js";

export class ContextRendererService {
  renderMarkdown(pack: ContextPack): string {
    const lines: string[] = [];
    lines.push(`# ${pack.repoName} CONTEXT`);
    lines.push("");

    for (const section of pack.sections) {
      lines.push(`## ${section.title}`);
      for (const item of section.items) {
        if (item.includes("\n")) {
          for (const sub of item.split("\n")) {
            lines.push(sub.startsWith("  ") ? sub : `- ${sub}`);
          }
        } else {
          lines.push(`- ${item}`);
        }
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  renderCli(pack: ContextPack): void {
    console.log();
    console.log(chalk.bold.cyan(` ${pack.repoName} CONTEXT`));
    console.log(chalk.gray("═".repeat(64)));
    console.log();

    for (const section of pack.sections) {
      console.log(chalk.bold.white(`  ${section.title}`));
      for (const item of section.items) {
        if (item.includes("\n")) {
          for (const sub of item.split("\n")) {
            if (sub.startsWith("  ")) {
              console.log(chalk.gray(`      ${sub.trim()}`));
            } else {
              console.log(chalk.yellow(`    ${sub}`));
            }
          }
        } else {
          console.log(chalk.gray(`    ${item}`));
        }
      }
      console.log();
    }

    console.log(chalk.gray("═".repeat(64)));
    const modeLine = `mode: ${pack.mode}${pack.focus ? ` · focus: ${pack.focus}` : ""}`;
    console.log(chalk.gray(` ${modeLine}`));
    console.log();
  }
}
