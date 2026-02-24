# Git Submodules

This repo uses git submodules for shared services that are developed in separate repositories.

## Current Submodules

| Submodule | Path | Repo | Branch |
|-----------|------|------|--------|
| meeting-translation | `meeting-translation/` | `SixtySecondsApp/meeting-translation` | `main` |

## Essential Commands

### First-Time Clone

```bash
git clone --recurse-submodules https://github.com/SixtySecondsApp/use60.git
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

### Pulling Changes

Always pull submodules after pulling the parent repo:

```bash
git pull origin <branch>
git submodule update --init --recursive
```

Or use this single command:

```bash
git pull --recurse-submodules origin <branch>
```

### Updating a Submodule to Latest

```bash
cd meeting-translation
git pull origin main
cd ..
git add meeting-translation
git commit -m "chore: update meeting-translation submodule"
```

### Pushing

No extra steps needed. `git push` only pushes the submodule pointer (commit hash), not the submodule code itself. If you made changes inside the submodule, push that repo separately first.

### Checking Submodule Status

```bash
git submodule status
```

## Recommended Git Config

Set these once to avoid forgetting submodule updates:

```bash
# Auto-update submodules on pull
git config --global submodule.recurse true

# Show submodule changes in git diff
git config --global diff.submodule log

# Show submodule summary in git status
git config --global status.submoduleSummary true
```

## Troubleshooting

**Submodule folder is empty after clone:**
```bash
git submodule update --init --recursive
```

**Submodule is on a detached HEAD:**
This is normal. Submodules pin to a specific commit. To work on the submodule, create or checkout a branch inside it.

**Merge conflict on submodule pointer:**
```bash
cd meeting-translation
git checkout <desired-commit>
cd ..
git add meeting-translation
```
