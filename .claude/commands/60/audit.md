---
name: 60-audit
invoke: /60/audit
description: Full codebase and database audit — 5 specialist agents scan for dead code, unused files, database issues, logic errors, and best practices violations
---

# /60/audit — Codebase & Database Audit

**Purpose**: Deploy a team of 5 specialist agents to thoroughly investigate the codebase. Auto-detect the database and tech stack, scan for dead code, unused files, problematic logic, database issues, and best practices violations. Present a categorized report for user approval before making any changes.

**Input**: $ARGUMENTS

---

## Usage

```bash
# Full audit (recommended)
60/audit

# Target specific areas
60/audit --focus database        # Database-only audit
60/audit --focus dead-code       # Dead code/files only
60/audit --focus best-practices  # Best practices check only

# Dry run (report only, no changes)
60/audit --dry-run

# Auto-apply safe items
60/audit --auto-safe
```

---

## How It Works

```
PHASE 1: AUTO-DETECT
  Detect database, framework, package manager, test runner, linter
  Map full directory structure
  |
  v
PHASE 2: AGENT TEAM SCAN (5 agents in parallel)
  Leader (orchestrator + final reviewer)
    +-- Agent 1: DEAD CODE HUNTER
    +-- Agent 2: FILE STRUCTURE AUDITOR
    +-- Agent 3: DATABASE INSPECTOR
    +-- Agent 4: LOGIC & ERROR SCANNER
    +-- Agent 5: BEST PRACTICES CHECKER
  |
  v
PHASE 3: LEADER REVIEW
  Cross-reference all agent findings
  Verify no false positives
  Categorize by severity and safety
  |
  v
PHASE 4: REPORT TO USER
  Full findings report with categories
  Each item marked: SAFE / NEEDS REVIEW / RISKY
  User approves which changes to apply
  |
  v
PHASE 5: APPLY APPROVED CHANGES
  Execute approved removals and fixes
  Run quality gates after changes
  Commit with detailed audit message
```

---

## Phase 1: Auto-Detection

Auto-detect the entire tech stack. No configuration needed.

| Category | Detection Method | Examples |
|----------|-----------------|----------|
| **Framework** | package.json, config files | React, Next.js, Vue, Svelte, Express |
| **Database** | Dependencies, config, migration folders | Supabase, Prisma, Drizzle, MongoDB |
| **Auth** | Dependencies, auth config | Supabase Auth, Clerk, NextAuth |
| **Styling** | Config files, dependencies | Tailwind, CSS Modules, styled-components |
| **Testing** | Config files, test patterns | Vitest, Jest, Playwright |
| **Package Manager** | Lock files | npm, yarn, pnpm, bun |
| **Linter/Formatter** | Config files | ESLint, Prettier, Biome |

---

## Phase 2: Agent Team Scan

Five agents run in parallel using the Agent tool (Explore subagent type). The leader coordinates.

### Agent 1: DEAD CODE HUNTER

**Mission**: Find unused exports, unreachable code, and dead functions.

Scans for:
- Exported functions/components never imported anywhere
- Variables declared but never read
- Unreachable code after return/throw statements
- Commented-out code blocks (>5 lines)
- Unused TypeScript types/interfaces
- Dead feature flags or environment checks
- Unused npm dependencies (in package.json but never imported)

Method:
- Grep all exports across the codebase
- Cross-reference with all imports
- Flag any export with zero importers
- Check for dynamic imports that might reference seemingly unused exports
- Verify no re-exports through barrel files

### Agent 2: FILE STRUCTURE AUDITOR

**Mission**: Find unused files, orphan components, and structural issues.

Scans for:
- Files not imported by any other file
- Empty files (0 meaningful content)
- Duplicate files (same content, different location)
- Orphan test files (test for deleted component)
- Stale generated files
- Leftover boilerplate/template files never customized

Method:
- Build full import graph of the codebase
- Find files with no incoming edges (not imported by anything)
- Cross-check entry points (pages, routes, main files)
- Verify test files have corresponding source files

### Agent 3: DATABASE INSPECTOR

**Mission**: Audit migrations, schema, queries, and database health.

Scans for:
- Duplicate migrations (same operation in multiple files)
- Conflicting migrations (one adds column, another removes it)
- Unused tables (defined in schema but never queried)
- Missing indexes on frequently queried columns
- N+1 query patterns in code
- Raw SQL injection risks
- Missing RLS policies (Supabase-specific)
- Overly permissive RLS policies
- Schema drift (code references columns that don't exist in migrations)
- Unused edge functions / API routes
- `select('*')` usage (should be explicit columns per CLAUDE.md)
- Missing `maybeSingle()` where appropriate

### Agent 4: LOGIC & ERROR SCANNER

**Mission**: Find bugs, error handling issues, and problematic logic.

Scans for:
- Unhandled promise rejections
- Missing error boundaries (React)
- Empty catch blocks (swallowing errors)
- Race conditions in async code
- Memory leaks (missing cleanup in useEffect)
- Incorrect dependency arrays in hooks
- Type assertion abuse (as any, as unknown)
- Null/undefined access without checks
- Missing loading/error states in data fetching
- Hardcoded values that should be env vars
- Console.log statements left in production code
- TODO/FIXME/HACK comments indicating known issues

### Agent 5: BEST PRACTICES CHECKER

**Mission**: Ensure the codebase follows project-specific and industry best practices.

Scans for:
- Security: XSS, CSRF, injection, exposed secrets, VITE_ prefix on API keys
- Accessibility: missing aria labels, alt text
- Performance: unnecessary re-renders, large bundles, no pagination
- Code organization: circular dependencies, barrel export issues
- Environment variable handling (secrets in code)
- Git hygiene (.env files tracked, large files committed)
- Consistent coding style violations
- CLAUDE.md rule violations (legacy corsHeaders, SheetContent without top-16, etc.)

---

## Phase 3: Leader Review

After all agents complete, the leader (you, the orchestrator):

1. **Cross-references findings** -- If Agent 1 says a function is dead but Agent 4 found it's used dynamically, resolve the conflict
2. **Eliminates false positives** -- Verify that "unused" files aren't entry points, route handlers, or dynamically imported
3. **Categorizes by safety**:
   - **SAFE**: Can be applied with zero risk (dead imports, empty files, commented code)
   - **NEEDS REVIEW**: Likely safe but user should verify (unused components, old migrations)
   - **RISKY**: Could break something, requires careful consideration (schema changes, removing shared utils)
4. **Prioritizes by impact**: Critical security issues first, then high-severity bugs, then cleanup

---

## Phase 4: Report to User

Present a comprehensive, categorized report:

```
AUDIT REPORT

Stack Detected
React 18 + Vite | Supabase (PostgreSQL) | Tailwind CSS

Summary
| Category       | Items Found | Safe | Needs Review | Risky |
|----------------|-------------|------|--------------|-------|
| Dead Code      | 12          | 10   | 2            | 0     |
| Unused Files   | 8           | 6    | 2            | 0     |
| Database Issues| 5           | 1    | 2            | 2     |
| Logic Errors   | 7           | 3    | 3            | 1     |
| Best Practices | 9           | 5    | 3            | 1     |
| TOTAL          | 41          | 25   | 12           | 4     |

SAFE -- Auto-apply recommended
1. Remove unused import `formatCurrency` from src/utils/helpers.ts
2. Delete orphan file src/components/OldHeader.tsx (0 importers)
...

NEEDS REVIEW -- Verify before applying
1. File src/utils/legacy-api.ts appears unused (but check if used in scripts)
2. Table `legacy_users` has no queries (verify no external systems use it)
...

RISKY -- Apply with caution
1. Missing RLS policy on `user_preferences` table (security risk)
2. API key hardcoded in src/lib/stripe.ts (critical security)
...
```

### User Approval

Ask via AskUserQuestion:
- Apply all SAFE items (N changes) -- Recommended
- Apply SAFE + let me review NEEDS REVIEW items one by one
- Apply everything (SAFE + NEEDS REVIEW + RISKY)
- Let me pick individually
- Dry run only (no changes)

---

## Phase 5: Apply Approved Changes

After user approves:

1. **Apply changes** in dependency order (remove imports before files)
2. **Run quality gates** after all changes:
   ```bash
   npm run typecheck
   npm run lint
   npm run test:run
   ```
3. **If gates fail**: Revert the problematic change, report which item caused the failure
4. **Commit** with detailed message:
   ```
   chore: audit cleanup -- remove dead code, fix issues

   Removed:
   - 10 unused exports
   - 6 orphan files
   - 1 unused dependency
   - 4 commented-out code blocks

   Fixed:
   - 3 empty catch blocks
   - 2 missing error boundaries
   - 1 hardcoded API key moved to env var

   Audit verified by leader. All quality gates pass.
   ```

---

## Integration with /60/ship

Audit can be triggered:
- **Before pipelines**: `/60/ship` can run a quick audit before DISCOVER to clean the slate
- **During HOUSEKEEPING**: Phase 7 of `/60/ship` runs a lighter version of audit (code scan + docs audit)
- **Standalone**: Run anytime for proactive maintenance

---

## Flags Reference

| Flag | Description |
|------|-------------|
| `--focus <area>` | Audit specific area: `database`, `dead-code`, `files`, `logic`, `best-practices` |
| `--dry-run` | Report only, don't apply any changes |
| `--auto-safe` | Automatically apply all SAFE items without asking |
| `--verbose` | Show detailed agent output during scan |
| `--include-tests` | Include test files in dead code analysis (skipped by default) |

---

## Safety Guarantees

1. **No changes without approval** -- Everything is reported first
2. **Leader verification** -- All findings cross-checked for false positives
3. **Quality gates after changes** -- Typecheck, lint, and tests must pass
4. **Automatic rollback** -- If quality gates fail, the problematic change is reverted
5. **Detailed commit messages** -- Every change is documented
6. **Conservative by default** -- When in doubt, items are marked NEEDS REVIEW, not SAFE

---

## Error Handling

| Error | Action |
|-------|--------|
| Agent times out | Use partial results, note gap |
| No relevant code found | Report clean audit |
| Quality gates fail after apply | Revert problematic change, report |
| Large codebase (slow) | Use `--focus` to target specific areas |
