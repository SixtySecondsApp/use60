# Consult Report: Landing Builder v2 — Agent Teams + Gemini SVGs

## Date: 2026-02-28

## User Request
Upgrade the Landing Page Builder from single-agent sequential to an agent team architecture.
Improve SVG animations from basic Claude CSS keyframes to rich Gemini 3.1 Pro isometric illustrations.

## User Decisions
- **Agent UX**: Visible agents — show which specialist is working
- **SVG Engine**: Gemini 3.1 Pro via new edge function for all SVGs
- **Brief Flow**: Smart hybrid — quick form (5Q) + strategist follow-ups
- **Context Management**: Shared workspace (DB table) — agents read only what they need

## Current Architecture Problems
1. Single generalist agent does everything (strategy, copy, visuals, code)
2. SVGs are basic CSS keyframes (Claude can't do rich isometric illustrations)
3. No research step — doesn't look at competitors or real websites
4. Token waste: full context re-injection (~5000 tokens) on every message
5. No quality review — code ships first-draft

## Proposed: 4-Agent Team Pipeline
- Strategist (brief enrichment + company research + strategy)
- Copywriter (A/B copy per section)
- Visual Artist (orchestrates: Claude palette + Gemini SVGs + Nano Banana hero)
- Builder (React + Tailwind final code)

## Key Architectural Decisions
- Shared workspace DB table (landing_builder_sessions) replaces re-injection
- Phase 2 (Visuals) runs 3 sub-tasks in parallel
- generate-svg edge function wraps Gemini 3.1 Pro with thinking budgets
- Agent badges on chat messages for visibility
- DiscoveryWizard reduced to 5 questions + strategist probing follow-ups
