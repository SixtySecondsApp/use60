# deal-rescue-plan

> This reference is auto-populated from `skills/atomic/deal-rescue-plan/SKILL.md`.
> Do not edit directly — edit the source skill and re-sync.


# Deal Rescue Plan

## Goal
Turn an at-risk deal into an executable rescue plan.

## Inputs
- `deal`: from execute_action(get_deal, include_health=true)
- `recent_activity` (optional)

## Output Contract
Return:
- `data.diagnosis`: { why_at_risk, missing_info, confidence }
- `data.rescue_plan`: ranked array of actions with roi rationale
- `data.map_tasks`: array of tasks { title, description, due_date, priority }

## Rules
- Be specific and stage-aware.
- If key info is missing, include discovery steps.
- Keep MAP tasks short and demo-friendly.
