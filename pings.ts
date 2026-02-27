/**
 * pi-pings — A pi extension that watches a pings/ directory for executable scripts.
 *
 * Each script in pings/ is a "ping" — a background process whose stdout lines
 * get injected into the agent's conversation via followUp().
 *
 * Convention:
 *   - Scripts must be executable (chmod +x)
 *   - Each line of stdout = one message injected into the agent
 *   - Exit 0 = script will be restarted (for "listen --once" style scripts)
 *   - Exit non-0 = script is broken, won't restart (logged)
 *   - Delete the script file to stop the ping
 *   - Modify the script file to restart it with new contents
 *
 * Usage:
 *   pi -e ./pings.ts
 *
 * Or place in ~/.pi/agent/extensions/pings.ts for global use.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import * as readline from "node:readline";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface PingProcess {
	proc: ChildProcess;
	scriptPath: string;
	alive: boolean;
}

export default function (pi: ExtensionAPI) {
	const running = new Map<string, PingProcess>();
	let pingsDir: string;
	let watcher: fs.FSWatcher | undefined;
	let shuttingDown = false;

	function deliver(msg: string) {
		try {
			pi.sendUserMessage(msg, { deliverAs: "followUp", triggerTurn: true });
		} catch {
			try {
				pi.sendUserMessage(msg);
			} catch (e) {
				console.error(`[pings] Failed to deliver:`, e);
			}
		}
	}

	function startPing(scriptPath: string) {
		const name = path.basename(scriptPath);

		// Kill existing if already running
		stopPing(name);

		try {
			const proc = spawn(scriptPath, [], {
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			});

			const entry: PingProcess = { proc, scriptPath, alive: true };
			running.set(name, entry);

			// Read stdout line by line — each line is a ping event
			const rl = readline.createInterface({ input: proc.stdout! });
			rl.on("line", (line) => {
				const trimmed = line.trim();
				if (!trimmed) return;
				deliver(`[PING:${name}] ${trimmed}`);
			});

			// Collect stderr for error reporting
			const stderrChunks: string[] = [];
			proc.stderr?.on("data", (chunk: Buffer) => {
				stderrChunks.push(chunk.toString());
			});

			proc.on("exit", (code) => {
				entry.alive = false;
				running.delete(name);
				if (shuttingDown) return;

				if (code !== 0 && code !== null) {
					const stderr = stderrChunks.join("").trim();
					const detail = stderr ? `: ${stderr}` : "";
					deliver(`[PING:${name}] exited with code ${code}${detail}`);
				}
			});

			proc.on("error", (err) => {
				running.delete(name);
				if (!shuttingDown) {
					deliver(`[PING:${name}] failed to start: ${err.message}`);
				}
			});
		} catch (err) {
			console.error(`[pings] Error starting ${name}:`, err);
		}
	}

	function stopPing(name: string) {
		const entry = running.get(name);
		if (!entry) return;
		if (entry.alive) {
			try {
				entry.proc.kill("SIGTERM");
			} catch {
				// already dead
			}
		}
		running.delete(name);
	}

	function syncPings() {
		if (!fs.existsSync(pingsDir)) {
			fs.mkdirSync(pingsDir, { recursive: true });
			return;
		}

		const scripts = new Set<string>();

		for (const file of fs.readdirSync(pingsDir)) {
			const filePath = path.join(pingsDir, file);
			try {
				const stat = fs.statSync(filePath);
				// Skip non-files and non-executable
				if (!stat.isFile()) continue;
				// Check executable bit (owner)
				if (!(stat.mode & 0o100)) continue;
			} catch {
				continue;
			}

			scripts.add(file);

			if (!running.has(file)) {
				startPing(filePath);
			}
		}

		// Stop pings whose scripts were deleted
		for (const name of running.keys()) {
			if (!scripts.has(name)) {
				stopPing(name);
			}
		}
	}

	// Debounce fs.watch events
	let syncTimer: ReturnType<typeof setTimeout> | undefined;
	function debouncedSync() {
		if (syncTimer) clearTimeout(syncTimer);
		syncTimer = setTimeout(syncPings, 200);
	}

	pi.on("session_start", async (_event, ctx) => {
		pingsDir = path.join(ctx.cwd, "pings");
		syncPings();

		try {
			watcher = fs.watch(pingsDir, () => debouncedSync());
		} catch {
			// Directory might not exist yet — that's fine, syncPings created it
			try {
				watcher = fs.watch(pingsDir, () => debouncedSync());
			} catch (e) {
				console.error("[pings] Failed to watch pings directory:", e);
			}
		}
	});

	pi.on("session_shutdown", async () => {
		shuttingDown = true;
		if (syncTimer) clearTimeout(syncTimer);
		watcher?.close();
		for (const name of [...running.keys()]) {
			stopPing(name);
		}
	});
}
