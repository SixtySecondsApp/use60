---
name: 60-audit
invoke: /60-audit
description: Full codebase and database audit — auto-detects stack, removes dead code/files, fixes errors, and ensures best practices with a Sonnet agent team and Opus leader
---

# 60/audit — Codebase & Database Audit

**Purpose**: Perform a thorough investigation of the entire application. Auto-detect the database and tech stack, deploy a team of exploration agents led by a leader, scan for dead code, unused files, problematic logic, database issues, and duplicate migrations. Present a full report for user approval before making any changes.

---

## Cross-Platform Compatibility

- Works on **Windows**, **macOS**, and **Linux**
- Auto-detects stack regardless of OS (reads package.json, config files, directory structure)
- All file paths use forward slashes (`/`)
- Shell commands run via Claude's Bash tool (bash on all platforms)
- Uses Claude's built-in tools (Glob, Grep, Read, Edit) for file operations
- No OS-specific commands

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

# Skip profile prompt
60/audit --profile balanced
```

---

## Step 0: Model Profile Selection (FIRST STEP)

**Before anything else**, ask the user to select a model profile.

[Uses AskUserQuestion tool:]

Question: "Select your model profile for the audit:"
Options:
  - Economy — Fastest, lowest cost. Haiku scouts, Sonnet analysis. Quick surface-level audit.
  - Balanced (Recommended) — Sonnet scouts and analysis, Opus leader review. Thorough but efficient.
  - Thorough — Sonnet scouts, Opus analysis and leader. Maximum depth for critical codebases.

Skip with `--profile <name>`.

### Model Assignments by Profile

| Agent Role | Economy | Balanced | Thorough |
|------------|---------|----------|----------|
| Leader (orchestrator + reviewer) | Sonnet | Opus | Opus |
| Dead Code Hunter | Haiku | Sonnet | Opus |
| File Structure Auditor | Haiku | Sonnet | Opus |
| Database Inspector | Haiku | Sonnet | Opus |
| Logic & Error Scanner | Haiku | Sonnet | Opus |
| Best Practices Checker | Haiku | Sonnet | Opus |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     60/audit FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INVOCATION: 60/audit                                          │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           PHASE 1: AUTO-DETECT                          │   │
│  │  • Detect database (Supabase, Prisma, Drizzle, etc.)   │   │
│  │  • Detect framework (React, Next.js, etc.)             │   │
│  │  • Detect package manager, test runner, linter         │   │
│  │  • Map full directory structure                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           PHASE 2: AGENT TEAM SCAN                      │   │
│  │                                                          │   │
│  │  LEADER (orchestrator + final reviewer)                 │   │
│  │       │                                                  │   │
│  │       ├── Agent 1: DEAD CODE HUNTER                    │   │
│  │       ├── Agent 2: FILE STRUCTURE AUDITOR              │   │
│  │       ├── Agent 3: DATABASE INSPECTOR                  │   │
│  │       ├── Agent 4: LOGIC & ERROR SCANNER               │   │
│  │       └── Agent 5: BEST PRACTICES CHECKER              │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           PHASE 3: LEADER REVIEW                        │   │
│  │  • Cross-reference all agent findings                   │   │
│  │  • Verify no false positives                            │   │
│  │  • Categorize by severity and safety                    │   │
│  │  • Sign off on recommended changes                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           PHASE 4: REPORT TO USER                       │   │
│  │  • Full findings report with categories                 │   │
│  │  • Each item marked: SAFE / NEEDS REVIEW / RISKY       │   │
│  │  • User approves which changes to apply                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           PHASE 5: APPLY APPROVED CHANGES               │   │
│  │  • Execute approved removals and fixes                  │   │
│  │  • Run quality gates after changes                      │   │
│  │  • Commit with detailed audit message                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Auto-Detection

The audit begins by automatically detecting the entire tech stack. No configuration needed.

### What Gets Detected

| Category | Detection Method | Examples |
|----------|-----------------|----------|
| **Framework** | package.json, config files | React, Next.js, Vue, Svelte, Express |
| **Database** | Dependencies, config, migration folders | Supabase, Prisma, Drizzle, MongoDB, raw SQL |
| **ORM/Query** | Import patterns, schema files | Prisma Client, Drizzle ORM, React Query |
| **Auth** | Dependencies, auth config | Supabase Auth, Clerk, NextAuth, Auth0 |
| **Styling** | Config files, dependencies | Tailwind, CSS Modules, styled-components |
| **Testing** | Config files, test patterns | Vitest, Jest, Playwright, Cypress |
| **Package Manager** | Lock files | npm, yarn, pnpm, bun |
| **Linter/Formatter** | Config files | ESLint, Prettier, Biome |

### Detection Output

```
Stack Detection Complete:

  Framework:    React 18 + Vite
  Database:     Supabase (PostgreSQL)
  Auth:         Supabase Auth
  Styling:      Tailwind CSS v3
  State:        React Query + Zustand
  Testing:      Vitest + Testing Library
  Package Mgr:  npm
  Linter:       ESLint + Prettier

  Migration Dir: supabase/migrations/
  Schema:        Detected via Supabase types
  Edge Functions: supabase/functions/

Deploying audit agents...
```

---

## Phase 2: Agent Team Scan

Five agents run in parallel, each with a specific mission. The leader coordinates.

### Agent 1: DEAD CODE HUNTER

**Mission**: Find unused exports, unreachable code, and dead functions.

```yaml
agent: dead_code_hunter
scans_for:
  - Exported functions/components never imported anywhere
  - Variables declared but never read
  - Unreachable code after return/throw statements
  - Commented-out code blocks (>5 lines)
  - Unused CSS classes (if applicable)
  - Unused TypeScript types/interfaces
  - Dead feature flags or environment checks
  - Unused npm dependencies (in package.json but never imported)

method:
  - Grep all exports across the codebase
  - Cross-reference with all imports
  - Flag any export with zero importers
  - Check for dynamic imports that might reference seemingly unused exports
  - Verify no re-exports through barrel files

output_format:
  dead_exports:
    - file: "src/utils/helpers.ts"
      export: "formatCurrency"
      confidence: "high"
      reason: "Not imported anywhere in codebase"

  dead_dependencies:
    - package: "lodash"
      confidence: "high"
      reason: "Listed in package.json but never imported"

  commented_code:
    - file: "src/components/Dashboard.tsx"
      lines: "45-72"
      description: "Old chart implementation commented out"
```

### Agent 2: FILE STRUCTURE AUDITOR

**Mission**: Find unused files, orphan components, and structural issues.

```yaml
agent: file_structure_auditor
scans_for:
  - Files not imported by any other file
  - Empty files (0 meaningful content)
  - Duplicate files (same content, different location)
  - Files in wrong directories (based on naming conventions)
  - Orphan test files (test for deleted component)
  - Stale generated files
  - Leftover boilerplate/template files never customized
  - Files with only default/placeholder content

method:
  - Build full import graph of the codebase
  - Find files with no incoming edges (not imported by anything)
  - Cross-check entry points (pages, routes, main files)
  - Verify test files have corresponding source files
  - Check for duplicate content via hash comparison

output_format:
  orphan_files:
    - file: "src/components/OldHeader.tsx"
      confidence: "high"
      reason: "Not imported anywhere, not an entry point"
      safe_to_remove: true

  empty_files:
    - file: "src/utils/index.ts"
      reason: "Contains only empty export {}"

  duplicates:
    - files: ["src/lib/api.ts", "src/utils/api.ts"]
      similarity: "98%"
      recommendation: "Consolidate into src/lib/api.ts"
```

### Agent 3: DATABASE INSPECTOR

**Mission**: Audit migrations, schema, queries, and database health.

```yaml
agent: database_inspector
scans_for:
  - Duplicate migrations (same operation in multiple files)
  - Conflicting migrations (one adds column, another removes it)
  - Unused tables (defined in schema but never queried)
  - Missing indexes on frequently queried columns
  - N+1 query patterns in code
  - Raw SQL injection risks
  - Missing RLS policies (Supabase)
  - Overly permissive RLS policies
  - Schema drift (code references columns that don't exist in migrations)
  - Unused edge functions / API routes
  - Missing foreign key constraints
  - Tables without primary keys
  - Columns with no NOT NULL that should have it

database_specific:
  supabase:
    - Check RLS policies on every table
    - Verify edge function security (auth checks)
    - Check for select('*') usage (should be explicit columns)
    - Verify maybeSingle() usage where appropriate
  prisma:
    - Check for missing indexes in schema.prisma
    - Verify cascade delete behavior
    - Check for N+1 in nested includes
  drizzle:
    - Verify migration consistency
    - Check for missing relations

output_format:
  duplicate_migrations:
    - files: ["001_add_status.sql", "005_add_status_column.sql"]
      issue: "Both add 'status' column to tasks table"
      severity: "high"

  unused_tables:
    - table: "legacy_users"
      confidence: "high"
      reason: "No queries reference this table"

  missing_rls:
    - table: "user_preferences"
      severity: "high"
      recommendation: "Add SELECT/UPDATE policies scoped to auth.uid()"

  query_issues:
    - file: "src/hooks/useProjects.ts"
      line: 15
      issue: "Using select('*') instead of explicit columns"
      fix: "select('id, name, status, created_at')"
```

### Agent 4: LOGIC & ERROR SCANNER

**Mission**: Find bugs, error handling issues, and problematic logic.

```yaml
agent: logic_error_scanner
scans_for:
  - Unhandled promise rejections
  - Missing error boundaries (React)
  - Empty catch blocks (swallowing errors)
  - Race conditions in async code
  - Memory leaks (missing cleanup in useEffect)
  - Incorrect dependency arrays in hooks
  - Type assertion abuse (as any, as unknown)
  - Null/undefined access without checks
  - Infinite loop risks
  - Stale closure issues
  - Missing loading/error states in data fetching
  - Hardcoded values that should be env vars
  - Console.log statements left in production code
  - TODO/FIXME/HACK comments indicating known issues

output_format:
  errors:
    - file: "src/features/auth/useLogin.ts"
      line: 23
      severity: "high"
      issue: "Empty catch block swallows authentication errors"
      fix: "Add toast.error() and re-throw or handle gracefully"

  warnings:
    - file: "src/components/Dashboard.tsx"
      line: 45
      severity: "medium"
      issue: "useEffect missing cleanup for event listener"
      fix: "Return cleanup function that removes the listener"

  tech_debt:
    - file: "src/utils/api.ts"
      line: 12
      issue: "TODO: implement retry logic"
      age: "3 months old"
```

### Agent 5: BEST PRACTICES CHECKER

**Mission**: Ensure the codebase follows industry best practices.

```yaml
agent: best_practices_checker
scans_for:
  - Security best practices (XSS, CSRF, injection)
  - Accessibility issues (missing aria labels, alt text)
  - Performance anti-patterns (unnecessary re-renders, large bundles)
  - SEO issues (missing meta tags, missing semantic HTML)
  - Code organization (barrel exports, circular dependencies)
  - Environment variable handling (secrets in code)
  - Git hygiene (.env files tracked, large files committed)
  - Package security (known vulnerabilities in dependencies)
  - API best practices (error responses, pagination, rate limiting)
  - Consistent coding style violations

output_format:
  security:
    - issue: "API key hardcoded in src/lib/stripe.ts:5"
      severity: "critical"
      fix: "Move to environment variable STRIPE_SECRET_KEY"

  accessibility:
    - file: "src/components/ui/Button.tsx"
      issue: "Icon-only button missing aria-label"
      severity: "medium"
      fix: "Add aria-label prop for icon-only variants"

  performance:
    - file: "src/pages/Dashboard.tsx"
      issue: "Large component not code-split"
      severity: "low"
      fix: "Use React.lazy() for dashboard charts"
```

---

## Phase 3: Leader Review

After all agents complete, the leader:

1. **Cross-references findings** — If Agent 1 says a function is dead but Agent 4 found it's used dynamically, resolve the conflict
2. **Eliminates false positives** — Verify that "unused" files aren't entry points, route handlers, or dynamically imported
3. **Categorizes by safety**:
   - **SAFE**: Can be applied with zero risk (dead imports, empty files, commented code)
   - **NEEDS REVIEW**: Likely safe but user should verify (unused components, old migrations)
   - **RISKY**: Could break something, requires careful consideration (schema changes, removing shared utils)
4. **Prioritizes by impact**: Critical security issues first, then high-severity bugs, then cleanup

### Leader Output

```
Leader Review Complete:

Cross-reference results:
  - 3 false positives removed (dynamic imports detected)
  - 2 findings upgraded to higher severity
  - 1 duplicate finding merged

Final count:
  SAFE to apply:     23 items
  NEEDS REVIEW:      8 items
  RISKY (caution):   3 items

Ready to present report to user.
```

---

## Phase 4: Report to User

A comprehensive, categorized report is presented:

```markdown
## AUDIT REPORT

### Stack Detected
React 18 + Vite | Supabase (PostgreSQL) | Tailwind CSS

### Summary
| Category | Items Found | Safe | Needs Review | Risky |
|----------|-------------|------|--------------|-------|
| Dead Code | 12 | 10 | 2 | 0 |
| Unused Files | 8 | 6 | 2 | 0 |
| Database Issues | 5 | 1 | 2 | 2 |
| Logic Errors | 7 | 3 | 3 | 1 |
| Best Practices | 9 | 5 | 3 | 1 |
| **TOTAL** | **41** | **25** | **12** | **4** |

---

### SAFE — Auto-apply recommended

1. Remove unused import `formatCurrency` from src/utils/helpers.ts
2. Delete orphan file src/components/OldHeader.tsx (0 importers)
3. Remove commented-out code in src/components/Dashboard.tsx:45-72
4. Remove unused dependency `lodash` from package.json
5. ...

### NEEDS REVIEW — Verify before applying

1. File src/utils/legacy-api.ts appears unused (but check if used in scripts)
2. Table `legacy_users` has no queries (verify no external systems use it)
3. ...

### RISKY — Apply with caution

1. Missing RLS policy on `user_preferences` table (security risk)
2. API key hardcoded in src/lib/stripe.ts (critical security)
3. ...
```

### User Approval

```
[Uses AskUserQuestion tool:]

Question: "Which audit findings should I apply?"
Options:
  - Apply all SAFE items (25 changes) (Recommended)
  - Apply SAFE + let me review NEEDS REVIEW items one by one
  - Apply everything (SAFE + NEEDS REVIEW + RISKY)
  - Let me pick individually
```

---

## Phase 5: Apply Approved Changes

After user approves:

1. **Apply changes** in dependency order (remove imports before files)
2. **Run quality gates** after all changes:
   ```bash
   # Cross-platform: runs via Claude's Bash tool
   npm run typecheck
   npm run lint
   npm run test:run
   ```
3. **If gates fail**: Revert the problematic change, report which item caused the failure
4. **Commit** with detailed message:
   ```
   chore: audit cleanup — remove dead code, fix issues

   Removed:
   - 10 unused exports
   - 6 orphan files
   - 1 unused dependency (lodash)
   - 4 commented-out code blocks

   Fixed:
   - 3 empty catch blocks
   - 2 missing error boundaries
   - 1 hardcoded API key moved to env var

   Audit verified by leader. All quality gates pass.
   ```

---

## Flags Reference

| Flag | Description |
|------|-------------|
| `--focus <area>` | Audit specific area: `database`, `dead-code`, `files`, `logic`, `best-practices` |
| `--dry-run` | Report only, don't apply any changes |
| `--auto-safe` | Automatically apply all SAFE items without asking |
| `--verbose` | Show detailed agent output during scan |
| `--include-tests` | Include test files in dead code analysis (skipped by default) |
| `--profile <name>` | Use specific model profile (economy, balanced, thorough) |

---

## Example Session

```bash
$ 60/audit

Select model profile: Balanced

Detecting stack...
  React 18 + Vite | Supabase | Tailwind

Deploying audit team (Opus leader + Sonnet agents)...
  Agent 1: Dead Code Hunter        ... scanning
  Agent 2: File Structure Auditor  ... scanning
  Agent 3: Database Inspector      ... scanning
  Agent 4: Logic & Error Scanner   ... scanning
  Agent 5: Best Practices Checker  ... scanning

All agents complete. Leader reviewing...

Cross-referencing findings...
  3 false positives removed
  41 findings confirmed

═══════════════════════════════════════════════════════
  AUDIT REPORT
  41 findings | 25 safe | 12 need review | 4 risky
═══════════════════════════════════════════════════════

[... full report displayed ...]

Which findings should I apply?
> Apply SAFE + review NEEDS REVIEW individually

Applying 25 safe changes...
  Removed 10 unused exports
  Deleted 6 orphan files
  Removed 1 unused dependency
  Cleaned 4 commented-out blocks
  Fixed 3 empty catch blocks
  Added 1 missing error boundary

Reviewing NEEDS REVIEW items:

1/12: Remove src/utils/legacy-api.ts (appears unused)
  Apply? [Y/n/skip]
> Y

2/12: Drop `legacy_users` table (no queries found)
  Apply? [Y/n/skip]
> n (external system uses it)

...

Running quality gates...
  typecheck: PASS
  lint: PASS
  tests: PASS (142/142)

Committing changes...
  chore: audit cleanup — 31 changes applied

═══════════════════════════════════════════════════════
  AUDIT COMPLETE
  31 changes applied | 10 skipped | 0 failures
═══════════════════════════════════════════════════════
```

---

## Safety Guarantees

1. **No changes without approval** — Everything is reported first
2. **Leader verification** — All findings cross-checked for false positives
3. **Quality gates after changes** — Typecheck, lint, and tests must pass
4. **Automatic rollback** — If quality gates fail, the problematic change is reverted
5. **Detailed commit messages** — Every change is documented
6. **Conservative by default** — When in doubt, items are marked NEEDS REVIEW, not SAFE
