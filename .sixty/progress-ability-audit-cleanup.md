# Progress Log — Ability Registry Audit & Cleanup

## Codebase Patterns
- Ability registry lives in `src/lib/agent/abilityRegistry.ts`
- ABILITY_REGISTRY is a flat array of AbilityDefinition objects
- SEQUENCE_STEPS and SKILL_DISPLAY_NAMES map orchestrator steps (don't touch)
- ProactiveAgentV2Demo.tsx has hardcoded demo scenarios that reference abilities
- AbilityRunPanel handles both `orchestrator` and `v1-simulate` backendTypes
- Existing Slack Block Kit builders in slackBlocks.ts: buildDealStageChangeMessage, buildDealWonMessage, buildDealLostMessage, buildAccountIntelligenceDigest

---

## Session Log

(No sessions yet)
