/**
 * Tests for MetricsStore (SQLite-backed session metrics storage).
 *
 * Uses real bun:sqlite with temp files. No mocks.
 * Philosophy: "never mock what you can use for real" (mx-252b16).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupTempDir } from "../test-helpers.ts";
import type { SessionMetrics } from "../types.ts";
import { type MetricsStore, createMetricsStore } from "./store.ts";

let tempDir: string;
let dbPath: string;
let store: MetricsStore;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "overstory-metrics-test-"));
	dbPath = join(tempDir, "metrics.db");
	store = createMetricsStore(dbPath);
});

afterEach(async () => {
	store.close();
	await cleanupTempDir(tempDir);
});

/** Helper to create a SessionMetrics object with optional overrides. */
function makeSession(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
	return {
		agentName: "test-agent",
		beadId: "test-task-123",
		capability: "builder",
		startedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
		completedAt: new Date("2026-01-01T00:05:00Z").toISOString(),
		durationMs: 300_000,
		exitCode: 0,
		mergeResult: "auto-resolve",
		parentAgent: "coordinator",
		...overrides,
	};
}

// === recordSession ===

describe("recordSession", () => {
	test("inserts a session and retrieves it via getRecentSessions", () => {
		const session = makeSession();
		store.recordSession(session);

		const retrieved = store.getRecentSessions(10);
		expect(retrieved).toHaveLength(1);
		expect(retrieved[0]).toEqual(session);
	});

	test("INSERT OR REPLACE: same (agent_name, bead_id) key overwrites previous row", () => {
		const session1 = makeSession({ durationMs: 100_000 });
		const session2 = makeSession({ durationMs: 200_000 });

		store.recordSession(session1);
		store.recordSession(session2);

		const retrieved = store.getRecentSessions(10);
		expect(retrieved).toHaveLength(1);
		expect(retrieved[0]?.durationMs).toBe(200_000);
	});

	test("all fields roundtrip correctly (camelCase TS → snake_case SQLite → camelCase TS)", () => {
		const session = makeSession({
			agentName: "special-agent",
			beadId: "task-xyz",
			capability: "reviewer",
			startedAt: "2026-02-01T12:00:00Z",
			completedAt: "2026-02-01T12:30:00Z",
			durationMs: 1_800_000,
			exitCode: 42,
			mergeResult: "ai-resolve",
			parentAgent: "lead-agent",
		});

		store.recordSession(session);
		const retrieved = store.getRecentSessions(10);

		expect(retrieved).toHaveLength(1);
		expect(retrieved[0]).toEqual(session);
	});

	test("null fields (completedAt, exitCode, mergeResult, parentAgent) stored and retrieved as null", () => {
		const session = makeSession({
			completedAt: null,
			exitCode: null,
			mergeResult: null,
			parentAgent: null,
		});

		store.recordSession(session);
		const retrieved = store.getRecentSessions(10);

		expect(retrieved).toHaveLength(1);
		expect(retrieved[0]?.completedAt).toBeNull();
		expect(retrieved[0]?.exitCode).toBeNull();
		expect(retrieved[0]?.mergeResult).toBeNull();
		expect(retrieved[0]?.parentAgent).toBeNull();
	});
});

// === getRecentSessions ===

describe("getRecentSessions", () => {
	test("returns sessions ordered by started_at DESC (most recent first)", () => {
		const session1 = makeSession({
			beadId: "task-1",
			startedAt: "2026-01-01T10:00:00Z",
		});
		const session2 = makeSession({
			beadId: "task-2",
			startedAt: "2026-01-01T12:00:00Z",
		});
		const session3 = makeSession({
			beadId: "task-3",
			startedAt: "2026-01-01T11:00:00Z",
		});

		store.recordSession(session1);
		store.recordSession(session2);
		store.recordSession(session3);

		const retrieved = store.getRecentSessions(10);
		expect(retrieved).toHaveLength(3);
		expect(retrieved[0]?.beadId).toBe("task-2"); // most recent
		expect(retrieved[1]?.beadId).toBe("task-3");
		expect(retrieved[2]?.beadId).toBe("task-1"); // oldest
	});

	test("default limit is 20", () => {
		// Insert 25 sessions
		for (let i = 0; i < 25; i++) {
			store.recordSession(
				makeSession({
					beadId: `task-${i}`,
					startedAt: new Date(Date.now() + i * 1000).toISOString(),
				}),
			);
		}

		const retrieved = store.getRecentSessions();
		expect(retrieved).toHaveLength(20);
	});

	test("custom limit works (e.g., limit=2 returns only 2)", () => {
		store.recordSession(makeSession({ beadId: "task-1" }));
		store.recordSession(makeSession({ beadId: "task-2" }));
		store.recordSession(makeSession({ beadId: "task-3" }));

		const retrieved = store.getRecentSessions(2);
		expect(retrieved).toHaveLength(2);
	});

	test("empty DB returns empty array", () => {
		const retrieved = store.getRecentSessions(10);
		expect(retrieved).toEqual([]);
	});
});

// === getSessionsByAgent ===

describe("getSessionsByAgent", () => {
	test("filters by agent name correctly", () => {
		store.recordSession(makeSession({ agentName: "agent-a", beadId: "task-1" }));
		store.recordSession(makeSession({ agentName: "agent-b", beadId: "task-2" }));
		store.recordSession(makeSession({ agentName: "agent-a", beadId: "task-3" }));

		const retrieved = store.getSessionsByAgent("agent-a");
		expect(retrieved).toHaveLength(2);
		expect(retrieved[0]?.agentName).toBe("agent-a");
		expect(retrieved[1]?.agentName).toBe("agent-a");
	});

	test("returns empty array for unknown agent", () => {
		store.recordSession(makeSession({ agentName: "known-agent" }));

		const retrieved = store.getSessionsByAgent("unknown-agent");
		expect(retrieved).toEqual([]);
	});

	test("multiple sessions for same agent all returned, ordered by started_at DESC", () => {
		store.recordSession(
			makeSession({
				agentName: "agent-x",
				beadId: "task-1",
				startedAt: "2026-01-01T10:00:00Z",
			}),
		);
		store.recordSession(
			makeSession({
				agentName: "agent-x",
				beadId: "task-2",
				startedAt: "2026-01-01T12:00:00Z",
			}),
		);
		store.recordSession(
			makeSession({
				agentName: "agent-x",
				beadId: "task-3",
				startedAt: "2026-01-01T11:00:00Z",
			}),
		);

		const retrieved = store.getSessionsByAgent("agent-x");
		expect(retrieved).toHaveLength(3);
		expect(retrieved[0]?.beadId).toBe("task-2"); // most recent
		expect(retrieved[1]?.beadId).toBe("task-3");
		expect(retrieved[2]?.beadId).toBe("task-1"); // oldest
	});
});

// === getAverageDuration ===

describe("getAverageDuration", () => {
	test("average across all completed sessions (completedAt IS NOT NULL)", () => {
		store.recordSession(makeSession({ beadId: "task-1", durationMs: 100_000 }));
		store.recordSession(makeSession({ beadId: "task-2", durationMs: 200_000 }));
		store.recordSession(makeSession({ beadId: "task-3", durationMs: 300_000 }));

		const avg = store.getAverageDuration();
		expect(avg).toBe(200_000);
	});

	test("average filtered by capability", () => {
		store.recordSession(
			makeSession({ beadId: "task-1", capability: "builder", durationMs: 100_000 }),
		);
		store.recordSession(makeSession({ beadId: "task-2", capability: "scout", durationMs: 50_000 }));
		store.recordSession(
			makeSession({ beadId: "task-3", capability: "builder", durationMs: 200_000 }),
		);

		const avgBuilder = store.getAverageDuration("builder");
		const avgScout = store.getAverageDuration("scout");

		expect(avgBuilder).toBe(150_000);
		expect(avgScout).toBe(50_000);
	});

	test("returns 0 when no completed sessions exist", () => {
		const avg = store.getAverageDuration();
		expect(avg).toBe(0);
	});

	test("sessions with completedAt=null are excluded from average", () => {
		store.recordSession(makeSession({ beadId: "task-1", durationMs: 100_000, completedAt: null }));
		store.recordSession(makeSession({ beadId: "task-2", durationMs: 200_000 }));
		store.recordSession(makeSession({ beadId: "task-3", durationMs: 300_000 }));

		const avg = store.getAverageDuration();
		expect(avg).toBe(250_000); // (200_000 + 300_000) / 2
	});

	test("single session returns that session's duration", () => {
		store.recordSession(makeSession({ durationMs: 123_456 }));

		const avg = store.getAverageDuration();
		expect(avg).toBe(123_456);
	});
});

// === close ===

describe("close", () => {
	test("calling close does not throw", () => {
		expect(() => store.close()).not.toThrow();
	});
});
