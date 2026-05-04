export interface TraceState {
  activeSessionId: string | null;
}

export const DEFAULT_STATE: TraceState = {
  activeSessionId: null,
};
