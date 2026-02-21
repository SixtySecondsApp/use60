# Progress Log — Billing System Completeness Gap Closure

## Codebase Patterns
- costTracking.ts is the single gateway for all credit deductions (logAICostEvent + logFlatRateCostEvent)
- extractAnthropicUsage() helper extracts input/output tokens from Anthropic responses
- checkCreditBalance() is the pre-flight gate — call before expensive operations, return 402 if insufficient
- getCorsHeaders(req) from corsHelper.ts is the required CORS pattern (not legacy corsHeaders)
- Pin @supabase/supabase-js@2.43.4 in all edge function imports
- start-free-trial edge function is idempotent — safe to call multiple times
- Deploy to staging: npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt

---

## Session Log

*No sessions yet*

---
