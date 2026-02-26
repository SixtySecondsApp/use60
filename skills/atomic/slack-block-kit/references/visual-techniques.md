# Visual Techniques Reference

Text-based visualization patterns for Slack Block Kit messages. These techniques replace rich UI charts when presenting data in chat. All patterns use typography and Unicode block characters — no emoji.

## Score Bars (Block Character Progress)

Display numeric scores as visual bars using filled/empty block characters:

### 10-Point Bar

```
Score 20%:  ██░░░░░░░░ 20%
Score 50%:  █████░░░░░ 50%
Score 80%:  ████████░░ 80%
Score 100%: ██████████ 100%
```

### Implementation

```typescript
function scoreBar(score: number, max: number = 100, width: number = 10): string {
  const filled = Math.round((score / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${score}%`;
}

// Usage in fields:
// "Talk Ratio\n42% ████░░░░░░"
// "Questions\n6/10 ██████░░░░"
```

### Score in Field Format

```
*Talk Ratio*
42% ████░░░░░░ _(target: <50%)_
```

Combined: value + bar + optional benchmark.

## Trend Indicators

Show change over time with text deltas:

| Change | Indicator | Usage |
|--------|-----------|-------|
| Positive | `+3%` or `(+3%)` | Improvement week-over-week |
| Negative | `-3%` or `(-3%)` | Decline week-over-week |
| No change | `flat` | Flat performance |

### Trend with Delta

```
Talk Ratio: 42% (+3% from last week)
Questions:  7/10 (+1.5 from last week)
Objections: 5/10 (-0.5 from last week)
```

### Implementation

```typescript
function trendLabel(change: number, unit: string = ''): string {
  if (Math.abs(change) < 0.5) return 'flat';
  const sign = change > 0 ? '+' : '';
  return `(${sign}${change}${unit} from last week)`;
}
```

## Talk Ratio Visualization

Special display for talk-to-listen ratio (ideal: 40-60% talk):

### Benchmark Bar

```
*Talk Ratio*
42% — Great balance
▓▓▓▓░░░░░░ (42% talk / 58% listen)
```

### Zone Labels

| Range | Label |
|-------|-------|
| 0-30% | Too quiet |
| 30-45% | Great balance |
| 45-55% | Good |
| 55-65% | Talking too much |
| 65-100% | Way too much |

### Implementation

```typescript
function talkRatioDisplay(ratio: number): string {
  const filled = Math.round(ratio / 10);
  const bar = '▓'.repeat(filled) + '░'.repeat(10 - filled);
  const label = ratio <= 55 && ratio >= 30 ? 'Great balance' :
                ratio < 30 ? 'Too quiet' :
                ratio <= 65 ? 'Talking too much' : 'Way too much talking';
  return `${ratio}% — ${label}\n${bar} (${ratio}% talk / ${100 - ratio}% listen)`;
}
```

## Severity / Priority Indicators

Use bold text labels for severity, not colored indicators:

| Level | Format | Usage |
|-------|--------|-------|
| Critical | `*Critical*` | Blockers, deal-killing signals |
| High | `*High*` | Risks, areas needing attention |
| Medium | `*Medium*` | Suggestions, observations |
| Low | `Low` | Minor items |

### In Coaching Insights

```
• *Strong discovery questions* — Asked 7 open-ended questions about pain points
• *Objection not addressed* — Prospect raised budget concern at 12:34, no response
• *Lost control of agenda* — Talk ratio hit 72% in final 10 minutes
```

### In Risk Signals

```
• *Champion went dark* — No email response in 14 days
• *Competitor mentioned* — Prospect asked about Gong pricing in last call
• *Buying signal detected* — Asked about implementation timeline
```

## Status / State Labels

For deal stages, task status, pipeline states — use text labels:

| State | Format | Example |
|-------|--------|---------|
| Active/open | Bold | `*Active*` |
| At risk | Bold | `*At Risk*` |
| Stale/blocked | Bold | `*Stale* (14 days)` |
| Won | Plain | `Closed Won` |
| Lost | Plain | `Closed Lost` |
| New | Plain | `New Lead` |

## Currency / Value Display

```
*Deal Value*
$125,000

*Pipeline*
$1.2M across 8 deals
```

Format rules:
- Under $1K: exact (`$750`)
- $1K-$999K: with K (`$125K`)
- $1M+: with M and one decimal (`$1.2M`)

## Time / Duration Display

```
*Meeting Duration*
45 mins

*Days in Stage*
23 days (avg: 14 days)

*Time to Close*
47 days (target: 30 days)
```

## Blockquote for Highlights

Use Slack's `>` blockquote for featured content:

```
*Best Moment This Week*
> "Tell me more about how that impacts your Q2 targets"
> — Discovery call with Acme Corp (scored 9/10)
```

Good for:
- Top coaching moments / quotes
- Email draft previews in HITL
- Key meeting takeaways
- Customer quotes / objections

## Combining Techniques in Fields

Fields support 2-column layout. Combine score + trend + bar:

```
sectionWithFields([
  { label: "Talk Ratio", value: "42% (+3%)\n████░░░░░░" },
  { label: "Questions", value: "7/10 (+1.5)\n███████░░░" },
  { label: "Objections", value: "5/10 (-0.5)\n█████░░░░░" },
  { label: "Discovery", value: "8/10 (flat)\n████████░░" },
])
```

This renders as a compact 2x2 grid with value, trend, and visual bar for each metric.

## Design Principles

1. **No emoji in messages.** Use typography (bold, italic), Unicode block chars, and text labels for all visual indicators.
2. **Combine text with visual.** Never rely on a visual indicator alone — always pair with a text label.
3. **Keep bars consistent.** Use the same bar width (10 chars) across all message types.
4. **Use bold for emphasis.** `*Critical*` reads cleaner than a colored circle.
5. **Add benchmark context** where available ("target: <50%").
6. **Bullet points over emoji prefixes.** Use `•` for lists, not emoji icons.
