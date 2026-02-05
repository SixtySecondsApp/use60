#!/bin/bash
# Custom Claude Code statusline
# Format: Model | ctx ████░░ 42% | day ████░░ $106/$200 | wk ████░░ $196/$750 | 3 changes
#
# ── Configure your limits here ──────────────────────────────
DAILY_LIMIT=200    # daily budget in USD (adjust to your plan)
WEEKLY_LIMIT=750   # weekly budget in USD (adjust to your plan)
# ────────────────────────────────────────────────────────────

# ── read input (must be first) ──
input=$(cat)

# ── ANSI colors ──
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_RED=$'\033[31m'
C_DIM=$'\033[2m'
C_RESET=$'\033[0m'

# ── color for percentage (green <50, yellow 50-80, red >80) ──
color_for_pct() {
  local pct="${1:-0}"
  if ((pct >= 80)); then echo "$C_RED"
  elif ((pct >= 50)); then echo "$C_YELLOW"
  else echo "$C_GREEN"
  fi
}

# ── progress bar helper ──
# Usage: progress_bar <percentage> <width> [color: yes|no]
progress_bar() {
  local pct="${1:-0}" width="${2:-10}" use_color="${3:-yes}"
  # Handle decimals — truncate to int
  pct="${pct%%.*}"
  [[ "$pct" =~ ^-?[0-9]+$ ]] || pct=0
  ((pct < 0)) && pct=0
  ((pct > 100)) && pct=100
  local filled=$(( pct * width / 100 ))
  local empty=$(( width - filled ))
  local color=""
  local reset=""
  if [ "$use_color" = "yes" ]; then
    color=$(color_for_pct "$pct")
    reset="$C_RESET"
  fi
  local bar="${color}"
  for ((i=0; i<filled; i++)); do bar+="█"; done
  bar+="${reset}${C_DIM}"
  for ((i=0; i<empty; i++)); do bar+="░"; done
  bar+="${reset}"
  echo "$bar"
}

# ── parse input JSON ──
model_name=""
context_used=""
if command -v jq >/dev/null 2>&1; then
  model_name=$(echo "$input" | jq -r '.model.display_name // ""' 2>/dev/null)
  context_remaining=$(echo "$input" | jq -r '.context_window.remaining_percentage // ""' 2>/dev/null)
  if [ -n "$context_remaining" ]; then
    # Convert remaining → used (strip decimals first)
    context_remaining_int="${context_remaining%%.*}"
    if [[ "$context_remaining_int" =~ ^[0-9]+$ ]]; then
      context_used=$((100 - context_remaining_int))
    fi
  fi
fi

# ── context window (instant, from input JSON) ──
context_section=""
if [ -n "$context_used" ]; then
  bar=$(progress_bar "$context_used" 10)
  clr=$(color_for_pct "$context_used")
  context_section="ctx ${bar} ${clr}${context_used}%${C_RESET}"
fi

# ── ccusage cache config ──
CACHE_DIR="${HOME}/.claude"
DAILY_CACHE="${CACHE_DIR}/.statusline_daily"
WEEKLY_CACHE="${CACHE_DIR}/.statusline_weekly"
LOCK_FILE="${CACHE_DIR}/.statusline_refresh.lock"
SUMMARY_TTL=120  # refresh every 2 minutes

daily_section=""
weekly_section=""

# ── read cached data (never blocks) ──
read_cache() {
  local cache_file="$1" ttl="$2"
  [ -f "$cache_file" ] || return
  local now=$(date +%s)
  local cache_time=$(head -1 "$cache_file" 2>/dev/null)
  [ -n "$cache_time" ] && [ $((now - cache_time)) -lt "$ttl" ] && tail -n +2 "$cache_file"
}

# ── background refresh (non-blocking) ──
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
    if [ -n "$lock_time" ] && [ $((now - lock_time)) -gt 300 ]; then
      rm -f "$LOCK_FILE"
    else
      return
    fi
  fi

  local do_daily=0 do_weekly=0
  needs_refresh "$DAILY_CACHE" "$SUMMARY_TTL" && do_daily=1
  needs_refresh "$WEEKLY_CACHE" "$SUMMARY_TTL" && do_weekly=1

  [ "$do_daily" -eq 0 ] && [ "$do_weekly" -eq 0 ] && return

  (
    date +%s > "$LOCK_FILE"

    ccusage_cmd="ccusage"
    command -v ccusage >/dev/null 2>&1 || ccusage_cmd="npx ccusage@latest"

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

# ── parse cached ccusage data (instant reads) ──
if command -v jq >/dev/null 2>&1; then
  # Daily cost
  daily_data=$(read_cache "$DAILY_CACHE" "$SUMMARY_TTL")
  if [ -n "$daily_data" ]; then
    daily_cost=$(echo "$daily_data" | jq -r '.daily[0].totalCost // 0' 2>/dev/null)
    if [ -n "$daily_cost" ] && [[ "$daily_cost" =~ ^[0-9.]+$ ]]; then
      daily_cost_int="${daily_cost%%.*}"
      [ -z "$daily_cost_int" ] && daily_cost_int=0
      daily_pct=$((daily_cost_int * 100 / DAILY_LIMIT))
      ((daily_pct > 100)) && daily_pct=100
      bar=$(progress_bar "$daily_pct" 10)
      clr=$(color_for_pct "$daily_pct")
      cost_fmt=$(printf '%.0f' "$daily_cost")
      daily_section="day ${bar} ${clr}\$${cost_fmt}/\$${DAILY_LIMIT}${C_RESET}"
    fi
  fi

  # Weekly cost
  weekly_data=$(read_cache "$WEEKLY_CACHE" "$SUMMARY_TTL")
  if [ -n "$weekly_data" ]; then
    weekly_cost=$(echo "$weekly_data" | jq -r '[.weekly[].totalCost] | add // 0' 2>/dev/null)
    if [ -n "$weekly_cost" ] && [[ "$weekly_cost" =~ ^[0-9.]+$ ]]; then
      weekly_cost_int="${weekly_cost%%.*}"
      [ -z "$weekly_cost_int" ] && weekly_cost_int=0
      weekly_pct=$((weekly_cost_int * 100 / WEEKLY_LIMIT))
      ((weekly_pct > 100)) && weekly_pct=100
      bar=$(progress_bar "$weekly_pct" 10)
      clr=$(color_for_pct "$weekly_pct")
      cost_fmt=$(printf '%.0f' "$weekly_cost")
      weekly_section="wk ${bar} ${clr}\$${cost_fmt}/\$${WEEKLY_LIMIT}${C_RESET}"
    fi
  fi

  # Kick off background refresh if any cache is stale
  refresh_in_background
fi

# ── supabase environment (from .env VITE_SUPABASE_URL) ──
env_section=""
PROJECT_DIR=$(echo "$input" | jq -r '.workspace.project_dir // ""' 2>/dev/null)
[ -z "$PROJECT_DIR" ] && PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -n "$PROJECT_DIR" ]; then
  # Detect from running Vite process --mode flag (source of truth)
  vite_mode=$(ps aux 2>/dev/null | grep "[v]ite --mode" | grep -o '\-\-mode [a-z]*' | head -1 | awk '{print $2}')
  if [ -n "$vite_mode" ]; then
    envfile="$PROJECT_DIR/.env.${vite_mode}"
  else
    envfile="$PROJECT_DIR/.env"
  fi
  supa_url=$(grep "^VITE_SUPABASE_URL=" "$envfile" 2>/dev/null | cut -d= -f2)
  case "$supa_url" in
    *wbgmnyekgqklggilgqag*) env_section="${C_GREEN}dev${C_RESET}" ;;
    *caerqjzvuerejfrdtygb*) env_section="${C_YELLOW}staging${C_RESET}" ;;
    *ygdpgliavpxeugaajgrb*) env_section="${C_RED}PROD${C_RESET}" ;;
  esac
fi

# ── git branch + uncommitted changes ──
branch_section=""
changes_section=""
if git rev-parse --git-dir >/dev/null 2>&1; then
  branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
  [ -n "$branch" ] && branch_section="${C_DIM}${branch}${C_RESET}"

  staged=$(git diff --cached --numstat 2>/dev/null | wc -l | tr -d ' ')
  unstaged=$(git diff --numstat 2>/dev/null | wc -l | tr -d ' ')
  untracked=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
  total=$((staged + unstaged + untracked))
  if [ "$total" -gt 0 ]; then
    changes_section="${C_YELLOW}${total} changes${C_RESET}"
  fi
fi

# ── render: join non-empty sections with " | " ──
parts=()
[ -n "$model_name" ] && parts+=("$model_name")
[ -n "$context_section" ] && parts+=("$context_section")
[ -n "$daily_section" ] && parts+=("$daily_section")
[ -n "$weekly_section" ] && parts+=("$weekly_section")
[ -n "$env_section" ] && parts+=("$env_section")
[ -n "$branch_section" ] && parts+=("$branch_section")
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
