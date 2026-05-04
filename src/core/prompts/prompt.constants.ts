export const PROMPT_DISPLAY_MAX_LENGTH = 72;

export function truncatePrompt(content: string, maxLen = PROMPT_DISPLAY_MAX_LENGTH): string {
  const oneLine = content.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen - 1) + "…";
}
