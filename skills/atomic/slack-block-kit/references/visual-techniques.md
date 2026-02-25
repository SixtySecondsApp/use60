# Visual Techniques Reference

Emoji-based visualization patterns for Slack Block Kit messages. These techniques replace rich UI charts when presenting data in chat.

## Score Bars (Emoji Progress)

Display numeric scores as visual bars using filled/empty circles:

### 5-Point Scale

```
Score 0-2:  🔴🔴⚪⚪⚪  (poor)
Score 3-4:  🟡🟡🟡⚪⚪  (needs work)
Score 5-6:  🟡🟡🟡🟡⚪  (average)
Score 7-8:  🟢🟢🟢🟢⚪  (good)
Score 9-10: 🟢🟢🟢🟢🟢  (excellent)
```

### Implementation

```typescript
function scoreBar(score: number, max: number = 10, dots: number = 5): string {
  const filled = Math.round((score / max) * dots);
  const color = score >= max * 0.7 ? '🟢' : score >= max * 0.4 ? '🟡' : '🔴';
  return color.repeat(filled) + '⚪'.repeat(dots - filled);
}

// Usage in fields:
// "Talk Ratio\n42% 🟢🟢🟢🟢⚪"
// "Questions\n6/10 🟡🟡🟡⚪⚪"
```

### Score in Field Format

```
*Talk Ratio*
42% 🟢🟢🟢🟢⚪ _(target: <50%)_
```

Combined: value + bar + optional benchmark.

## Trend Indicators

Show change over time with directional emoji:

| Change | Emoji | Usage |
|--------|-------|-------|
| Positive trend | 📈 | Improvement week-over-week |
| Negative trend | 📉 | Decline week-over-week |
| No change | ➡️ | Flat performance |
| New (no prior) | 🆕 | First measurement |

### Trend with Delta

```
Talk Ratio: 42% 📈 (-3% from last week)
Questions:  7/10 📈 (+1.5 from last week)
Objections: 5/10 📉 (-0.5 from last week)
```

### Implementation

```typescript
function trendIndicator(change: number): string {
  if (change > 0.5) return '📈';
  if (change < -0.5) return '📉';
  return '➡️';
}

function trendLabel(change: number, unit: string = ''): string {
  const sign = change > 0 ? '+' : '';
  return `${trendIndicator(change)} (${sign}${change}${unit} from last week)`;
}
```

## Talk Ratio Visualization

Special display for talk-to-listen ratio (ideal: 40-60% talk):

### Benchmark Bar

```
*Talk Ratio*
42% — 🟢 Great balance
▓▓▓▓░░░░░░ (42% talk / 58% listen)
```

### Zone Indicators

| Range | Label | Emoji |
|-------|-------|-------|
| 0-30% | Too quiet | 🔴 |
| 30-45% | Great balance | 🟢 |
| 45-55% | Good | 🟢 |
| 55-65% | Talking too much | 🟡 |
| 65-100% | Way too much | 🔴 |

### Implementation

```typescript
function talkRatioDisplay(ratio: number): string {
  const filled = Math.round(ratio / 10);
  const bar = '▓'.repeat(filled) + '░'.repeat(10 - filled);
  const zone = ratio <= 55 && ratio >= 30 ? '🟢' : ratio <= 65 ? '🟡' : '🔴';
  const label = ratio <= 55 && ratio >= 30 ? 'Great balance' :
                ratio < 30 ? 'Too quiet' :
                ratio <= 65 ? 'Talking too much' : 'Way too much talking';
  return `${ratio}% — ${zone} ${label}\n${bar} (${ratio}% talk / ${100 - ratio}% listen)`;
}
```

## Severity / Priority Indicators

For insights, risks, and alerts:

| Level | Emoji | Usage |
|-------|-------|-------|
| Critical | 🔴 | Blockers, deal-killing signals |
| Warning | 🟡 / ⚠️ | Risks, areas needing attention |
| Info | 🔵 / 💡 | Suggestions, observations |
| Positive | 🟢 / ✅ | Strengths, wins, confirmations |
| Neutral | ⚪ | No classification |

### In Coaching Insights

```
💡 *Strong discovery questions* — Asked 7 open-ended questions about pain points
⚠️ *Objection not addressed* — Prospect raised budget concern at 12:34, no response
🔴 *Lost control of agenda* — Talk ratio hit 72% in final 10 minutes
```

### In Risk Signals

```
⚠️ *Champion went dark* — No email response in 14 days
🔴 *Competitor mentioned* — Prospect asked about Gong pricing in last call
💡 *Buying signal detected* — Asked about implementation timeline
```

## Status / State Badges

For deal stages, task status, pipeline states:

| State | Badge | Example |
|-------|-------|---------|
| Active/open | 🟢 | `🟢 Active` |
| At risk | 🟡 | `🟡 At Risk` |
| Stale/blocked | 🔴 | `🔴 Stale (14 days)` |
| Won | 🏆 | `🏆 Closed Won` |
| Lost | ❌ | `❌ Closed Lost` |
| New | 🆕 | `🆕 New Lead` |
| Scheduled | 📅 | `📅 Demo Scheduled` |

## Currency / Value Display

```
*Deal Value*
$125,000 💰

*Pipeline*
$1.2M across 8 deals
```

Format rules:
- Under $1K: exact (`$750`)
- $1K-$999K: with K (`$125K`)
- $1M+: with M and one decimal (`$1.2M`)
- Always use `$` prefix, comma-separated thousands in exact values

## Time / Duration Display

```
*Meeting Duration*
45 mins ⏱️

*Days in Stage*
23 days ⚡ (avg: 14 days)

*Time to Close*
47 days (target: 30 days) 🟡
```

## Blockquote for Highlights

Use Slack's `>` blockquote for featured content:

```
*⭐ Best Moment This Week*
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
  { title: "Talk Ratio", value: "42% 📈\n🟢🟢🟢🟢⚪" },
  { title: "Questions", value: "7/10 📈\n🟢🟢🟢🟡⚪" },
  { title: "Objections", value: "5/10 📉\n🟡🟡🟡⚪⚪" },
  { title: "Discovery", value: "8/10 ➡️\n🟢🟢🟢🟢⚪" },
])
```

This renders as a compact 2×2 grid with value, trend, and visual bar for each metric.

## Do's and Don'ts

**Do:**
- Use emoji for quick visual scanning at scale
- Combine emoji with text labels (never emoji-only)
- Keep score bars consistent across message types
- Use color semantics consistently (🟢 = good, 🔴 = bad)
- Add benchmark context where available ("target: <50%")

**Don't:**
- Use more than 2-3 emoji per text line
- Mix emoji scales (don't use 🟢 circles and ⭐ stars for scores in the same message)
- Use emoji as the sole indicator of meaning (accessibility)
- Put emoji in header blocks (they count toward 150 char limit)
- Use platform-specific emoji that render differently across OS
