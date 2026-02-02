# Progress Log — use60 Organization Member Management

## Feature: Organization Member Management (orgmem)
Created: 2025-02-02
Total Stories: 11
Estimated Duration: 3.2 hours (191 minutes)

---

## Codebase Patterns & Learnings

### Database
- Use `maybeSingle()` when record might not exist
- Always use explicit column selection (avoid `select('*')`)
- RLS policies: Check both existence AND member_status = 'active'

### Services
- Service functions return `{ success: boolean, error?: string }`
- All Supabase calls use async/await
- Error messages are user-facing and helpful

### React Components
- Export interface above component
- Use `useQuery`/`useMutation` for server state
- `toast.error()` for error notifications
- Confirmation dialogs use two-step approach

### Permissions
- `permissions.canManageTeam` for admin checks
- `permissions.isOwner` for owner-only operations
- All checks use `useOrg()` context

---

## Story Progress

### ORGMEM-001: Deploy ORGREM infrastructure (IN PROGRESS)
**Status**: IN_PROGRESS
**Started**: 2025-02-02T12:00:00Z
**Est**: 15 minutes

**Tasks**:
- [ ] Read ORGREM_DEPLOYMENT.sql from scratchpad
- [ ] Deploy to staging Supabase (caerqjzvuerejfrdtygb)
- [ ] Verify all tables and RPC functions exist
- [ ] Confirm no 404 errors on next member removal attempt

---

## Next Steps

1. **Complete ORGMEM-001**: Deploy migrations to staging
2. **Execute ORGMEM-002 & ORGMEM-003 in parallel**:
   - Leave organization service
   - GoodbyeScreen component
3. **Execute ORGMEM-004 & ORGMEM-005**:
   - Access control updates
   - Layout restructuring
4. **Execute remaining stories** in dependency order

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| RPC function not deployed | Deploy migrations first |
| Permission bugs | Test access control early |
| Redirect issues | Test GoodbyeScreen thoroughly |
| Owner leave vulnerability | Validate owner check in service |
| Rejoin UX confusion | Clear "Rejoin" tag/badge |

---

## Quality Gates

Ultra-fast gates (every story):
- ESLint on changed files (~5s)
- Unit tests on changed files (~5s)
- TypeScript IDE check (skip, trust IDE)

Full validation (final story):
- Full typecheck (~3 min)
- Full test suite
- Build check

---
