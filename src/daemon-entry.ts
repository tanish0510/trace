import { TraceDaemon } from "./core/daemon/daemon.service.js";

const daemon = new TraceDaemon();
daemon.start().catch((err) => {
  process.stderr.write(`Daemon failed: ${err}\n`);
  process.exit(1);
});
