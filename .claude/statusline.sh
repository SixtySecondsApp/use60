#!/bin/bash
# Custom Claude Code statusline
# Format: Model | 💭 context bar % | block $cost (Xh Xm left) | daily $X | weekly $X | N changes
# Only shows sections with live data. ccusage runs in background to avoid blocking.

# ---- read input (must be first) ----
input=$(cat)

# ---- progress bar helper ----
progress_bar() {
  local pct="${1:-0}" width="${2:-10}"
  [[ "$pct" =~ ^[0-9]+$ ]] || return
  ((pct < 0)) && pct=0
  ((pct > 100)) && pct=100
  local filled=$(( pct * width / 100 ))
  local empty=$(( width - filled ))
  local bar=""
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done
  echo "$bar"
}

# ---- parse input JSON ----
model_name=""
context_remaining=""
if command -v jq >/dev/null 2>&1; then
  model_name=$(echo "$input" | jq -r '.model.display_name // ""' 2>/dev/null)
  context_remaining=$(echo "$input" | jq -r '.context_window.remaining_percentage // ""' 2>/dev/null)
fi

# ---- context window (instant, from input JSON) ----
context_section=""
if [ -n "$context_remaining" ] && [[ "$context_remaining" =~ ^[0-9]+$ ]]; then
  bar=$(progress_bar "$context_remaining" 10)
  context_section="💭 ${bar} ${context_remaining}%"
fi

# ---- ccusage cache config ----
CACHE_DIR="${HOME}/.claude"
BLOCKS_CACHE="${CACHE_DIR}/.statusline_blocks"
DAILY_CACHE="${CACHE_DIR}/.statusline_daily"
WEEKLY_CACHE="${CACHE_DIR}/.statusline_weekly"
LOCK_FILE="${CACHE_DIR}/.statusline_refresh.lock"
BLOCKS_TTL=60
SUMMARY_TTL=300

block_section=""
daily_section=""
weekly_section=""

# ---- read cached data (never blocks) ----
read_cache() {
  local cache_file="$1" ttl="$2"
  [ -f "$cache_file" ] || return
  local now=$(date +%s)
  local cache_time=$(head -1 "$cache_file" 2>/dev/null)
  [ -n "$cache_time" ] && [ $((now - cache_time)) -lt "$ttl" ] && tail -n +2 "$cache_file"
}

# ---- background refresh (non-blocking) ----
needs_refresh() {
  local cache_file="$1" ttl="$2"
  [ ! -f "$cache_file" ] && return 0
  local now=$(date +%s)
  local cache_time=$(head -1 "$cache_file" 2>/dev/null)
  [ -z "$cache_time" ] && return 0
  [ $((now - cache_time)) -ge "$ttl" ] && return 0
  return 1
}

refresh_in_background() {
  # Only one refresh at a time
  if [ -f "$LOCK_FILE" ]; then
    local lock_time=$(cat "$LOCK_FILE" 2>/dev/null)
    local now=$(date +%s)
    # Stale lock (>5 min), remove it
    if [ -n "$lock_time" ] && [ $((now - lock_time)) -gt 300 ]; then
      rm -f "$LOCK_FILE"
    else
      return
    fi
  fi

  local do_blocks=0 do_daily=0 do_weekly=0
  needs_refresh "$BLOCKS_CACHE" "$BLOCKS_TTL" && do_blocks=1
  needs_refresh "$DAILY_CACHE" "$SUMMARY_TTL" && do_daily=1
  needs_refresh "$WEEKLY_CACHE" "$SUMMARY_TTL" && do_weekly=1

  [ "$do_blocks" -eq 0 ] && [ "$do_daily" -eq 0 ] && [ "$do_weekly" -eq 0 ] && return

  # Run refresh in background subshell
  (
    date +%s > "$LOCK_FILE"

    ccusage_cmd="ccusage"
    command -v ccusage >/dev/null 2>&1 || ccusage_cmd="npx ccusage@latest"

    if [ "$do_blocks" -eq 1 ]; then
      output=$($ccusage_cmd blocks --json 2>/dev/null)
      if [ -n "$output" ]; then
        { date +%s; echo "$output"; } > "$BLOCKS_CACHE"
      fi
    fi

    if [ "$do_daily" -eq 1 ]; then
      today=$(date +%Y%m%d)
      output=$($ccusage_cmd daily --json --since "$today" 2>/dev/null)
      if [ -n "$output" ]; then
        { date +%s; echo "$output"; } > "$DAILY_CACHE"
      fi
    fi

    if [ "$do_weekly" -eq 1 ]; then
      dow=$(date +%u)
      days_since_monday=$((dow - 1))
      if command -v gdate >/dev/null 2>&1; then
        week_start=$(gdate -d "-${days_since_monday} days" +%Y%m%d)
      else
        week_start=$(date -v-${days_since_monday}d +%Y%m%d 2>/dev/null || date +%Y%m%d)
      fi
      output=$($ccusage_cmd weekly --json --since "$week_start" 2>/dev/null)
      if [ -n "$output" ]; then
        { date +%s; echo "$output"; } > "$WEEKLY_CACHE"
      fi
    fi

    rm -f "$LOCK_FILE"
  ) &>/dev/null &
  disown 2>/dev/null
}

# ---- parse cached ccusage data (instant reads) ----
if command -v jq >/dev/null 2>&1; then
  # Block data
  blocks_data=$(read_cache "$BLOCKS_CACHE" "$BLOCKS_TTL")
  if [ -n "$blocks_data" ]; then
    active_block=$(echo "$blocks_data" | jq -c '.blocks[] | select(.isActive == true)' 2>/dev/null | head -n1)
    if [ -n "$active_block" ]; then
      block_cost=$(echo "$active_block" | jq -r '.costUSD // ""' 2>/dev/null)
      remaining_min=$(echo "$active_block" | jq -r '.projection.remainingMinutes // ""' 2>/dev/null)
      if [ -n "$block_cost" ] && [[ "$block_cost" =~ ^[0-9.]+$ ]]; then
        cost_fmt=$(printf '%.2f' "$block_cost")
        if [ -n "$remaining_min" ] && [[ "$remaining_min" =~ ^[0-9]+$ ]]; then
          rh=$((remaining_min / 60))
          rm=$((remaining_min % 60))
          block_section="block \$${cost_fmt} (${rh}h ${rm}m left)"
        else
          block_section="block \$${cost_fmt}"
        fi
      fi
    fi
  fi

  # Daily cost
  daily_data=$(read_cache "$DAILY_CACHE" "$SUMMARY_TTL")
  if [ -n "$daily_data" ]; then
    daily_cost=$(echo "$daily_data" | jq -r '.daily[0].totalCost // ""' 2>/dev/null)
    if [ -n "$daily_cost" ] && [[ "$daily_cost" =~ ^[0-9.]+$ ]]; then
      cost_fmt=$(printf '%.2f' "$daily_cost")
      daily_section="daily \$${cost_fmt}"
    fi
  fi

  # Weekly cost
  weekly_data=$(read_cache "$WEEKLY_CACHE" "$SUMMARY_TTL")
  if [ -n "$weekly_data" ]; then
    weekly_cost=$(echo "$weekly_data" | jq -r '[.weekly[].totalCost] | add // ""' 2>/dev/null)
    if [ -n "$weekly_cost" ] && [[ "$weekly_cost" =~ ^[0-9.]+$ ]]; then
      cost_fmt=$(printf '%.2f' "$weekly_cost")
      weekly_section="weekly \$${cost_fmt}"
    fi
  fi

  # Kick off background refresh if any cache is stale
  refresh_in_background
fi

# ---- git changes count ----
changes_section=""
if git rev-parse --git-dir >/dev/null 2>&1; then
  staged=$(git diff --cached --numstat 2>/dev/null | wc -l | tr -d ' ')
  unstaged=$(git diff --numstat 2>/dev/null | wc -l | tr -d ' ')
  untracked=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
  total_changes=$((staged + unstaged + untracked))
  changes_section="${total_changes} changes"
fi

# ---- render: join non-empty sections with " | " ----
parts=()
[ -n "$model_name" ] && parts+=("$model_name")
[ -n "$context_section" ] && parts+=("$context_section")
[ -n "$block_section" ] && parts+=("$block_section")
[ -n "$daily_section" ] && parts+=("$daily_section")
[ -n "$weekly_section" ] && parts+=("$weekly_section")
[ -n "$changes_section" ] && parts+=("$changes_section")

output=""
for i in "${!parts[@]}"; do
  if [ "$i" -eq 0 ]; then
    output="${parts[$i]}"
  else
    output="${output} | ${parts[$i]}"
  fi
done

printf '%s\n' "$output"
