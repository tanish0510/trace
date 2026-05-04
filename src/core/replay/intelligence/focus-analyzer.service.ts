import type { EngineeringBlock, Chapter } from "../aggregation/aggregation.types.js";

export class FocusAnalyzerService {
  filterBlocks(blocks: EngineeringBlock[], focus: string): EngineeringBlock[] {
    const lower = focus.toLowerCase();
    return blocks.filter((block) => this.blockMatchesFocus(block, lower));
  }

  filterChapters(chapters: Chapter[], focus: string): Chapter[] {
    const lower = focus.toLowerCase();

    return chapters
      .map((chapter) => ({
        ...chapter,
        blocks: chapter.blocks.filter((b) => this.blockMatchesFocus(b, lower)),
      }))
      .filter((chapter) => chapter.blocks.length > 0);
  }

  private blockMatchesFocus(block: EngineeringBlock, focus: string): boolean {
    const allFiles = [
      ...block.filesCreated,
      ...block.filesModified,
      ...block.filesDeleted,
    ];

    for (const f of allFiles) {
      if (f.toLowerCase().includes(focus)) return true;
    }

    if (block.intent.toLowerCase().includes(focus)) return true;
    if (block.domain.toLowerCase().includes(focus)) return true;

    for (const c of block.commits) {
      if (c.message.toLowerCase().includes(focus)) return true;
      if (c.branch.toLowerCase().includes(focus)) return true;
    }

    return false;
  }
}
