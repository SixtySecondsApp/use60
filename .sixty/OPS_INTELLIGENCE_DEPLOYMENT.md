# Ops Intelligence Platform — Deployment Guide

## OI-036: Deploy Edge Functions to Staging

Deploy all new edge functions to staging project `caerqjzvuerejfrdtygb` with `--no-verify-jwt`:

```bash
# Layer 1: Workflows
npx supabase functions deploy ops-table-workflow-engine \
  --project-ref caerqjzvuerejfrdtygb --no-verify-jwt

# Layer 2: Insights
npx supabase functions deploy ops-table-insights-engine \
  --project-ref caerqjzvuerejfrdtygb --no-verify-jwt

# Layer 3: Cross-Table
npx supabase functions deploy ops-table-cross-query \
  --project-ref caerqjzvuerejfrdtygb --no-verify-jwt

# Layer 6: Predictions
npx supabase functions deploy ops-table-predictions \
  --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
```

### Apply Migrations

```bash
npx supabase db push --project-ref caerqjzvuerejfrdtygb
```

This will apply all 6 new migrations:
- `20260206000001_ops_table_workflows.sql`
- `20260206000002_ops_table_insights.sql`
- `20260206000003_ops_table_recipes.sql`
- `20260206000004_ops_table_chat_sessions.sql`
- `20260206000005_ops_table_predictions.sql`
- `20260206000006_ops_cross_table_registry.sql`

### Verify Deployments

```bash
# Check function logs
npx supabase functions logs ops-table-workflow-engine --project-ref caerqjzvuerejfrdtygb
npx supabase functions logs ops-table-insights-engine --project-ref caerqjzvuerejfrdtygb

# Test health check (OPTIONS request)
curl -X OPTIONS https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/ops-table-workflow-engine
```

Expected response: CORS headers with `200 OK`

## OI-037: Vite Build Verification

### Full Build

```bash
npm run build
```

**Expected**: Zero TypeScript errors, successful Vite build

### Bundle Analysis

Check bundle size delta:

```bash
npm run build -- --mode analyze
```

**Expected**: <500KB increase from new components

### Run Linter

```bash
npm run lint
```

**Expected**: No new linting errors in changed files

### Type Check

```bash
npm run typecheck
```

**Expected**: No TypeScript strict mode violations

### E2E Test Suite

```bash
npm run test:e2e -- tests/e2e/ops-intelligence/
```

**Expected**: All Playwright tests pass against staging

## Post-Deployment Checklist

- [ ] All 4 edge functions deployed successfully
- [ ] All 6 migrations applied to staging database
- [ ] Health checks return 200 OK with CORS headers
- [ ] Vite build completes with zero errors
- [ ] Bundle size increase <500KB
- [ ] No TypeScript strict mode violations
- [ ] E2E tests pass on staging environment

## Rollback Procedure

If issues are found:

1. **Edge Functions**: Previous versions are preserved, use Supabase dashboard to rollback
2. **Migrations**: Create reverse migrations or restore from backup
3. **Frontend**: Revert commits and redeploy

## Known Issues

None at deployment time. Monitor Supabase logs for:
- Model ID errors (verify `claude-haiku-4-5-20251001`)
- esm.sh import failures (all imports pinned to `@2.43.4`)
- RLS policy errors (all tables have proper policies)
