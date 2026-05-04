import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { getTraceHome } from "../session/session.utils.js";
import type { RepositoryIdentity } from "./context.types.js";

export class RepositoryContextService {
  getRepoDir(identity: RepositoryIdentity): string {
    return path.join(getTraceHome(), "repos", identity.id);
  }

  ensureRepoDir(identity: RepositoryIdentity): string {
    const dir = this.getRepoDir(identity);
    const contextDir = path.join(dir, "context");
    if (!fs.existsSync(contextDir)) fs.mkdirSync(contextDir, { recursive: true });
    return dir;
  }

  identify(repoPath: string): RepositoryIdentity {
    const existing = this.loadIdentity(repoPath);
    if (existing) return existing;

    const remote = this.getGitRemote(repoPath);
    const name = path.basename(repoPath);
    const fingerprint = this.computeFingerprint(repoPath, remote);
    const id = this.slugify(name, fingerprint);

    const identity: RepositoryIdentity = {
      id,
      name,
      path: repoPath,
      gitRemote: remote,
      fingerprint,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.saveIdentity(identity);
    return identity;
  }

  resolveByPath(repoPath: string): RepositoryIdentity | null {
    return this.loadIdentity(repoPath);
  }

  private loadIdentity(repoPath: string): RepositoryIdentity | null {
    const registryPath = path.join(getTraceHome(), "repos", "registry.json");
    if (!fs.existsSync(registryPath)) return null;

    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as Record<string, RepositoryIdentity>;
      for (const entry of Object.values(registry)) {
        if (entry.path === repoPath) {
          return { ...entry, createdAt: new Date(entry.createdAt), updatedAt: new Date(entry.updatedAt) };
        }
        if (entry.gitRemote && entry.gitRemote === this.getGitRemote(repoPath)) {
          const updated = { ...entry, path: repoPath, updatedAt: new Date(), createdAt: new Date(entry.createdAt) };
          this.saveIdentity(updated);
          return updated;
        }
      }
    } catch { /* corrupt or empty */ }
    return null;
  }

  private saveIdentity(identity: RepositoryIdentity): void {
    const reposDir = path.join(getTraceHome(), "repos");
    if (!fs.existsSync(reposDir)) fs.mkdirSync(reposDir, { recursive: true });

    const registryPath = path.join(reposDir, "registry.json");
    let registry: Record<string, unknown> = {};
    if (fs.existsSync(registryPath)) {
      try { registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")); } catch { /* reset */ }
    }

    registry[identity.id] = {
      ...identity,
      createdAt: identity.createdAt.toISOString(),
      updatedAt: identity.updatedAt.toISOString(),
    };
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf-8");

    this.ensureRepoDir(identity);
    const metaPath = path.join(this.getRepoDir(identity), "metadata.json");
    fs.writeFileSync(metaPath, JSON.stringify({
      id: identity.id,
      name: identity.name,
      path: identity.path,
      gitRemote: identity.gitRemote,
      fingerprint: identity.fingerprint,
      createdAt: identity.createdAt.toISOString(),
      updatedAt: identity.updatedAt.toISOString(),
    }, null, 2) + "\n", "utf-8");
  }

  private getGitRemote(repoPath: string): string | null {
    try {
      return execSync("git config --get remote.origin.url", {
        cwd: repoPath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
      }).trim() || null;
    } catch { return null; }
  }

  private computeFingerprint(repoPath: string, remote: string | null): string {
    const source = remote || repoPath;
    return createHash("sha256").update(source).digest("hex").slice(0, 12);
  }

  private slugify(name: string, fingerprint: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${slug}-${fingerprint.slice(0, 6)}`;
  }
}
