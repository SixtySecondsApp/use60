# Agent Governance

> **Project Context**: See `CLAUDE.md` for tech stack, architecture, file structure, and code patterns.
> This file governs autonomous agent behavior only.

---

## Decision Authority

### PROCEED (No confirmation needed)
- Read any file
- Run `npm run lint`, `npm run test:run`, `npm run build:check`
- Search codebase with grep/glob
- Create new test files in `tests/` directories
- Add console.log for debugging (remove before commit)
- Fix obvious typos in comments/strings
- Update import statements when moving files

### ASK (Require confirmation)
- Any git commit
- Create new components, services, or hooks
- Modify existing business logic
- Add new dependencies
- Change routing or navigation
- Modify database queries
- Edit edge functions in `supabase/functions/`
- Create or modify migrations
- Change environment variable usage
- Refactor across multiple files

### NEVER (Refuse and explain)
- Commit `.env` files with real credentials
- Modify `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` without explicit request
- Delete or rename existing database migrations
- Use `select('*')` in Supabase queries
- Use `single()` when record might not exist (use `maybeSingle()`)
- Expose service role key in frontend code
- Disable TypeScript strict mode
- Skip linting/testing before suggesting commits
- Auto-merge or force-push branches

---

## Pre-Coding Checklist

Before writing any code:

1. **Read existing files first** — Never modify blind
2. **Check CLAUDE.md** — Database column gotchas, query patterns
3. **Review related patterns** — Look at similar components/services
4. **Verify imports exist** — Check package.json for dependencies
5. **Check for tests** — Does this file have corresponding tests?

For database work, read `.cursor/rules/database.mdc` first.

---

## Commands

### Quality Gates (run in order)
```bash
npm run lint                 # ESLint - must pass with 0 warnings
npm run build:check          # TypeScript + Vite build
npm run test:run             # Unit tests
```

### Before Suggesting Commits
```bash
npm run lint && npm run build:check && npm run test:run
```

### Testing
```bash
npm run test:run             # Quick unit tests
npm run test:integration     # Integration tests
npm run test:e2e             # Playwright E2E
```

---

## Commit Conventions

Format: `type(scope): description`

| Type | Use For |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code restructuring |
| `perf` | Performance improvement |
| `test` | Test changes |
| `chore` | Build/config/dependencies |

---

## Integration Boundaries

### Fathom (Meeting Transcripts)
- **Read-only** — Never modify Fathom data directly
- Use `meetingIntelligenceService` for AI search
- Transcripts auto-indexed on meeting completion

### Google Calendar
- Sync is **manual**, not real-time
- Events stored in `calendar_events` table
- Never assume calendar data is current

### Slack
- Use Block Kit format (see `.cursor/rules/slack-blocks.mdc`)
- Rate limit: 1 message/second per channel
- Test webhooks locally with ngrok

---

## RLS Awareness

Empty query results may indicate **RLS blocking**, not missing data.

Before debugging "missing" records:
1. Verify user has org membership
2. Check record belongs to user's org
3. Confirm user role permits the operation

RLS policies are in `supabase/migrations/` — search for `CREATE POLICY`.

---

## Auth Mode

Project supports dual auth: **Supabase Auth** or **Clerk**.

```typescript
// Detect active provider
import { useAuth } from '@/lib/hooks/useAuth';
const { authProvider } = useAuth(); // 'supabase' | 'clerk'
```

Don't assume which auth system is active. Check before writing auth-dependent code.

---

## React Query Rules

### Query Key Structure
```typescript
['deals', { orgId, filters }]     // List with filters
['deal', dealId]                   // Single item
['activities', { dealId }]         // Nested relationship
```

### After Mutations
```typescript
// Invalidate related queries
queryClient.invalidateQueries({ queryKey: ['deals'] });

// Optimistic updates for UI responsiveness
onMutate: async (newDeal) => {
  await queryClient.cancelQueries({ queryKey: ['deals'] });
  // ... optimistic update logic
}
```

### Don't
- Store server data in Zustand (use React Query)
- Skip invalidation after mutations
- Use stale query keys (include filter dependencies)

---

## UI Component Check

Before creating new components:

1. **Check `src/components/ui/`** — Radix primitives exist
2. **Check shadcn/ui patterns** — May already have the component
3. **Only create custom** if no existing match

```typescript
// Prefer existing
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
```

---

## Error Recovery

### Build Fails
1. `npm run lint:fix`
2. `npx tsc --noEmit` — Find TypeScript errors
3. Check for circular imports

### Tests Fail
1. Run in isolation: `npm run test:run -- path/to/test`
2. Check `tests/setup.ts` for required mocks

### PGRST116 Error
Query used `single()` but record doesn't exist. Change to `maybeSingle()`.

### Lint Warnings > 0
CI will fail. Fix all warnings before committing.

---

## Monorepo Awareness

| Path | Runtime | Port |
|------|---------|------|
| `/` | Node/Vite | 5175 |
| `/packages/landing` | Node/Vite | 5173 |
| `/supabase/functions` | **Deno** | — |

Edge functions use Deno, not Node. Different import syntax and APIs.
