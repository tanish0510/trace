import fs from "node:fs";
import path from "node:path";
import { getTraceHome } from "../session/session.utils.js";

export interface FileState {
  byteOffset: number;
  lastSeen: number;
}

export interface PollStateData {
  files: Record<string, FileState>;
  seenHashes: string[];
  updatedAt: number;
}

const STATE_FILE = "poll-state.json";

function getStatePath(): string {
  return path.join(getTraceHome(), STATE_FILE);
}

export function loadPollState(): PollStateData {
  try {
    const raw = fs.readFileSync(getStatePath(), "utf-8");
    return JSON.parse(raw) as PollStateData;
  } catch {
    return { files: {}, seenHashes: [], updatedAt: 0 };
  }
}

export function savePollState(state: PollStateData): void {
  state.updatedAt = Date.now();
  const stateDir = getTraceHome();
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  fs.writeFileSync(getStatePath(), JSON.stringify(state), "utf-8");
}
