---
requires-profile: true
---

# /archive-run — Archive the current PRD run

> **DEPRECATED**: Use `/60/housekeeping` instead. It archives orphaned files, audits documentation, proposes maintenance tickets, and feeds the Dev Bot queue. This command still works but will be removed in a future update.

---

## STEP 0: Select Model Profile

Before proceeding, ask the user to select which model profile to use:
- **Economy** — Fastest, lowest cost
- **Balanced** — Good balance of speed & accuracy
- **Thorough** — Most accurate, highest cost

Use the `AskUserQuestion` tool with these options.

**Note**: Based on selection, appropriate models will be assigned:
- Economy: Recommended for straightforward archiving
- Balanced: Standard archiving
- Thorough: Comprehensive archiving with detailed analysis

---

Archive the current `prd.json` and `progress.txt` to make way for a new feature run.

---

## WORKFLOW

### Step 1: Check if active run exists

Check if repo-root `prd.json` exists.

If not:
```
ℹ️ No active run to archive. prd.json not found.
```
Stop.

### Step 2: Derive archive folder name

Read `prd.json` and extract:
- `runSlug` (or derive from `project` name, kebab-case)
- Current date: `YYYY-MM-DD`

Archive folder: `archive/<date>-<runSlug>/`

Example: `archive/2026-01-08-notification-center/`

### Step 3: Create archive folder

```bash
mkdir -p archive/<date>-<runSlug>/
```

### Step 4: Copy files to archive

Copy these files (if they exist):
- `prd.json` → `archive/<date>-<runSlug>/prd.json`
- `progress.txt` → `archive/<date>-<runSlug>/progress.txt`
- `tasks/prd-<runSlug>.md` → `archive/<date>-<runSlug>/prd-<runSlug>.md`

### Step 5: Clear active run files (optional)

Ask: "Delete the active run files from repo root? (y/n)"

If yes:
- Delete `prd.json`
- Delete `progress.txt`

If no:
- Leave files in place

### Step 6: Output summary

```
✅ Run archived successfully!

📁 Archive: archive/<date>-<runSlug>/
   - prd.json
   - progress.txt
   - prd-<runSlug>.md

Ready to start a new feature with /build-feature
```

---

## NOTES

- This command is automatically called by `/build-feature` when starting a new run
- Use it manually if you want to archive without starting a new feature
- Archived runs are preserved for reference but not actively tracked
