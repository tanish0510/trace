import fs from "node:fs";
import { ensureTraceDir, getStatePath } from "../session/session.utils.js";
import type { TraceState } from "./state.types.js";
import { DEFAULT_STATE } from "./state.types.js";

export class StateService {
  read(): TraceState {
    const statePath = getStatePath();

    if (!fs.existsSync(statePath)) {
      return { ...DEFAULT_STATE };
    }

    try {
      const raw = fs.readFileSync(statePath, "utf-8");
      return JSON.parse(raw) as TraceState;
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  write(state: TraceState): void {
    ensureTraceDir();
    const statePath = getStatePath();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
  }

  setActiveSession(sessionId: string): void {
    this.write({ activeSessionId: sessionId });
  }

  clearActiveSession(): void {
    this.write({ activeSessionId: null });
  }

  getActiveSessionId(): string | null {
    return this.read().activeSessionId;
  }
}
