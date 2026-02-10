# Progress Log — Multi-Agent Sales Team

## Codebase Patterns

- Edge functions use `getCorsHeaders(req)` from `_shared/corsHelper.ts` (NOT legacy `corsHeaders`)
- Anthropic SDK: `import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1'`
- Supabase client: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'` (pinned!)
- SSE streaming pattern: see `copilot-autonomous/index.ts` lines 808-842
- 4-tool architecture: resolve_entity, list_skills, get_skill, execute_action
- Tool execution router: `executeToolCall()` in copilot-autonomous lines 247-290
- Action whitelist: `executeAction()` in `_shared/copilot_adapters/executeAction.ts`
- Cost tracking: `logAICostEvent()` from `_shared/costTracking.ts`
- Memory injection: copilot-autonomous lines 308-380
- Deploy: `npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`

## Architecture Reference

- PRD: `.claude/plans/moonlit-forging-cerf.md`
- Plan: `.sixty/plan-agent-teams.json`
- Key principle: specialists are functions WITHIN copilot-autonomous (not separate edge functions)
- No config row = single-agent fallback (backward compatible)
- Multi-agent = opt-in per org via `agent_team_config` table

---

## Session Log

*No sessions yet*

---
