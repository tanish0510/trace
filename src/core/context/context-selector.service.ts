import type { ContextMode, ContextConfig } from "./context.types.js";

const KNOWN_MODES: ContextMode[] = ["recent", "replay", "scoped"];

export class ContextSelectorService {
  parse(contextArg: string | boolean | undefined, repoPath: string, branch: string): ContextConfig | null {
    if (!contextArg) return null;

    if (contextArg === true) {
      return { mode: "recent", focus: null, repoPath, branch };
    }

    const value = String(contextArg).toLowerCase().trim();

    if (KNOWN_MODES.includes(value as ContextMode)) {
      return { mode: value as ContextMode, focus: null, repoPath, branch };
    }

    return { mode: "scoped", focus: value, repoPath, branch };
  }
}
