# 60/* Model Profiles

Control cost/quality tradeoff when using 60/* skills with sub-agents.

---

## Quick Reference

| Profile | Cost | Speed | Best For |
|---------|------|-------|----------|
| **Economy** | ~4x baseline | Fastest | Routine work, familiar code, cost-sensitive |
| **Balanced** | ~6x baseline | Moderate | Regular development, most workflows |
| **Thorough** | ~20x baseline | Slowest | Critical bugs, security, unfamiliar code |

---

## Profile Selection

When you run a 60/* skill, you'll be prompted:

```
? Select model profile:
  ❯ Economy     — Fastest, lowest cost
    Balanced    — Good balance of speed & accuracy
    Thorough    — Most accurate, highest cost
```

### Skip the Prompt

Use `--profile` flag:

```bash
60/bug auth "issue" --profile economy
60/consult "feature" --profile thorough
60/run --profile balanced
60/bugfix --profile thorough
```

### Set Default Profile

```bash
60/hooks --set modelProfile.active "balanced"
```

Or edit `.sixty/config.json`:

```json
{
  "modelProfile": {
    "active": "balanced"
  }
}
```

---

## Cost Examples

| Skill | Economy | Balanced | Thorough |
|-------|---------|----------|----------|
| 60/consult | ~$0.05 | ~$0.25 | ~$1.00 |
| 60/bug | ~$0.08 | ~$0.30 | ~$1.20 |
| 60/run (per story) | ~$0.10 | ~$0.40 | ~$1.50 |
| 60/bugfix | ~$0.10 | ~$0.40 | ~$1.50 |

---

## When to Use Each

**Economy**: Simple bugs, routine audits, familiar code, exploring options

**Balanced**: Regular development, most bug hunting, standard features

**Thorough**: Production bugs, security issues, unfamiliar codebases, critical features

---

## Model Assignments

| Agent Type | Economy | Balanced | Thorough |
|------------|---------|----------|----------|
| Leader/Orchestrator | Sonnet | Opus | Opus |
| All other agents (scouts, analyzers, implementers, testers) | Haiku | Sonnet | Opus |

**Simple rule:**
- **Economy** = Sonnet leader + Haiku agents
- **Balanced** = Opus leader + Sonnet agents
- **Thorough** = Opus leader + Opus agents
