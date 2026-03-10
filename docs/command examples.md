All done. Here's the complete summary of changes:

  New skill created:                                                                                                                                       
  - .claude/commands/dev-hub-sync.md — /dev-hub-sync
                                                                                                                                                           
  5 commands updated to use it:                                                                                                                          
                                               
  ┌───────────────────┬───────────────────────────────────────────────────────┐
  │      Command      │                     What changed                      │
  ├───────────────────┼───────────────────────────────────────────────────────┤
  │ /build-feature    │ Step 6 now delegates to /dev-hub-sync                 │
  ├───────────────────┼───────────────────────────────────────────────────────┤
  │ /60/prd           │ Steps 3.5-3.6 now delegate to /dev-hub-sync           │
  ├───────────────────┼───────────────────────────────────────────────────────┤
  │ /60/run           │ Step 1b + 4a use parent ticket + subtask model        │
  ├───────────────────┼───────────────────────────────────────────────────────┤
  │ /60/plan          │ Dev Hub section replaced with /dev-hub-sync reference │
  ├───────────────────┼───────────────────────────────────────────────────────┤
  │ /continue-feature │ Step 4 + completion/failure use subtask model         │
  └───────────────────┴───────────────────────────────────────────────────────┘

  Old pattern (killed):
  - Create individual create_task per story with [slug] US-XXX: titles
  - No duplicate checking
  - aiDevHubTaskId per story

  New pattern (everywhere):
  - One parent ticket per PRD → subtasks per story
  - Deduplicate against existing tasks first
  - Human-readable titles
  - aiDevHubTaskId on the PRD, aiDevHubSubtaskId per story
