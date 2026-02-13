# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Coordinator & Supervisor Agents
- `overstory coordinator` command — persistent orchestrator that runs at project root, decomposes objectives into subtasks, dispatches agents via sling, and tracks batches via task groups
  - `start` / `stop` / `status` subcommands
  - `--attach` / `--no-attach` with TTY-aware auto-detection for tmux sessions
  - Scout-delegated spec generation for complex tasks
- Supervisor agent definition — per-project team lead (depth 1) that receives dispatch mail from coordinator, decomposes into worker-sized subtasks, manages worker lifecycle, and escalates unresolvable issues
- 7 base agent types (added coordinator + supervisor to existing scout, builder, reviewer, lead, merger)

#### Task Groups & Session Lifecycle
- `overstory group` command — batch coordination (`create` / `status` / `add` / `remove` / `list`) with auto-close when all member beads issues complete, mail notification to coordinator on auto-close
- Session checkpoint save/restore for compaction survivability (`prime --compact` restores from checkpoint)
- Handoff orchestration (initiate/resume/complete) for crash recovery

#### Typed Mail Protocol
- 8 protocol message types: `worker_done`, `merge_ready`, `merged`, `merge_failed`, `escalation`, `health_check`, `dispatch`, `assign`
- Type-safe `sendProtocol<T>()` and `parsePayload<T>()` for structured agent coordination
- JSON payload column with schema migration handling 3 upgrade paths

#### Agent Nudging
- `overstory nudge` command with retry (3x), debounce (500ms), and `--force` to skip debounce
- Auto-nudge on urgent/high priority mail send

#### Structural Tool Enforcement
- PreToolUse hooks mechanically block file-modifying tools (Write/Edit/NotebookEdit) for non-implementation agents (scout, reviewer, coordinator, supervisor)
- PreToolUse Bash guards block dangerous git operations (`push`, `reset --hard`, `clean -f`, etc.) for all agents
- Whitelist git add/commit for coordinator/supervisor capabilities while keeping git push blocked
- Block Claude Code native team/task tools (Task, TeamCreate, etc.) for all overstory agents — enforces overstory sling delegation

#### Watchdog Improvements
- ZFC principle: tmux liveness as primary signal, pid check as secondary, sessions.json as tertiary
- Descendant tree walking for process cleanup — `getPanePid()`, `getDescendantPids()`, `killProcessTree()` with SIGTERM → grace → SIGKILL
- Re-check zombies on every tick, handle investigate action
- Stalled state added to zombie reconciliation

#### Worker Self-Propulsion (Phase 3)
- Builder agents send `worker_done` mail on task completion
- Overlay quality gates include worker_done signal step
- Prime activation context injection for bound tasks
- `MISSING_WORKER_DONE` failure mode in builder definition

#### Interactive Agent Mode
- Switch sling from headless (`claude -p`) to interactive mode with tmux sendKeys beacon — hooks now fire, enabling mail, metrics, logs, and lastActivity updates
- Structured `buildBeacon()` with identity context and startup protocol
- Fix beacon sendKeys multiline bug (increase initial sleep, follow-up Enter after 500ms)

#### CLI Improvements
- `--verbose` flag for `overstory status`
- `--json` flag for `overstory sling`
- `--background` flag for `overstory watch`
- Help text for unknown subcommands
- `SUPPORTED_CAPABILITIES` constant and `Capability` type

#### Init & Deployment
- `overstory init` now deploys agent definitions (copies `agents/*.md` to `.overstory/agent-defs/`) via `import.meta.dir` resolution
- E2E lifecycle test validates full init → config → manifest → overlay pipeline on throwaway external projects

#### Testing Improvements
- Colocated tests with source files (moved from `__tests__/` to `src/`)
- Shared test harness: `createTempGitRepo()`, `cleanupTempDir()`, `commitFile()` in `src/test-helpers.ts`
- Replaced `Bun.spawn` mocks with real implementations in 3 test files
- Optimized test harness: 38.1s → 11.7s (-69%)
- Comprehensive metrics command test coverage
- E2E init-sling lifecycle test
- Test suite grew from initial release to 515 tests across 24 files (1286 expect() calls)

### Fixed

- **60+ bugs** resolved across 8 dedicated fix sessions, covering P1 criticals through P4 backlog items:
  - Hooks enforcement: tool guard sed patterns now handle optional space after JSON colons
  - Status display: filter completed sessions from active agent count
  - Session lifecycle: move session recording before beacon send to fix booting → working race condition
  - Stagger delay (`staggerDelayMs`) now actually enforced between agent spawns
  - Hardcoded `main` branch replaced with dynamic branch detection in worktree/manager and merge/resolver
  - Sling headless mode fixes for E2E validation
  - Input validation, environment variable handling, init improvements, cleanup lifecycle
  - `.gitignore` patterns for `.overstory/` artifacts
  - Mail, merge, and worktree subsystem edge cases

### Changed

- Agent propulsion principle: failure modes, cost awareness, and completion protocol added to all agent definitions
- Agent quality gates updated across all base definitions
- Test file paths updated from `__tests__/` convention to colocated `src/**/*.test.ts`

## [0.1.0] - 2026-02-12

### Added

- CLI entry point with command router (`overstory <command>`)
- `overstory init` — initialize `.overstory/` in a target project
- `overstory sling` — spawn worker agents in git worktrees via tmux
- `overstory prime` — load context for orchestrator or agent sessions
- `overstory status` — show active agents, worktrees, and project state
- `overstory mail` — SQLite-based inter-agent messaging (send/check/list/read/reply)
- `overstory merge` — merge agent branches with 4-tier conflict resolution
- `overstory worktree` — manage git worktrees (list/clean)
- `overstory log` — hook event logging (NDJSON + human-readable)
- `overstory watch` — watchdog daemon with health monitoring and AI-assisted triage
- `overstory metrics` — session metrics storage and reporting
- Agent manifest system with 5 base agent types (scout, builder, reviewer, lead, merger)
- Two-layer agent definition: base `.md` files (HOW) + dynamic overlays (WHAT)
- Persistent agent identity and CV system
- Hooks deployer for automatic worktree configuration
- beads (`bd`) CLI wrapper for issue tracking integration
- mulch CLI wrapper for structured expertise management
- Multi-format logging with secret redaction
- SQLite metrics storage for session analytics
- Full test suite using `bun test`
- Biome configuration for formatting and linting
- TypeScript strict mode with `noUncheckedIndexedAccess`

[Unreleased]: https://github.com/jayminwest/overstory/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jayminwest/overstory/releases/tag/v0.1.0
