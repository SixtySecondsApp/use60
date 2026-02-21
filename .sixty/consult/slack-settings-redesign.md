# Consult Report: Slack Settings Redesign
Generated: 2026-02-21

## User Request
"Redesign the Slack settings page so users can see and configure everything easily without excessive scrolling. Agent Alerts are buried below the fold."

## Clarifications
- Q: Remove tabs or keep them?  → Keep 3 top-level tabs (Features, Personal, Team Mapping)
- Q: How to handle large feature cards?  → 2-column compact cards with essential controls visible, "Configure" for details
- Q: What should be at the top?  → Status grid overview showing all features + agent alerts at a glance
- Q: Redesign scope?  → Full page (all tabs), tighter Personal tab with 2-column layout

## Design Decisions

### Features Tab (Admin)
1. **Status Grid Overview** at top — compact card showing on/off + destination for all 4 features and all 8 agent alert categories
2. **2x2 Compact Feature Cards** — toggle + channel selector visible by default, "Configure" reveals delivery method, schedule, stakeholders, thresholds inline
3. **Agent Alerts** — promoted to equal visual weight with features (visible in overview, not buried at bottom)

### Personal Tab
- Keep 2-column layout
- Reduce card padding, use smaller controls
- Proactive Agent items rendered as compact table-like rows (toggle + channel per row)

### Team Mapping Tab
- No changes needed

## Current File Structure
- `src/pages/settings/SlackSettings.tsx` (1,625 lines) — main page + FeatureSettingsCard + MorningBriefPreferences + NotificationPreferences + ProactiveAgentPreferences
- `src/components/settings/SlackChannelSelector.tsx` — channel dropdown
- `src/components/settings/SlackUserMapping.tsx` — admin mapping table
- `src/components/settings/SlackSelfMapping.tsx` — personal account linker

## Key Constraints
- All existing functionality must be preserved
- No database changes required
- All hooks/mutations stay the same
- SlackChannelSelector, SlackUserMapping, SlackSelfMapping components remain unchanged
- Must follow existing patterns: Lucide icons, Tailwind, Radix UI primitives
