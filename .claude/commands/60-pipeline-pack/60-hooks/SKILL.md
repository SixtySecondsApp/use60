---
name: 60-hooks
invoke: /60-hooks
description: Configure automation hooks and safety rails for continuous execution
---

# 60/hooks — Automation Configuration

**Purpose**: Configure hooks and automation rules that allow the 60/ workflow to run for hours without manual intervention, while maintaining safety rails and keeping you informed.

---

## Cross-Platform Compatibility

- Works on **Windows**, **macOS**, and **Linux**
- All file paths use forward slashes (`/`) in config files
- Shell commands in hooks run via Claude's Bash tool (bash on all platforms)
- JSON config files are platform-agnostic

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

Creates conservative automation:
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
      "generateReport": true,
      "celebrate": true
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
  }
}
```

---

## Lifecycle Hooks

### onStoryStart

Triggered when a story begins execution.

```json
{
  "onStoryStart": {
    "log": true,           // Write to progress.md
    "updateTicket": true,  // Set ticket to "in_progress"
    "notify": false        // Don't spam for every story
  }
}
```

### onStoryComplete

Triggered when a story passes all quality gates.

```json
{
  "onStoryComplete": {
    "log": true,           // Append to progress.md
    "updateTicket": true,  // Mark ticket "done"
    "commit": true,        // Auto-commit
    "continue": true,      // Start next story
    "notify": false        // Only notify on feature complete
  }
}
```

### onFeatureComplete

Triggered when all stories in a feature are done.

```json
{
  "onFeatureComplete": {
    "log": true,
    "updateTicket": true,
    "commit": true,
    "notify": true,              // Send notification
    "notifyChannel": "slack",
    "runFullValidation": true,   // Run full typecheck + tests
    "pauseForReview": false,     // Set true to require review
    "continue": true             // Auto-start next feature
  }
}
```

### onAllComplete

Triggered when all features are done.

```json
{
  "onAllComplete": {
    "log": true,
    "notify": true,
    "generateReport": true,
    "celebrate": true       // Fun completion message 🎉
  }
}
```

---

## Error Handling

### Quality Gate Failures

```json
{
  "onQualityGateFail": {
    "action": "retry",      // Options: retry, pause, skip
    "maxRetries": 2,
    "autoFix": {
      "lint": true,         // Auto-fix lint errors
      "format": true        // Auto-fix formatting
    },
    "fallback": "pause"     // What to do if retries exhausted
  }
}
```

**Flow**:
```
Gate fails → Auto-fix (if enabled) → Retry → 
  If pass → Continue
  If fail → Retry again (up to max)
  If exhausted → Execute fallback
```

### Implementation Errors

```json
{
  "onImplementationError": {
    "action": "diagnose",   // Options: diagnose, rollback, pause
    "maxAttempts": 2,
    "fallback": "markBlocked"
  }
}
```

**Diagnose Flow**:
```
Error occurs → Analyze error → Attempt fix →
  If fixed → Retry implementation
  If not → Mark story blocked, switch to next
```

### Blocked Stories

```json
{
  "onBlocked": {
    "action": "switchStory",  // Options: wait, switchStory, pause
    "waitTimeout": 300,       // Seconds to wait (if action is "wait")
    "fallback": "pause"
  }
}
```

---

## Automation Settings

### Auto-Confirm

Skip confirmation prompts:

```json
{
  "autoConfirm": {
    "storyStart": true,      // Don't ask "Start DARK-003?"
    "storyComplete": true,   // Don't ask "Mark complete?"
    "featureStart": true,    // Don't ask "Start dark-mode?"
    "featureComplete": true  // Don't ask "Feature done, continue?"
  }
}
```

**Always requires confirmation** (regardless of settings):
- Database migrations
- Breaking changes
- Security-sensitive operations
- Deployments

### Parallel Execution

```json
{
  "parallel": {
    "enabled": true,
    "maxConcurrent": 2       // Max stories at once
  }
}
```

---

## Session Limits

Prevent runaway execution:

```json
{
  "session": {
    "maxStories": 50,        // Pause after 50 stories
    "maxHours": 8,           // Pause after 8 hours
    "checkpointInterval": 30, // Checkpoint every 30 min
    "pauseOnLimitReached": true
  }
}
```

When limit reached:
```
⏰ Session Limit Reached

Completed: 50 stories in 6h 45m
Remaining: 12 stories

Options:
  [C] Continue (reset limits)
  [S] Stop and save
  [R] Generate report

Choice: _
```

---

## Safety Rails

### Require Approval

Some operations always need human approval:

```json
{
  "requireApprovalFor": [
    "migration",           // Database schema changes
    "breaking-change",     // API breaking changes
    "security-sensitive",  // Auth, permissions
    "deployment"           // Production deployments
  ]
}
```

When encountered:
```
⚠️ Approval Required

Story DARK-001 includes a database migration.
This requires manual approval.

Migration preview:
  CREATE TABLE user_preferences (...)
  
Approve and continue? [Y/n]
```

### Pause on Patterns

Automatically pause when problems detected:

```json
{
  "pauseOnPatterns": [
    "same-error-repeated",    // Same error 3+ times
    "regression-detected",    // Test that passed now fails
    "infinite-loop"           // Same story failing repeatedly
  ]
}
```

### Max Consecutive Errors

```json
{
  "maxConsecutiveErrors": 3
}
```

After 3 errors in a row:
```
🛑 Too Many Consecutive Errors

The last 3 operations failed:
  1. DARK-003: ESLint error (unused variable)
  2. DARK-003: ESLint error (unused variable) [retry]
  3. DARK-003: ESLint error (unused variable) [retry]

This might indicate a systematic issue.
Pausing for manual review.

Resume: 60/run --resume
Skip:   60/run --skip DARK-003
Debug:  60/run --story DARK-003 --verbose
```

---

## Notifications

### Slack Integration

```json
{
  "notifications": {
    "slack": {
      "enabled": true,
      "webhook": "${SLACK_WEBHOOK_URL}",
      "channel": "#dev-updates",
      "events": ["featureComplete", "blocked", "error", "allComplete"]
    }
  }
}
```

**Environment variable**:
```bash
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
```

### Message Examples

**Feature Complete**:
```
✅ Feature Complete: dark-mode

Stories: 7/7
Time: 2h 15m (est: 2h 30m)
Progress: 15/22 total (68%)

Next: billing feature (8 stories)
```

**Story Blocked**:
```
⚠️ Story Blocked: DARK-003

Reason: ESLint error - unused variable
Attempts: 2/3
Action needed: Manual review

View: https://devhub.app/ticket/TICK-112
```

**All Complete**:
```
🎉 Project Complete: MyApp

Features: 3/3 ✅
Stories: 22/22 ✅
Total time: 8h 30m

Great work! 🚀
```

---

## Checkpoints & Recovery

### Automatic Checkpoints

Created every N minutes (configurable):

```
.sixty/checkpoints/
├── 2025-01-15T09-00.json
├── 2025-01-15T09-30.json
└── 2025-01-15T10-00.json
```

**Checkpoint contents**:
```json
{
  "timestamp": "2025-01-15T09:30:00Z",
  "sessionId": "sess_abc123",
  "plan": { /* snapshot of plan.json */ },
  "gitCommit": "abc123",
  "lastCompletedStory": "DARK-002",
  "metrics": {
    "storiesCompleted": 9,
    "errorsEncountered": 1,
    "elapsed": "1h 30m"
  }
}
```

### List Checkpoints

```bash
60/hooks --checkpoints
```

```
Available Checkpoints:

┌───────────────────────┬─────────────────┬──────────────┐
│ Timestamp             │ Last Story      │ Progress     │
├───────────────────────┼─────────────────┼──────────────┤
│ 2025-01-15 10:00      │ DARK-003        │ 10/15 (67%)  │
│ 2025-01-15 09:30      │ DARK-002        │ 9/15 (60%)   │
│ 2025-01-15 09:00      │ AUTH-008        │ 8/15 (53%)   │
└───────────────────────┴─────────────────┴──────────────┘

Restore: 60/hooks --restore 2025-01-15T09-30
```

### Restore from Checkpoint

```bash
60/hooks --restore 2025-01-15T09-30
```

```
⏮️ Restoring from checkpoint: 2025-01-15T09-30

Actions:
  1. Reset plan.json to checkpoint state
  2. Git reset to commit abc123
  3. Restore progress.md

This will:
  - Lose work done after 09:30
  - Mark DARK-003 as pending again

Continue? [Y/n]
```

### Resume Interrupted Session

```bash
60/hooks --resume
```

Finds the most recent checkpoint and continues from there.

---

## Commands Reference

```bash
# Initialize
60/hooks --init              # Create with safe defaults
60/hooks --init --full-auto  # Create with full automation

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
  "session": {
    "maxHours": 3,
    "maxStories": 20
  }
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
  "session": {
    "maxHours": 6,
    "maxStories": 40
  }
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
  "session": {
    "maxHours": 8,
    "maxStories": 50,
    "checkpointInterval": 30
  }
}
```

---

## Running Automated Sessions

### Start with Hooks

```bash
# Uses hooks from .sixty/hooks.json
60/run --auto
```

### Override Settings

```bash
# Override max hours
60/run --auto --max-hours 4

# Override max stories
60/run --auto --max-stories 10

# Force parallel execution
60/run --auto --parallel
```

### Session Output

```
═══════════════════════════════════════════════════════
  60/run --auto SESSION
  Started: 2025-01-15 09:00
  Config: .sixty/hooks.json
═══════════════════════════════════════════════════════

09:00 ▶️ DARK-001: Add user_preferences table
09:12 ✅ DARK-001 complete (12m)
09:12 📸 Checkpoint created
09:12 ▶️ DARK-002: Create preferences edge function
09:35 ✅ DARK-002 complete (23m)
09:35 ⚡ Parallel: DARK-003 + DARK-004
09:58 ✅ Parallel group complete (23m)
09:58 📸 Checkpoint created
...
11:15 ✅ DARK-007 complete (18m)

═══════════════════════════════════════════════════════
  ✅ FEATURE COMPLETE: dark-mode
  Duration: 2h 15m | Stories: 7/7
  
  📢 Notification sent to #dev-updates
═══════════════════════════════════════════════════════

Continuing to next feature: billing

11:15 ▶️ BILL-001: Setup Stripe SDK
...
```

---

## Best Practices

1. **Start conservative** — Use `60/hooks --init` first, increase automation as you trust it

2. **Always enable checkpoints** — They save you when things go wrong

3. **Set reasonable limits** — 8 hours max is usually plenty

4. **Enable notifications** — Know when features complete or get stuck

5. **Review after long runs** — Check progress.md and git log

6. **Test hooks first** — Run `60/hooks --test` before long automated sessions

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Hooks not triggering | Check `enabled: true` in config |
| Notifications not sending | Verify `SLACK_WEBHOOK_URL` is set |
| Session ending early | Check `maxStories` and `maxHours` limits |
| Can't resume | Run `60/hooks --checkpoints` to find valid restore points |
| Too many retries | Reduce `maxRetries` or change `fallback` to `pause` |

---

## Model Profiles

Control cost/quality tradeoff for sub-agents across all 60/* skills.

### Profile Selection Prompt

When running skills with sub-agents, you'll see:

[Uses AskUserQuestion tool to present interactive selection:]

Question: "Which model profile would you like to use for automation and sub-agent execution?"
Options (interactive buttons):
  • Economy (~$0.05/story) - Fastest, lowest cost. Basic analysis and execution.
  • Balanced (~$0.40/story) (Recommended) - Good balance of speed & accuracy. Efficient automation.
  • Thorough (~$1.50/story) - Most accurate, highest cost. Maximum quality for critical work.

### Config Schema

Add to `.sixty/config.json`:

```json
{
  "modelProfile": {
    "active": "balanced"
  }
}
```

### Set Default Profile

```bash
60/hooks --set modelProfile.active "balanced"
60/hooks --set modelProfile.active "thorough"
60/hooks --set modelProfile.active "economy"
```

### Override Per-Command

```bash
60/bug auth "issue" --profile thorough
60/consult "feature" --profile economy
60/run --profile balanced
```

See `60-model-profiles-README.txt` for full profile details.
