# 60 Pipeline Pack — Setup Guide

The full consult-to-execution pipeline for Claude Code.

## What's Included

| Skill | Command | Purpose |
|-------|---------|---------|
| **60-consult** | `/60-consult` | Requirements discovery (3-10 questions + sub-agent analysis) |
| **60-plan** | `/60-plan` | Generate execution plan with stories |
| **60-prd** | `/60-prd` | Generate a Product Requirements Document (alternative to plan) |
| **60-run** | `/60-run` | Execute stories with mandatory agent teams (Implementer → Reviewer → Tester) |
| **60-audit** | `/60-audit` | Full codebase & database audit with agent team — finds dead code, errors, best practice violations |
| **60-hooks** | `/60-hooks` | Configure automation hooks and safety rails |

Plus **model profiles** (Economy / Balanced / Thorough) for cost/quality control.

## Installation

1. Copy this entire folder into your Claude Code skills directory:

```bash
# macOS / Linux
cp -r 60-pipeline-pack/* ~/.claude/skills/

# Windows (PowerShell)
Copy-Item -Recurse 60-pipeline-pack\* "$env:USERPROFILE\.claude\skills\"
```

2. That's it. The skills are available immediately.

## How It Works

### The Pipeline

```
/60-consult "your feature request"
    ↓ asks 3-10 clarifying questions
    ↓ deploys scout agents to analyze your codebase
    ↓ presents findings
    ↓ auto-chains into...
/60-plan
    ↓ generates stories with dependencies
    ↓ auto-chains into...
/60-run
    ↓ deploys agent teams per story (Implementer → Reviewer → Tester)
    ↓ runs quality gates
    ↓ commits each story
    ↓ continues until all stories complete
```

You run `/60-consult` once and the entire pipeline executes automatically.

### Standalone: Audit

```
/60-audit
    ↓ auto-detects your stack and database
    ↓ deploys 5 specialist agents (dead code, file structure, database, logic, best practices)
    ↓ leader reviews and categorizes findings (SAFE / NEEDS REVIEW / RISKY)
    ↓ presents report for your approval before applying any changes
```

### Model Profiles

At the start of any skill, you choose a profile:

| Profile | Leader | Agents | Best For |
|---------|--------|--------|----------|
| **Economy** | Sonnet | Haiku | Routine work, familiar code |
| **Balanced** | Opus | Sonnet | Most development work |
| **Thorough** | Opus | Opus | Critical features, unfamiliar code |

The profile carries through the entire chain — you only choose once.

See `60-model-profiles-README.md` for full details.

### Hooks (Optional)

Configure automation with `/60-hooks`:
- Auto-commit after each story
- Notifications on completion
- Safety rails (max stories per session, error limits)

## Requirements

- Claude Code CLI
- Agent teams enabled (Claude Code handles this automatically)

## Quick Start

```
/60-consult "Add dark mode to the app"
```

Answer the questions, pick a model profile, and watch it build.
