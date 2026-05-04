import type { EngineeringBlock, Chapter, ChapterSummary } from "./aggregation.types.js";

export class ChapterBuilderService {
  buildChapters(blocks: EngineeringBlock[]): Chapter[] {
    if (blocks.length === 0) return [];

    const groups = this.groupByCommitBoundaries(blocks);
    const chapters: Chapter[] = [];
    let chapterNum = 0;

    for (const group of groups) {
      if (this.isOnlyLifecycle(group)) continue;

      chapterNum++;
      const title = this.generateChapterTitle(group, chapterNum);
      const start = group[0]!.startTime;
      const end = group[group.length - 1]!.endTime;

      chapters.push({
        number: chapterNum,
        title,
        blocks: group,
        startTime: start,
        endTime: end,
        duration: this.formatDuration(start, end),
        summary: this.computeSummary(group),
      });
    }

    return chapters;
  }

  private groupByCommitBoundaries(blocks: EngineeringBlock[]): EngineeringBlock[][] {
    const groups: EngineeringBlock[][] = [];
    let current: EngineeringBlock[] = [];

    for (const block of blocks) {
      current.push(block);

      if (block.commits.length > 0) {
        groups.push([...current]);
        current = [];
      }
    }

    if (current.length > 0) {
      if (groups.length > 0 && this.isOnlyLifecycle(current)) {
        groups[groups.length - 1]!.push(...current);
      } else {
        groups.push(current);
      }
    }

    return groups;
  }

  private isOnlyLifecycle(blocks: EngineeringBlock[]): boolean {
    const allFiles = blocks.flatMap((b) => [
      ...b.filesCreated,
      ...b.filesModified,
      ...b.filesDeleted,
    ]);
    const allCommits = blocks.flatMap((b) => b.commits);

    return allFiles.length === 0 && allCommits.length === 0;
  }

  private generateChapterTitle(blocks: EngineeringBlock[], num: number): string {
    const commits = blocks.flatMap((b) => b.commits);
    if (commits.length > 0) {
      const last = commits[commits.length - 1]!;
      return this.titleCase(last.message);
    }

    const intents = blocks
      .map((b) => b.intent)
      .filter((i) => i !== "General Work" && i !== "General Changes");

    if (intents.length > 0) {
      return intents[0]!;
    }

    return `Phase ${num}`;
  }

  private computeSummary(blocks: EngineeringBlock[]): ChapterSummary {
    const files = new Set<string>();
    let insertions = 0;
    let deletions = 0;
    let commits = 0;

    for (const b of blocks) {
      for (const f of b.filesCreated) files.add(f);
      for (const f of b.filesModified) files.add(f);
      for (const f of b.filesDeleted) files.add(f);
      insertions += b.insertions;
      deletions += b.deletions;
      commits += b.commits.length;
    }

    return { filesChanged: files.size, insertions, deletions, commits };
  }

  private formatDuration(start: Date, end: Date): string {
    const ms = end.getTime() - start.getTime();
    if (ms < 1000) return "< 1s";
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    if (ms < 3_600_000) return s > 0 ? `${m}m ${s}s` : `${m}m`;
    const h = Math.floor(ms / 3_600_000);
    const rm = Math.round((ms % 3_600_000) / 60_000);
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  }

  private titleCase(str: string): string {
    if (!str) return "Untitled";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
