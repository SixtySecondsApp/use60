---
name: Dev Hub Command Center
description: |
  Manage developer workflow through AI Dev Hub: morning briefs, smart ticket CRUD,
  session-based time tracking, progress dashboards, and code-aware ticket creation.
  Use when a user asks "what's on my plate", "create a ticket for...", "start working on TSK-123",
  "show my progress", or wants to turn code errors and TODOs into tracked tickets.
  Returns task summaries, session logs, sprint stats, and ticket confirmations.
metadata:
  author: sixty-ai
  version: "2"
  category: data-access
  skill_type: atomic
  is_active: true
  context_profile: communication
  agent_affinity:
    - crm_ops
  triggers:
    - pattern: "what's on my plate"
      intent: "morning_brief"
      confidence: 0.85
      examples:
        - "what's on my plate today"
        - "morning brief"
        - "dev brief"
        - "what should I work on"
        - "show my assignments"
    - pattern: "create a ticket"
      intent: "create_task"
      confidence: 0.90
      examples:
        - "create a ticket for fixing the login bug"
        - "new ticket"
        - "file a task for"
        - "add a ticket to the backlog"
        - "create an issue for"
    - pattern: "start working on"
      intent: "start_session"
      confidence: 0.85
      examples:
        - "start working on TSK-123"
        - "begin session on"
        - "clock in on"
        - "picking up TSK-123"
    - pattern: "done with"
      intent: "end_session"
      confidence: 0.85
      examples:
        - "done with TSK-123"
        - "stop working on"
        - "clock out"
        - "finished with TSK-123"
        - "wrap up session"
    - pattern: "show my progress"
      intent: "progress_dashboard"
      confidence: 0.85
      examples:
        - "show my progress"
        - "sprint stats"
        - "how am I doing"
        - "my velocity"
        - "dev dashboard"
    - pattern: "create a bug from this error"
      intent: "code_aware_ticket"
      confidence: 0.90
      examples:
        - "create a bug from this error"
        - "TODO to ticket"
        - "turn this into a ticket"
        - "file a bug for this"
        - "create a task from this diff"
    - pattern: "show me TSK-"
      intent: "get_task"
      confidence: 0.85
      examples:
        - "show me TSK-123"
        - "what's the status of TSK-456"
        - "pull up task 789"
        - "get ticket details"
  keywords:
    - "ticket"
    - "task"
    - "sprint"
    - "progress"
    - "session"
    - "backlog"
    - "brief"
    - "velocity"
    - "bug"
    - "TODO"
    - "dev hub"
    - "working on"
  required_context: []
  optional_context:
    - task_id
    - project_id
  inputs:
    - name: task_id
      type: string
      description: "Task identifier (e.g., TSK-123) for lookup, session tracking, or updates"
      required: false
    - name: project_id
      type: string
      description: "Project ID to scope task searches and creation"
      required: false
    - name: user_description
      type: string
      description: "Natural language description for ticket creation or code context for code-aware tickets"
      required: false
  outputs:
    - name: brief
      type: object
      description: "Morning brief with grouped tasks by status, overdue flags, and recent activity"
    - name: task
      type: object
      description: "Single task details with title, status, assignees, comments, and history"
    - name: session
      type: object
      description: "Time tracking session with start/end timestamps, duration, and running totals"
    - name: dashboard
      type: object
      description: "Progress dashboard with completed/open counts, velocity, and overdue items"
  execution_mode: sync
  timeout_ms: 30000
  priority: high
  tags:
    - dev-hub
    - project-management
    - time-tracking
    - productivity
    - developer-tools
---

# Dev Hub Command Center

## Goal

Provide developers with a unified command interface to AI Dev Hub for daily workflow management. This skill turns natural language into structured project management actions -- fetching briefs, creating tickets, tracking time, and monitoring progress -- all without leaving the chat.

## MCP Tools Used

This skill uses the AI Dev Hub MCP server. Reference tools by short name; Claude resolves them to the full MCP tool names automatically.

| Tool | Purpose |
|------|---------|
| `search_tasks` | Find tasks by status, assignee, project |
| `get_task` | Retrieve full task details |
| `create_task` | Create new tasks/tickets |
| `update_task` | Update task status, fields, time entries |
| `add_task_assignee` | Assign users to tasks |
| `create_comment` | Add comments (used for session logs) |
| `list_comments` | Read task comments and session history |
| `search_projects` | Find projects by name |
| `search_users` | Resolve current user identity |
| `get_recent_changes` | Fetch recent activity across projects |

## User Identity Resolution

Before any personalized query, resolve the current user:

1. Call `search_users` with the user's name or email from context
2. Cache the returned user ID for the session
3. Use this ID to filter `search_tasks` by assignee

If user identity cannot be resolved, ask: "I couldn't find your Dev Hub profile. What name or email should I search for?"

## Instructions

### Morning Brief

When the user asks "what's on my plate", "morning brief", or "what should I work on":

1. Resolve user identity (see above)
2. Call `search_tasks` with the user's ID, filtering for open/in-progress tasks
3. Call `get_recent_changes` to fetch activity from the last 24 hours
4. Group tasks by status:
   - **In Progress** -- tasks currently being worked on
   - **Overdue** -- tasks past their due date (flag with [!])
   - **Due Today** -- tasks due today
   - **Upcoming** -- tasks due this week
   - **Backlog** -- unscheduled open tasks
5. Present as a scannable brief:

```
DEV BRIEF -- [Date]

IN PROGRESS (2)
  TSK-142  Fix OAuth token refresh       Due: Today
  TSK-138  Add pagination to /api/users  Due: Tomorrow

OVERDUE (1)
  [!] TSK-105  Update API docs for v2    Due: 3 days ago

DUE TODAY (1)
  TSK-150  Review PR #847

UPCOMING THIS WEEK (2)
  TSK-155  Schema migration for billing  Due: Thursday
  TSK-160  Write integration tests       Due: Friday

RECENT ACTIVITY (last 24h)
  TSK-138  Comment by Sarah: "API review approved"
  TSK-142  Status changed to In Progress
```

6. End with a recommendation: suggest tackling overdue items first, then in-progress work

### Smart Ticket CRUD

#### Creating Tickets

When the user says "create a ticket for..." or "new ticket":

1. Extract the user's description
2. If a project is not specified, call `search_projects` and ask which project to use (or use the most recent)
3. AI-generate structured ticket fields from the brief description:
   - **Title**: Concise, imperative form (e.g., "Fix login timeout on mobile")
   - **Description**: Expanded from the user's input with acceptance criteria
   - **Priority**: Inferred from language ("critical", "bug", "nice to have")
4. Call `create_task` with the generated fields
5. Optionally call `add_task_assignee` to assign the creator
6. Confirm creation:

```
Created TSK-172: "Fix login timeout on mobile"
  Project: Backend API
  Priority: High
  Assigned: You

Description:
  The login endpoint times out on mobile clients when network
  conditions are poor. Investigate timeout thresholds and add
  retry logic.

  Acceptance criteria:
  - Login succeeds on 3G connections within 10s
  - Timeout errors show user-friendly message
  - Retry logic with exponential backoff
```

#### Viewing Tickets

When the user asks "show me TSK-123" or "what's the status of...":

1. Call `get_task` with the task ID
2. Call `list_comments` for recent discussion
3. Present task details with status, assignees, dates, and recent comments

#### Updating Tickets

When the user says "update TSK-123" or "mark TSK-123 as done":

1. Call `get_task` to fetch current state
2. Determine the update from the user's request (status change, field update, etc.)
3. Call `update_task` with the changes
4. Confirm the update with before/after state

### Session Time Tracking

Time tracking uses task comments as a persistence layer -- this provides an auditable log with no new infrastructure required.

#### Starting a Session

When the user says "start working on TSK-123":

1. Call `get_task` to verify the task exists
2. Call `create_comment` on the task with a session-start marker:
   - Content: `[SESSION START] {timestamp_iso}`
3. Call `update_task` to set status to "In Progress" if not already
4. Confirm:

```
Session started on TSK-142: "Fix OAuth token refresh"
  Started: 10:32 AM
  Status: In Progress
```

#### Ending a Session

When the user says "done with TSK-123" or "stop working on":

1. Call `list_comments` on the task to find the most recent `[SESSION START]`
2. Calculate duration from start to now
3. Call `create_comment` with a session-end marker:
   - Content: `[SESSION END] {timestamp_iso} | Duration: {hours}h {minutes}m`
4. Confirm with duration:

```
Session ended on TSK-142: "Fix OAuth token refresh"
  Duration: 2h 15m
  Total time on this task: 5h 30m
```

#### Calculating Running Totals

When showing task details or session summaries, scan all comments for `[SESSION START]` and `[SESSION END]` markers to compute:
- Total time spent on the task
- Number of sessions
- Average session length

### Progress Dashboard

When the user asks "show my progress" or "sprint stats":

1. Resolve user identity
2. Call `search_tasks` for the user's tasks across all statuses
3. Call `get_recent_changes` for the last 7 days
4. Compute metrics:
   - **Completed this week**: count of tasks moved to Done
   - **In Progress**: count of active tasks
   - **Open/Backlog**: count of unstarted tasks
   - **Overdue**: count of past-due tasks
   - **Velocity**: tasks completed per week (based on available history)
5. Present as a dashboard:

```
PROGRESS DASHBOARD -- Week of [Date]

COMPLETED THIS WEEK     8 tasks
IN PROGRESS             3 tasks
OPEN / BACKLOG         12 tasks
OVERDUE                 2 tasks

VELOCITY
  This week:  8 tasks
  Last week:  6 tasks
  Trend:      +33% improvement

OVERDUE ITEMS
  [!] TSK-105  Update API docs for v2    3 days overdue
  [!] TSK-098  Fix flaky CI test         5 days overdue

RECENT COMPLETIONS
  TSK-148  Refactor auth middleware      Completed yesterday
  TSK-145  Add rate limiting             Completed 2 days ago
  TSK-140  Database connection pooling   Completed 3 days ago
```

### Code-Aware Tickets

When the user provides code context (error messages, TODOs, diffs) and asks to create a ticket:

#### Error to Bug Ticket

When the user shares an error and says "create a bug from this":

1. Parse the error message, stack trace, or log output
2. Generate a structured bug report:
   - **Title**: Descriptive bug title from the error
   - **Description**: Include the error message, likely cause, and reproduction steps
   - **Priority**: Critical if it's a crash/500, High if it's a user-facing error, Medium otherwise
3. Call `create_task` with the generated fields

#### TODO to Ticket

When the user says "TODO to ticket" or references a TODO comment:

1. Extract the TODO text and file location
2. Generate a task:
   - **Title**: Action from the TODO (e.g., "Implement caching for user queries")
   - **Description**: Include the file path, line reference, and surrounding context
3. Call `create_task`

#### Diff to Follow-Up

When the user shares a diff or PR description and says "create a follow-up":

1. Analyze the changes for follow-up items (missing tests, partial implementations, tech debt)
2. Generate one or more tasks for each follow-up
3. Call `create_task` for each

## Error Handling

### Task Not Found
If a task ID doesn't resolve, respond: "I couldn't find task [ID]. Double-check the ID or try searching: 'search for [keyword]'."

### Project Not Found
If no projects match, list available projects: "I couldn't find that project. Here are your projects -- which one did you mean?"

### User Not Found
If user identity can't be resolved, ask for clarification rather than guessing: "What name or email is your Dev Hub account under?"

### No Open Tasks
If the morning brief finds zero tasks, respond positively: "Your plate is clear! No open tasks assigned to you. Want to pull something from the backlog?"

### Session Already Active
If starting a session but a `[SESSION START]` without a matching `[SESSION END]` exists, warn: "You have an active session on this task started at [time]. Want me to end that one and start fresh?"

### API Errors
If an AI Dev Hub tool call fails, report the error clearly and suggest a retry: "The Dev Hub API returned an error: [message]. Want me to try again?"

## Guidelines

- Always use task IDs (not titles) when calling AI Dev Hub tools -- titles are for display only
- Session markers in comments use the exact format `[SESSION START]` and `[SESSION END]` for reliable parsing
- When creating tickets from code context, always include the source (file path, error message, TODO text) in the description
- Keep brief output scannable -- use the grouping format shown above, no prose paragraphs
- Recommend tackling overdue items first in morning briefs
- For progress dashboards, show trends when enough history exists (2+ weeks)
- Never fabricate task data -- if a field is unknown, omit it
