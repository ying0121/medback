const { execSync } = require("child_process");

/**
 * Find PIDs that are LISTENING on a TCP port (Windows + Unix).
 * @param {number} port
 * @returns {number[]}
 */
function findListenPids(port) {
  const pids = new Set();
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
      const needle = `:${port}`;
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes("LISTENING") || !line.includes(needle)) continue;
        // Match "...:3001 ... LISTENING 12345" without matching :30010
        const m = line.match(new RegExp(`:${port}\\s+.+LISTENING\\s+(\\d+)\\s*$`, "i"));
        if (m) pids.add(Number(m[1]));
      }
    } else {
      const out = execSync(`lsof -iTCP:${port} -sTCP:LISTEN -t`, { encoding: "utf8" });
      for (const part of out.split(/\s+/)) {
        const n = Number(part.trim());
        if (n) pids.add(n);
      }
    }
  } catch {
    /* no listeners / tools missing */
  }
  return [...pids].filter((pid) => pid > 0 && pid !== process.pid);
}

/**
 * @param {number} pid
 * @returns {string}
 */
function getCommandLine(pid) {
  try {
    if (process.platform === "win32") {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter\\"ProcessId=${pid}\\").CommandLine"`,
        { encoding: "utf8" }
      );
      return String(out || "").trim();
    }
    return execSync(`ps -p ${pid} -o args=`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/**
 * True when the process looks like this project's API server (or its nodemon wrapper).
 * @param {string} cmd
 */
function isMedibackServerProcess(cmd) {
  const c = cmd.toLowerCase().replace(/\\/g, "/");
  if (!c) return false;
  if (c.includes("mediback") && (c.includes("src/server.js") || c.includes("nodemon"))) return true;
  if (c.includes("src/server.js")) return true;
  return false;
}

/**
 * Free a port by stopping leftover mediback server processes that still hold it.
 * Safe: only kills matching node/nodemon server processes, never unrelated apps.
 * @param {number} port
 * @param {{ log?: (msg: string) => void }} [opts]
 * @returns {boolean} true if the port looks free afterward
 */
function ensurePortFree(port, opts = {}) {
  const log = opts.log || console.log;
  const pids = findListenPids(port);
  if (pids.length === 0) return true;

  for (const pid of pids) {
    const cmd = getCommandLine(pid);
    if (!isMedibackServerProcess(cmd)) {
      log(
        `[port] ${port} is held by PID ${pid} (not a mediback server). Leave it alone: ${cmd.slice(0, 120) || "(unknown)"}`
      );
      continue;
    }
    try {
      log(`[port] Stopping leftover mediback process PID ${pid} on port ${port}`);
      if (process.platform === "win32") {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch (err) {
      log(`[port] Could not stop PID ${pid}: ${err.message}`);
    }
  }

  // Brief wait for Windows to release the socket.
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (findListenPids(port).length === 0) return true;
    const waitUntil = Date.now() + 150;
    while (Date.now() < waitUntil) {
      /* spin */
    }
  }
  return findListenPids(port).length === 0;
}

module.exports = { ensurePortFree, findListenPids };
