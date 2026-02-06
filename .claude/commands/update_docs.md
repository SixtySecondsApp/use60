---
requires-profile: true
---

# /update_docs — Evaluate and update project documentation

---

## STEP 0: Select Model Profile

Before proceeding, ask the user to select which model profile to use:
- **Economy** — Fastest, lowest cost
- **Balanced** — Good balance of speed & accuracy
- **Thorough** — Most accurate, highest cost

Use the `AskUserQuestion` tool with these options.

**Note**: Based on selection, appropriate models will be assigned:
- Economy: Simple updates, minor changes
- Balanced: Standard documentation updates
- Thorough: Major overhaul, comprehensive analysis

---

Evaluate the current project
Evaluate the current documentation
Update CLAUDE.md with any new functionality
Update other documentation as needed
