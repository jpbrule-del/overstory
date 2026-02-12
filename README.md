# Overstory

Project-agnostic swarm system for Claude Code agent orchestration. Overstory turns a single Claude Code session into a multi-agent team by spawning worker agents in git worktrees via tmux, coordinating them through a custom SQLite mail system, and merging their work back with tiered conflict resolution.

## How It Works

Your Claude Code session **is** the orchestrator. There is no separate daemon. CLAUDE.md + hooks + the `overstory` CLI provide everything.

```
Orchestrator (your Claude Code session)
  --> Team Lead (Claude Code in tmux, can spawn sub-workers)
        --> Specialist Workers (Claude Code in tmux, leaf nodes)
```

### Agent Types

| Agent | Role | Access |
|-------|------|--------|
| **Scout** | Read-only exploration and research | Read-only |
| **Builder** | Implementation and code changes | Read-write |
| **Reviewer** | Validation and code review | Read-only |
| **Lead** | Team coordination, can spawn sub-workers | Read-write |
| **Merger** | Branch merge specialist | Read-write |

### Key Architecture

- **Agent Definitions**: Two-layer system — base `.md` files define the HOW (workflow), per-task overlays define the WHAT (task scope)
- **Messaging**: Custom SQLite mail system (`bun:sqlite`, WAL mode, ~1-5ms per query) for inter-agent communication
- **Worktrees**: Each agent gets an isolated git worktree — no file conflicts between agents
- **Merge**: FIFO merge queue with 4-tier conflict resolution
- **Watchdog**: Mechanical process monitoring + AI-assisted failure triage

## Requirements

- [Bun](https://bun.sh) (v1.0+)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- git
- tmux

## Installation

```bash
# Clone the repository
git clone https://github.com/jayminwest/overstory.git
cd overstory

# Install dev dependencies
bun install

# Link the CLI globally
bun link
```

## Quick Start

```bash
# Initialize overstory in your project
cd your-project
overstory init

# Spawn a worker agent
overstory sling <task-id> --capability builder --name my-builder

# Check agent status
overstory status

# Check mail from agents
overstory mail check --inject
```

## CLI Reference

```
overstory init                          Initialize .overstory/ in current project

overstory sling <task-id>              Spawn a worker agent
  --capability <type>                    builder | scout | reviewer | lead | merger
  --name <name>                          Unique agent name
  --spec <path>                          Path to task spec file
  --files <f1,f2,...>                    Exclusive file scope
  --parent <agent-name>                  Parent (for hierarchy tracking)
  --depth <n>                            Current hierarchy depth

overstory prime                         Load context for orchestrator/agent
  --agent <name>                         Per-agent priming
  --compact                              Less context (for PreCompact hook)

overstory status                        Show all active agents, worktrees, beads state
  --json                                 JSON output
  --watch                                Live updating

overstory mail send                     Send a message
  --to <agent>  --subject <text>  --body <text>
  --type <status|question|result|error>
  --priority <low|normal|high|urgent>

overstory mail check                    Check inbox (unread messages)
  --agent <name>  --inject  --json

overstory mail list                     List messages with filters
  --from <name>  --to <name>  --unread

overstory mail read <id>                Mark message as read
overstory mail reply <id> --body <text> Reply in same thread

overstory merge                         Merge agent branches into canonical
  --branch <name>                        Specific branch
  --all                                  All completed branches
  --dry-run                              Check for conflicts only

overstory worktree list                 List worktrees with status
overstory worktree clean                Remove completed worktrees

overstory log <event>                   Log a hook event
overstory watch                         Start watchdog daemon
overstory metrics                       Show session metrics
```

## Tech Stack

- **Runtime**: Bun (TypeScript directly, no build step)
- **Dependencies**: Zero runtime dependencies — only Bun built-in APIs
- **Database**: SQLite via `bun:sqlite` (WAL mode for concurrent access)
- **Linting**: Biome (formatter + linter)
- **External CLIs**: `bd` (beads), `mulch`, `git`, `tmux` — invoked as subprocesses

## Development

```bash
# Run tests
bun test

# Run a single test
bun test __tests__/config.test.ts

# Lint + format check
biome check .

# Type check
tsc --noEmit

# All quality gates
bun test && biome check . && tsc --noEmit
```

### Versioning

Version is maintained in two places that must stay in sync:

1. `package.json` — `"version"` field
2. `src/index.ts` — `VERSION` constant

Use the bump script to update both:

```bash
bun run version:bump <major|minor|patch>
```

Git tags are created automatically by GitHub Actions when a version bump is pushed to `main`.

## Project Structure

```
overstory/
  src/
    index.ts                      CLI entry point (command router)
    types.ts                      Shared types and interfaces
    config.ts                     Config loader + validation
    errors.ts                     Custom error types
    commands/                     One file per CLI subcommand
    agents/                       Agent lifecycle management
    worktree/                     Git worktree + tmux management
    mail/                         SQLite mail system
    merge/                        Conflict resolution
    watchdog/                     Health monitoring
    logging/                      Multi-format logger
    metrics/                      SQLite metrics storage
    beads/                        bd CLI wrapper
    mulch/                        mulch CLI wrapper
  agents/                         Base agent definitions (.md)
  templates/                      Templates for overlays and hooks
  __tests__/                      All tests
```

## License

MIT
