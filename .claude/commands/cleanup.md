Free up RAM by killing zombie processes while keeping essential apps running.

---

## What to keep running
- Cursor (and its helper processes)
- Chrome
- Slack
- Activity Monitor
- Claude Code (this process)
- Vite dev server (`node ... vite`)
- MCP server nodes (context7, playwriter, ai-dev-hub, mcp-remote)
- esbuild service processes

## Step 1: System overview

Run these in parallel:
1. `top -l 1 -s 0 | head -12` — get memory overview
2. `ps -eo pid,rss,command -r | head -80` — top processes by memory

Report the current RAM situation (used / free / swap).

## Step 2: Identify zombie node processes

Run: `ps -eo pid,ppid,rss,etime,command | grep -E "node.*use60" | grep -v grep | sort -k3 -rn`

Identify node processes that are **safe to kill**:
- `tsc --noEmit` processes (TypeScript type-checkers) — these are almost always stale zombies from Cursor. Kill them.
- Stale webpack/esbuild builds that have been running for a long time

**Never kill:**
- `vite` dev server
- `mcp-remote` or `context7-mcp` or `playwriter` processes
- `esbuild --service` processes (small, needed by vite)

## Step 3: Identify closeable apps

Run: `ps -eo pid,rss,comm | grep -i -E "notes|preview|music|photos|facetime|messages|maps|books|news|stocks|podcasts|weather|textedit|safari|adobe|teams|zoom|discord|telegram|whatsapp|spotify|figma|notion" | sort -k2 -rn`

Any of these apps can be quit with `kill <pid>`. Adobe Creative Cloud processes can all be killed.

## Step 4: Kill identified processes

Kill all zombie node processes and unnecessary apps found in steps 2–3. Use `kill <pid>` (not `kill -9`).

## Step 5: Verify

Run: `top -l 1 -s 0 | head -8` and `ps -eo pid,rss,command | grep -E "node.*use60" | grep -v grep`

Report:
- How much RAM was freed
- What processes remain
- Current memory status
