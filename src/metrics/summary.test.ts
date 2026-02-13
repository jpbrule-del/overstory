/**
 * Tests for metrics summary generation and formatting.
 *
 * Uses real MetricsStore with temp DB. No mocks.
 * Philosophy: "never mock what you can use for real" (mx-252b16).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupTempDir } from "../test-helpers.ts";
import type { SessionMetrics } from "../types.ts";
import { type MetricsStore, createMetricsStore } from "./store.ts";
import { formatSummary, generateSummary } from "./summary.ts";

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

// === generateSummary ===

describe("generateSummary", () => {
	test("empty store returns zeros and empty arrays", () => {
		const summary = generateSummary(store);

		expect(summary.totalSessions).toBe(0);
		expect(summary.completedSessions).toBe(0);
		expect(summary.averageDurationMs).toBe(0);
		expect(summary.byCapability).toEqual({});
		expect(summary.recentSessions).toEqual([]);
	});

	test("counts total and completed sessions correctly", () => {
		store.recordSession(makeSession({ beadId: "task-1", completedAt: "2026-01-01T00:05:00Z" }));
		store.recordSession(makeSession({ beadId: "task-2", completedAt: null }));
		store.recordSession(makeSession({ beadId: "task-3", completedAt: "2026-01-01T00:10:00Z" }));

		const summary = generateSummary(store);

		expect(summary.totalSessions).toBe(3);
		expect(summary.completedSessions).toBe(2);
	});

	test("groups by capability with correct counts and avg durations", () => {
		store.recordSession(
			makeSession({
				beadId: "task-1",
				capability: "builder",
				durationMs: 100_000,
			}),
		);
		store.recordSession(
			makeSession({
				beadId: "task-2",
				capability: "builder",
				durationMs: 200_000,
			}),
		);
		store.recordSession(
			makeSession({
				beadId: "task-3",
				capability: "scout",
				durationMs: 50_000,
			}),
		);

		const summary = generateSummary(store);

		expect(summary.byCapability.builder).toEqual({
			count: 2,
			avgDurationMs: 150_000,
		});
		expect(summary.byCapability.scout).toEqual({
			count: 1,
			avgDurationMs: 50_000,
		});
	});

	test("respects the limit parameter for recentSessions", () => {
		store.recordSession(makeSession({ beadId: "task-1" }));
		store.recordSession(makeSession({ beadId: "task-2" }));
		store.recordSession(makeSession({ beadId: "task-3" }));
		store.recordSession(makeSession({ beadId: "task-4" }));

		const summary = generateSummary(store, 2);

		expect(summary.totalSessions).toBe(4);
		expect(summary.recentSessions).toHaveLength(2);
	});

	test("sessions without completedAt counted in total but not completed", () => {
		store.recordSession(makeSession({ beadId: "task-1", completedAt: null }));
		store.recordSession(makeSession({ beadId: "task-2", completedAt: null }));
		store.recordSession(makeSession({ beadId: "task-3", completedAt: "2026-01-01T00:05:00Z" }));

		const summary = generateSummary(store);

		expect(summary.totalSessions).toBe(3);
		expect(summary.completedSessions).toBe(1);
	});

	test("capability breakdown excludes incomplete sessions from avgDurationMs", () => {
		store.recordSession(
			makeSession({
				beadId: "task-1",
				capability: "builder",
				durationMs: 100_000,
				completedAt: null,
			}),
		);
		store.recordSession(
			makeSession({
				beadId: "task-2",
				capability: "builder",
				durationMs: 200_000,
			}),
		);
		store.recordSession(
			makeSession({
				beadId: "task-3",
				capability: "builder",
				durationMs: 300_000,
			}),
		);

		const summary = generateSummary(store);

		// 3 total sessions, but only 2 completed
		expect(summary.byCapability.builder?.count).toBe(3);
		expect(summary.byCapability.builder?.avgDurationMs).toBe(250_000); // (200_000 + 300_000) / 2
	});
});

// === formatSummary ===

describe("formatSummary", () => {
	test("contains header '=== Session Metrics ==='", () => {
		const summary = generateSummary(store);
		const formatted = formatSummary(summary);

		expect(formatted).toContain("=== Session Metrics ===");
	});

	test("shows total/completed/average duration", () => {
		store.recordSession(makeSession({ beadId: "task-1", durationMs: 100_000 }));
		store.recordSession(makeSession({ beadId: "task-2", durationMs: 200_000 }));

		const summary = generateSummary(store);
		const formatted = formatSummary(summary);

		expect(formatted).toContain("Total sessions:     2");
		expect(formatted).toContain("Completed:          2");
		expect(formatted).toContain("Average duration:");
	});

	test("shows capability breakdown", () => {
		store.recordSession(makeSession({ beadId: "task-1", capability: "builder" }));
		store.recordSession(makeSession({ beadId: "task-2", capability: "scout" }));

		const summary = generateSummary(store);
		const formatted = formatSummary(summary);

		expect(formatted).toContain("By capability:");
		expect(formatted).toContain("builder:");
		expect(formatted).toContain("scout:");
	});

	test("shows recent sessions with status (done vs running)", () => {
		store.recordSession(
			makeSession({
				beadId: "task-1",
				agentName: "agent-done",
				completedAt: "2026-01-01T00:05:00Z",
			}),
		);
		store.recordSession(
			makeSession({
				beadId: "task-2",
				agentName: "agent-running",
				completedAt: null,
			}),
		);

		const summary = generateSummary(store);
		const formatted = formatSummary(summary);

		expect(formatted).toContain("Recent sessions:");
		expect(formatted).toContain("agent-done");
		expect(formatted).toContain("done");
		expect(formatted).toContain("agent-running");
		expect(formatted).toContain("running");
		expect(formatted).toContain("in progress");
	});

	test("formatDuration: <1000ms shows ms", () => {
		store.recordSession(makeSession({ beadId: "task-1", durationMs: 500 }));

		const summary = generateSummary(store);
		const formatted = formatSummary(summary);

		expect(formatted).toContain("500ms");
	});

	test("formatDuration: <60000ms shows seconds", () => {
		store.recordSession(makeSession({ beadId: "task-1", durationMs: 5_500 }));

		const summary = generateSummary(store);
		const formatted = formatSummary(summary);

		expect(formatted).toContain("5.5s");
	});

	test("formatDuration: >=60000ms shows minutes+seconds", () => {
		store.recordSession(makeSession({ beadId: "task-1", durationMs: 125_000 }));

		const summary = generateSummary(store);
		const formatted = formatSummary(summary);

		expect(formatted).toContain("2m 5s");
	});

	test("empty summary does not include 'By capability' or 'Recent sessions' sections", () => {
		const summary = generateSummary(store);
		const formatted = formatSummary(summary);

		expect(formatted).not.toContain("By capability:");
		expect(formatted).not.toContain("Recent sessions:");
	});
});
