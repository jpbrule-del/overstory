# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
