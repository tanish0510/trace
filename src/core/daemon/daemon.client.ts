import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { getTraceHome } from "../session/session.utils.js";

function getPidPath(): string {
  return path.join(getTraceHome(), "daemon.pid");
}

function getSocketPath(): string {
  return path.join(getTraceHome(), "daemon.sock");
}

export function isDaemonRunning(): boolean {
  const pidPath = getPidPath();
  if (!fs.existsSync(pidPath)) return false;

  try {
    const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    try { fs.unlinkSync(pidPath); } catch { /* */ }
    return false;
  }
}

export function startDaemon(): void {
  if (isDaemonRunning()) return;

  const entrypoint = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "daemon-entry.js",
  );

  const child = spawn(process.execPath, [entrypoint], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });

  child.unref();
}

export async function sendToDaemon(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sockPath = getSocketPath();

  return new Promise((resolve, reject) => {
    const client = net.createConnection(sockPath);
    let data = "";

    client.on("connect", () => {
      client.write(JSON.stringify(message));
      client.end();
    });

    client.on("data", (chunk) => { data += chunk.toString(); });

    client.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({ error: "invalid response" });
      }
    });

    client.on("error", (err) => {
      reject(err);
    });

    setTimeout(() => {
      client.destroy();
      reject(new Error("daemon connection timeout"));
    }, 5000);
  });
}

export async function ensureDaemon(): Promise<void> {
  if (isDaemonRunning()) return;
  startDaemon();
  await new Promise((r) => setTimeout(r, 1000));
}

export async function notifySessionStarted(sessionId: string, repoPath: string): Promise<void> {
  try {
    await ensureDaemon();
    await sendToDaemon({ type: "session_started", sessionId, repoPath });
  } catch { /* daemon is best-effort */ }
}

export async function getDaemonStatus(): Promise<Record<string, unknown> | null> {
  try {
    if (!isDaemonRunning()) return null;
    return await sendToDaemon({ type: "status" });
  } catch { return null; }
}

export async function stopDaemon(): Promise<void> {
  try {
    if (!isDaemonRunning()) return;
    await sendToDaemon({ type: "shutdown" });
  } catch { /* */ }
}
