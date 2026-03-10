---
name: 60-hooks
invoke: /60/hooks
description: Configure automation hooks and safety rails for continuous execution — checkpoints, error recovery, notifications, preset profiles
---

# /60/hooks — Automation Configuration

**Purpose**: Configure hooks and automation rules that allow `/60/run --auto` to execute for hours without manual intervention, while maintaining safety rails and keeping you informed.

**Input**: $ARGUMENTS

---

## Overview

The hooks system enables:
- **Continuous execution** without manual confirmation
- **Smart error recovery** with automatic retries
- **Progress notifications** at key milestones
- **Safety rails** to pause when human input is needed
- **Checkpoints** for recovery if something goes wrong

---

## Quick Setup

### Minimal (Safe Defaults)

```bash
60/hooks --init
```

Creates `.sixty/hooks.json` with conservative automation:
- Auto-proceeds through stories
- Pauses on errors
- Notifies on feature completion
- 3-hour session limit

### Full Automation

```bash
60/hooks --init --full-auto
```

Creates aggressive automation:
- Auto-retries on failures (2x)
- Auto-switches when blocked
- 8-hour session limit
- Checkpoints every 30 minutes

---

## Configuration File

Location: `.sixty/hooks.json`

```json
{
  "version": "1.0",
  "enabled": true,

  "lifecycle": {
    "onStoryStart": {
      "log": true,
      "updateTicket": true,
      "notify": false
    },
    "onStoryComplete": {
      "log": true,
      "updateTicket": true,
      "commit": true,
      "continue": true,
      "notify": false
    },
    "onFeatureComplete": {
      "log": true,
      "updateTicket": true,
      "commit": true,
      "notify": true,
      "notifyChannel": "slack",
      "runFullValidation": true,
      "pauseForReview": false,
      "continue": true
    },
    "onAllComplete": {
      "log": true,
      "notify": true,
      "generateReport": true
    }
  },

  "errorHandling": {
    "onQualityGateFail": {
      "action": "retry",
      "maxRetries": 2,
      "autoFix": {
        "lint": true,
        "format": true
      },
      "fallback": "pause"
    },
    "onImplementationError": {
      "action": "diagnose",
      "maxAttempts": 2,
      "fallback": "markBlocked"
    },
    "onBlocked": {
      "action": "switchStory",
      "fallback": "pause"
    }
  },

  "automation": {
    "autoConfirm": {
      "storyStart": true,
      "storyComplete": true,
      "featureStart": true,
      "featureComplete": true
    },
    "parallel": {
      "enabled": true,
      "maxConcurrent": 2
    }
  },

  "session": {
    "maxStories": 50,
    "maxHours": 8,
    "checkpointInterval": 30,
    "pauseOnLimitReached": true
  },

  "notifications": {
    "slack": {
      "enabled": false,
      "webhook": "${SLACK_WEBHOOK_URL}",
      "events": ["featureComplete", "blocked", "error", "allComplete"]
    }
  },

  "safety": {
    "requireApprovalFor": [
      "migration",
      "breaking-change",
      "security-sensitive"
    ],
    "maxConsecutiveErrors": 3,
    "pauseOnPatterns": [
      "same-error-repeated",
      "regression-detected"
    ]
  },

  "scheduled": {
    "healthCheck": {
      "enabled": true,
      "interval": "15m",
      "prompt": "Read .sixty/pipeline.json and .sixty/plan.json — report stories completed vs total, errors encountered, and elapsed time. If the same story has been in_progress for 2+ consecutive checks, flag it as potentially stuck."
    },
    "checkpoint": {
      "enabled": true,
      "interval": "30m",
      "prompt": "Create a pipeline checkpoint: snapshot .sixty/pipeline.json, record current git SHA via `git rev-parse HEAD`, and write to .sixty/checkpoints/<ISO-timestamp>.json. Log what was checkpointed."
    },
    "sessionTimeout": {
      "enabled": true,
      "after": "4h",
      "type": "once",
      "prompt": "Session has been running for 4+ hours. Read .sixty/pipeline.json and summarize progress: stories completed, stories remaining, any blocked. Ask if the user wants to continue, pause, or wrap up."
    }
  }
}
```

---

## Lifecycle Hooks

### onStoryStart

Triggered when a story begins execution.

| Field | Default | Description |
|-------|---------|-------------|
| `log` | true | Write to progress.md |
| `updateTicket` | true | Set Dev Hub subtask to "in_progress" |
| `notify` | false | Don't spam for every story |

### onStoryComplete

Triggered when a story passes all quality gates.

| Field | Default | Description |
|-------|---------|-------------|
| `log` | true | Append to progress.md |
| `updateTicket` | true | Mark Dev Hub subtask "done" |
| `commit` | true | Auto-commit |
| `continue` | true | Start next story |
| `notify` | false | Only notify on feature complete |

### onFeatureComplete

Triggered when all stories in a feature are done.

| Field | Default | Description |
|-------|---------|-------------|
| `notify` | true | Send Slack notification |
| `runFullValidation` | true | Run full typecheck + tests |
| `pauseForReview` | false | Set true to require human review |
| `continue` | true | Auto-start next feature |

### onAllComplete

Triggered when all features are done.

| Field | Default | Description |
|-------|---------|-------------|
| `generateReport` | true | Full session summary |
| `notify` | true | Send completion notification |

---

## Error Handling

### Quality Gate Failures

```
Gate fails -> Auto-fix (lint/format if enabled) -> Retry ->
  If pass -> Continue
  If fail -> Retry again (up to max)
  If exhausted -> Execute fallback (pause or markBlocked)
```

### Implementation Errors

```
Error occurs -> Analyze error -> Attempt fix ->
  If fixed -> Retry implementation
  If not -> Mark story blocked, switch to next
```

### Blocked Stories

Options: `switchStory` (skip to next executable), `wait` (poll every 30s), `pause` (stop execution).

---

## Safety Rails

### Always Requires Approval (regardless of settings)

- Database migrations
- Breaking API changes
- Security-sensitive operations (auth, permissions, RLS)
- Deployments

### Pause on Patterns

Automatically pause when problems detected:
- Same error 3+ times in a row
- Regression detected (test that passed now fails)
- Infinite loop (same story failing repeatedly)

### Max Consecutive Errors

After N errors in a row (default: 3):
```
Too Many Consecutive Errors

The last 3 operations failed:
  1. DARK-003: ESLint error (unused variable)
  2. DARK-003: ESLint error (unused variable) [retry]
  3. DARK-003: ESLint error (unused variable) [retry]

Pausing for manual review.

Resume: 60/run --resume
Skip:   60/run --skip DARK-003
Debug:  60/run --story DARK-003 --verbose
```

---

## Session Limits

Prevent runaway execution:

| Setting | Default | Description |
|---------|---------|-------------|
| `maxStories` | 50 | Pause after N stories |
| `maxHours` | 8 | Pause after N hours |
| `checkpointInterval` | 30 | Checkpoint every N minutes |
| `pauseOnLimitReached` | true | Pause vs hard stop |

When limit reached, present options: Continue (reset limits), Stop and save, Generate report.

---

## Checkpoints & Recovery

### Automatic Checkpoints

Created every N minutes (configurable):

```
.sixty/checkpoints/
  2026-03-07T09-00.json
  2026-03-07T09-30.json
  2026-03-07T10-00.json
```

**Checkpoint contents**:
```json
{
  "timestamp": "2026-03-07T09:30:00Z",
  "sessionId": "sess_abc123",
  "plan": { "/* snapshot of pipeline.json or plan.json */" },
  "gitCommit": "abc123",
  "lastCompletedStory": "DARK-002",
  "metrics": {
    "storiesCompleted": 9,
    "errorsEncountered": 1,
    "elapsed": "1h 30m"
  }
}
```

### Restore from Checkpoint

```bash
60/hooks --restore 2026-03-07T09-30
```

Actions:
1. Reset plan/pipeline.json to checkpoint state
2. Git reset to checkpoint commit
3. Restore progress.md
4. Confirm before proceeding (destructive)

### Resume Interrupted Session

```bash
60/hooks --resume
```

Finds the most recent checkpoint and continues from there.

---

## Preset Configurations

### Conservative (Default)

Best for: Learning the workflow, critical projects

```json
{
  "lifecycle": {
    "onStoryComplete": { "continue": true, "commit": true },
    "onFeatureComplete": { "pauseForReview": true }
  },
  "errorHandling": {
    "onQualityGateFail": { "action": "pause" }
  },
  "session": { "maxHours": 3, "maxStories": 20 }
}
```

### Balanced

Best for: Regular development, trusted codebase

```json
{
  "lifecycle": {
    "onStoryComplete": { "continue": true, "commit": true },
    "onFeatureComplete": { "continue": true, "notify": true }
  },
  "errorHandling": {
    "onQualityGateFail": { "action": "retry", "maxRetries": 2 }
  },
  "session": { "maxHours": 6, "maxStories": 40 }
}
```

### Full Auto

Best for: Overnight runs, well-tested templates

```json
{
  "lifecycle": {
    "onStoryComplete": { "continue": true, "commit": true },
    "onFeatureComplete": { "continue": true, "notify": true }
  },
  "errorHandling": {
    "onQualityGateFail": { "action": "retry", "maxRetries": 3, "autoFix": { "lint": true } },
    "onBlocked": { "action": "switchStory" }
  },
  "session": { "maxHours": 8, "maxStories": 50, "checkpointInterval": 30 },
  "scheduled": {
    "healthCheck": { "enabled": true, "interval": "15m" },
    "checkpoint": { "enabled": true, "interval": "30m" },
    "sessionTimeout": { "enabled": true, "after": "8h", "type": "once" }
  }
}
```

---

## Commands Reference

```bash
# Initialize
60/hooks --init              # Create with safe defaults (Conservative)
60/hooks --init --balanced   # Create with Balanced preset
60/hooks --init --full-auto  # Create with Full Auto preset

# View & modify
60/hooks --show              # Display current config
60/hooks --edit              # Open in editor
60/hooks --set <path> <val>  # Update specific setting

# Checkpoints
60/hooks --checkpoints       # List available
60/hooks --restore <id>      # Restore from checkpoint
60/hooks --resume            # Resume from latest

# Control
60/hooks --enable            # Enable hooks
60/hooks --disable           # Disable hooks temporarily
60/hooks --test              # Dry run (show what would happen)

# Scheduled crons
60/hooks --crons             # List active crons (calls CronList)
60/hooks --crons-start       # Create crons from hooks.json scheduled config
60/hooks --crons-stop        # Delete all active crons (calls CronDelete for each)
```

### Set Examples

```bash
# Enable Slack notifications
60/hooks --set notifications.slack.enabled true

# Increase session limit
60/hooks --set session.maxHours 12

# Disable auto-commit
60/hooks --set lifecycle.onStoryComplete.commit false

# Add approval requirement
60/hooks --set safety.requireApprovalFor '["migration", "api-change"]'
```

---

## Scheduled Tasks (Background Monitoring)

The `scheduled` section uses Claude Code's native `CronCreate` / `CronDelete` tools to run background prompts **between turns** during long `--auto` sessions. These are session-scoped — they die when the terminal closes.

### How It Works

1. `/60/run --auto` reads `scheduled` from hooks.json on startup
2. For each enabled task, calls `CronCreate` with the appropriate cron expression
3. Stores returned cron IDs in `.sixty/active-crons.json`
4. On pipeline completion (or `--disable`), calls `CronDelete` for each stored ID
5. Crons fire between turns — they queue if Claude is mid-story and fire when idle

### Task Types

| Task | Purpose | Default |
|------|---------|---------|
| `healthCheck` | Periodic progress report + stuck detection | Every 15m |
| `checkpoint` | Snapshot pipeline state + git SHA for recovery | Every 30m |
| `sessionTimeout` | One-shot reminder after N hours | After 4h |

### Interval → Cron Conversion

| Interval | Cron Expression | Notes |
|----------|----------------|-------|
| `5m` | `*/5 * * * *` | Every 5 minutes |
| `15m` | `*/15 * * * *` | Every 15 minutes |
| `30m` | `*/30 * * * *` | Every 30 minutes |
| `1h` | `0 * * * *` | Every hour |
| `2h` | `0 */2 * * *` | Every 2 hours |

One-shot tasks (`"type": "once"`) use the `after` field to calculate a specific fire time from session start.

### Limitations

- **Session-scoped**: crons die when the terminal closes. For durable scheduling, use GitHub Actions.
- **Fires between turns**: if a story takes 45 minutes of continuous execution, the health check queues and fires once Claude is idle — it won't interrupt mid-story.
- **No catch-up**: if Claude is busy through 3 intervals, it fires once when idle, not 3 times.
- **3-day auto-expiry**: recurring crons expire after 3 days (Claude Code built-in limit).

### Managing Scheduled Tasks

```bash
# View active crons
60/hooks --crons

# Disable all scheduled tasks (keeps hooks.json config)
60/hooks --crons-stop

# Re-enable scheduled tasks
60/hooks --crons-start

# Natural language
"what scheduled tasks do I have?"
"cancel the health check cron"
```

---

## Integration with /60/run

When `60/run --auto` is used, it reads `.sixty/hooks.json` and applies all configured hooks — including creating scheduled crons. See `/60/run` for `--auto` mode details.

```bash
# Standard: hooks from .sixty/hooks.json (creates crons automatically)
60/run --auto

# Override settings inline
60/run --auto --max-hours 4
60/run --auto --max-stories 10
60/run --auto --parallel

# Disable background crons but keep other hooks
60/run --auto --no-crons
```

---

## Integration with /60/ship

When running the full pipeline via `/60/ship`, hooks are automatically loaded if `.sixty/hooks.json` exists. The BUILD phase uses them for story execution. Safety rails apply to all phases.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Hooks not triggering | Check `enabled: true` in config |
| Notifications not sending | Verify `SLACK_WEBHOOK_URL` is set |
| Session ending early | Check `maxStories` and `maxHours` limits |
| Can't resume | Run `60/hooks --checkpoints` to find valid restore points |
| Too many retries | Reduce `maxRetries` or change `fallback` to `pause` |
