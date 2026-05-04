import type { Session } from "../session/session.types.js";
import type { TraceEvent } from "../events/event.types.js";
import type { DiffSnapshot } from "../repository/repository.types.js";
import type { Prompt } from "../prompts/prompt.types.js";
import type { Chapter } from "../replay/aggregation/aggregation.types.js";
import type { ContextPack, ContextConfig, ContextSection } from "./context.types.js";
import { RelevanceEngineService } from "./relevance-engine.service.js";
import { ContextCompressionService } from "./context-compression.service.js";
import { IntentDetectorService } from "../replay/intelligence/intent-detector.service.js";

export class ContextPackBuilderService {
  private relevance = new RelevanceEngineService();
  private compression = new ContextCompressionService();
  private intentDetector = new IntentDetectorService();

  build(
    config: ContextConfig,
    sessions: Session[],
    events: TraceEvent[],
    diffs: DiffSnapshot[],
    prompts: Prompt[],
    chapters: Chapter[],
  ): ContextPack {
    const sections: ContextSection[] = [];
    const repoName = sessions[0]?.name.split("-").slice(0, -3).join("-")
      || config.repoPath.split("/").pop()
      || "unknown";

    const allFiles = [...new Set(events
      .filter((e) => e.type === "FILES_CHANGED")
      .flatMap((e) => [
        ...((e.payload.created as string[]) || []),
        ...((e.payload.modified as string[]) || []),
      ]))];
    const commitMessages = events
      .filter((e) => e.type === "COMMIT_CREATED")
      .map((e) => (e.payload.message as string) || "");
    const focus = config.focus
      || this.intentDetector.detectIntent(allFiles, config.branch, commitMessages);

    sections.push({ title: "Current Focus", items: [focus] });

    if (config.mode === "recent" || config.mode === "scoped") {
      const ranked = this.relevance.scoreFiles(events, diffs, config.focus);
      const files = this.compression.compressFiles(ranked);
      if (files.length > 0) {
        sections.push({ title: "Important Files", items: files });
      }
    }

    if (config.mode === "replay" || config.mode === "recent") {
      const filteredChapters = this.relevance.scoreChapters(chapters, config.focus);
      const compressed = this.compression.compressChapters(filteredChapters);
      if (compressed.length > 0) {
        const items = compressed.map((ch) => {
          const parts = [ch.title];
          if (ch.files.length > 0) parts.push(`  Files: ${ch.files.join(", ")}`);
          if (ch.commits.length > 0) parts.push(`  Commits: ${ch.commits.join("; ")}`);
          return parts.join("\n");
        });
        sections.push({ title: "Engineering Chapters", items });
      }
    }

    const sortedPrompts = this.relevance.scorePrompts(prompts, config.focus);
    const compressedPrompts = this.compression.compressPrompts(sortedPrompts);
    if (compressedPrompts.length > 0) {
      sections.push({ title: "Related Prompts", items: compressedPrompts.map((p) => `"${p}"`) });
    }

    const commits = events
      .filter((e) => e.type === "COMMIT_CREATED")
      .map((e) => ({
        hash: ((e.payload.hash as string) || "").slice(0, 7),
        message: (e.payload.message as string) || "",
      }));
    const compressedCommits = this.compression.compressCommits(commits);
    if (compressedCommits.length > 0) {
      sections.push({ title: "Recent Commits", items: compressedCommits });
    }

    sections.push({ title: "Current Branch", items: [config.branch] });

    return {
      repoName: repoName.toUpperCase(),
      branch: config.branch,
      mode: config.mode,
      focus: config.focus,
      generatedAt: new Date(),
      sections,
    };
  }
}
