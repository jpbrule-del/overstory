/**
 * Tmux session management for overstory agent workers.
 *
 * All operations use Bun.spawn to call the tmux CLI directly.
 * Session naming convention: `overstory-{agentName}`.
 */

import { dirname, resolve } from "node:path";
import { AgentError } from "../errors.ts";

/**
 * Detect the directory containing the overstory binary.
 *
 * Checks process.argv[0] first (the bun/node executable path won't help,
 * but process.argv[1] is the script path for `bun run`), then falls back
 * to `which overstory` to find it on the current PATH.
 *
 * Returns null if detection fails.
 */
async function detectOverstoryBinDir(): Promise<string | null> {
	// process.argv[1] is the script entry point (e.g., /path/to/overstory/src/index.ts)
	// The overstory binary (bun link) resolves to a bin dir
	// Try `which overstory` for the most reliable result
	try {
		const proc = Bun.spawn(["which", "overstory"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		if (exitCode === 0) {
			const binPath = (await new Response(proc.stdout).text()).trim();
			if (binPath.length > 0) {
				return dirname(resolve(binPath));
			}
		}
	} catch {
		// which not available or overstory not on PATH
	}

	// Fallback: if process.argv[1] points to overstory's own entry point (src/index.ts),
	// derive the bin dir from the bun binary that's running it
	const scriptPath = process.argv[1];
	if (scriptPath?.includes("overstory")) {
		const bunPath = process.argv[0];
		if (bunPath) {
			return dirname(resolve(bunPath));
		}
	}

	return null;
}

/**
 * Run a shell command and capture its output.
 */
async function runCommand(
	cmd: string[],
	cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(cmd, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

/**
 * Create a new detached tmux session running the given command.
 *
 * @param name - Session name (e.g., "overstory-auth-login")
 * @param cwd - Working directory for the session
 * @param command - Command to execute inside the session
 * @returns The PID of the tmux server process for this session
 * @throws AgentError if tmux is not installed or session creation fails
 */
export async function createSession(name: string, cwd: string, command: string): Promise<number> {
	// Ensure the tmux session's PATH includes the overstory binary directory
	// so that hooks calling `overstory` inside the session can find it
	const overstoryBinDir = await detectOverstoryBinDir();
	let wrappedCommand = command;
	if (overstoryBinDir) {
		wrappedCommand = `export PATH="${overstoryBinDir}:$PATH" && ${command}`;
	}

	const { exitCode, stderr } = await runCommand(
		["tmux", "new-session", "-d", "-s", name, "-c", cwd, wrappedCommand],
		cwd,
	);

	if (exitCode !== 0) {
		throw new AgentError(`Failed to create tmux session "${name}": ${stderr.trim()}`, {
			agentName: name,
		});
	}

	// Retrieve the actual PID of the process running inside the tmux pane
	const pidResult = await runCommand(["tmux", "list-panes", "-t", name, "-F", "#{pane_pid}"]);

	if (pidResult.exitCode !== 0) {
		throw new AgentError(
			`Created tmux session "${name}" but failed to retrieve PID: ${pidResult.stderr.trim()}`,
			{ agentName: name },
		);
	}

	const pidStr = pidResult.stdout.trim().split("\n")[0];
	if (pidStr) {
		const pid = Number.parseInt(pidStr, 10);
		if (!Number.isNaN(pid)) {
			return pid;
		}
	}

	throw new AgentError(`Created tmux session "${name}" but could not find its pane PID`, {
		agentName: name,
	});
}

/**
 * List all active tmux sessions.
 *
 * @returns Array of session name/pid pairs
 * @throws AgentError if tmux is not installed
 */
export async function listSessions(): Promise<Array<{ name: string; pid: number }>> {
	const { exitCode, stdout, stderr } = await runCommand([
		"tmux",
		"list-sessions",
		"-F",
		"#{session_name}:#{pid}",
	]);

	// Exit code 1 with "no server running" means no sessions exist — not an error
	if (exitCode !== 0) {
		if (stderr.includes("no server running") || stderr.includes("no sessions")) {
			return [];
		}
		throw new AgentError(`Failed to list tmux sessions: ${stderr.trim()}`);
	}

	const sessions: Array<{ name: string; pid: number }> = [];
	const lines = stdout.trim().split("\n");

	for (const line of lines) {
		if (line.trim() === "") continue;
		const sepIndex = line.indexOf(":");
		if (sepIndex === -1) continue;

		const name = line.slice(0, sepIndex);
		const pidStr = line.slice(sepIndex + 1);
		if (name && pidStr) {
			const pid = Number.parseInt(pidStr, 10);
			if (!Number.isNaN(pid)) {
				sessions.push({ name, pid });
			}
		}
	}

	return sessions;
}

/**
 * Kill a tmux session by name.
 *
 * @param name - Session name to kill
 * @throws AgentError if the session does not exist or cannot be killed
 */
export async function killSession(name: string): Promise<void> {
	const { exitCode, stderr } = await runCommand(["tmux", "kill-session", "-t", name]);

	if (exitCode !== 0) {
		throw new AgentError(`Failed to kill tmux session "${name}": ${stderr.trim()}`, {
			agentName: name,
		});
	}
}

/**
 * Check whether a tmux session is still alive.
 *
 * @param name - Session name to check
 * @returns true if the session exists, false otherwise
 */
export async function isSessionAlive(name: string): Promise<boolean> {
	const { exitCode } = await runCommand(["tmux", "has-session", "-t", name]);
	return exitCode === 0;
}

/**
 * Send keys to a tmux session.
 *
 * @param name - Session name to send keys to
 * @param keys - The keys/text to send
 * @throws AgentError if the session does not exist or send fails
 */
export async function sendKeys(name: string, keys: string): Promise<void> {
	const { exitCode, stderr } = await runCommand(["tmux", "send-keys", "-t", name, keys, "Enter"]);

	if (exitCode !== 0) {
		throw new AgentError(`Failed to send keys to tmux session "${name}": ${stderr.trim()}`, {
			agentName: name,
		});
	}
}
