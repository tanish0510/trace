export class IntentDetectorService {
  detectIntent(files: string[], branch: string, commitMessages: string[]): string {
    const fromCommit = this.intentFromCommits(commitMessages);
    if (fromCommit) return fromCommit;

    const fromBranch = this.intentFromBranch(branch);
    if (fromBranch) return fromBranch;

    return this.intentFromFiles(files);
  }

  detectDomain(files: string[]): string {
    if (files.length === 0) return "General";

    const dirCounts = new Map<string, number>();
    for (const file of files) {
      const parts = file.split("/").filter(Boolean);
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join("/");
        dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
      }
    }

    if (dirCounts.size === 0) return "Root";

    const topDir = [...dirCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    return topDir;
  }

  generateBlockTitle(files: string[], commits: string[], branch: string): string {
    if (commits.length > 0) {
      const last = commits[commits.length - 1]!;
      return this.titleCase(last);
    }

    const intent = this.detectIntent(files, branch, commits);
    const domain = this.detectDomain(files);

    if (domain !== "General" && domain !== "Root") {
      return `${intent} — ${domain}`;
    }

    return intent;
  }

  private intentFromCommits(messages: string[]): string | null {
    if (messages.length === 0) return null;

    const meaningful = messages.filter((m) => m.length > 3);
    if (meaningful.length === 0) return null;

    const prefixMap: Record<string, string> = {};
    for (const msg of meaningful) {
      const match = msg.match(/^(feat|fix|refactor|chore|docs|test|style|perf|ci|build|revert)[:(]/i);
      if (match) {
        const prefix = match[1]!.toLowerCase();
        prefixMap[prefix] = (prefixMap[prefix] || "") + " " + msg;
      }
    }

    const prefixLabels: Record<string, string> = {
      feat: "Feature Development",
      fix: "Bug Fix",
      refactor: "Refactoring",
      chore: "Maintenance",
      docs: "Documentation",
      test: "Testing",
      style: "Styling",
      perf: "Performance",
      ci: "CI/CD",
      build: "Build System",
      revert: "Revert",
    };

    const dominantPrefix = Object.keys(prefixMap).sort(
      (a, b) => (prefixMap[b]?.length ?? 0) - (prefixMap[a]?.length ?? 0),
    )[0];

    if (dominantPrefix && prefixLabels[dominantPrefix]) {
      return prefixLabels[dominantPrefix]!;
    }

    const last = meaningful[meaningful.length - 1]!;
    const subject = this.extractSubject(last);
    if (subject) return this.titleCase(subject);

    return null;
  }

  private intentFromBranch(branch: string): string | null {
    if (!branch || branch === "unknown" || branch === "HEAD" || branch === "main" || branch === "master") {
      return null;
    }

    const cleaned = branch
      .replace(/^(feature|feat|fix|bugfix|hotfix|chore|refactor|release|docs|test)[/\\-]/i, "")
      .replace(/^[A-Z]+-\d+[-/\\]/i, "");

    if (cleaned === branch) {
      const segments = branch.split(/[-/\\]/).filter((s) => s.length > 1 && !/^\d+$/.test(s));
      if (segments.length > 0) {
        return this.titleCase(segments.join(" "));
      }
    }

    if (cleaned.length > 2) {
      return this.titleCase(cleaned.replace(/[-_/\\]/g, " "));
    }

    return null;
  }

  private intentFromFiles(files: string[]): string {
    if (files.length === 0) return "General Work";

    const segments = new Map<string, number>();

    for (const file of files) {
      const parts = file.split("/").filter(Boolean);

      for (const part of parts) {
        const clean = part
          .replace(/\.(ts|js|tsx|jsx|py|rs|go|rb|java|css|scss|md|json|yaml|yml|toml|sql)$/i, "")
          .replace(/\.(service|controller|handler|module|component|spec|test|config|types|utils|model|entity|schema|repository|factory)$/i, "");

        if (clean.length <= 2) continue;

        const words = this.splitCamelKebab(clean);
        for (const word of words) {
          if (word.length > 2 && !this.isBoilerplate(word)) {
            segments.set(word, (segments.get(word) || 0) + 1);
          }
        }
      }
    }

    if (segments.size === 0) return "General Work";

    const sorted = [...segments.entries()].sort((a, b) => b[1] - a[1]);
    const topWords = sorted.slice(0, 3).map(([w]) => w);

    return this.titleCase(topWords.join(" ")) + " Changes";
  }

  private extractSubject(commitMsg: string): string | null {
    let msg = commitMsg
      .replace(/^(feat|fix|refactor|chore|docs|test|style|perf|ci|build|revert)[:(]\s*/i, "")
      .replace(/\)\s*:\s*/, "")
      .replace(/\(.*?\)/, "")
      .trim();

    if (msg.length > 60) {
      msg = msg.slice(0, 57) + "...";
    }

    return msg.length > 3 ? msg : null;
  }

  private splitCamelKebab(str: string): string[] {
    return str
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_./]/g, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter((s) => s.length > 0);
  }

  private isBoilerplate(word: string): boolean {
    const skip = new Set([
      "src", "core", "lib", "app", "main", "index", "dist", "build",
      "node", "modules", "package", "config", "utils", "util",
      "helper", "helpers", "common", "shared", "base", "abstract",
      "default", "new", "old", "tmp", "temp", "the",
    ]);
    return skip.has(word.toLowerCase());
  }

  private titleCase(str: string): string {
    return str
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\s+/g, " ")
      .trim();
  }
}
