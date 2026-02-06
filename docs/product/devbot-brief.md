# DevBot V2-A: Clarifying Questions System & Dev Manager Agent

**Priority:** High  
**Assignee:** Angelo  
**Sprint:** This Week  
**Dependencies:** V1 (Cursor-based flow) - Complete  

---

## Overview

Build the intelligence layer that assesses ticket quality and orchestrates clarifying questions before spinning up development in the cloud. This creates a "Dev Manager" agent that decides whether a ticket has enough context or needs human input.

---

## User Stories

**As a user submitting a ticket**, I want the system to ask me clarifying questions if my ticket lacks detail, so that the DevBot produces better results first time.

**As a user**, I want to choose how I receive clarifying questions (Dev Hub app or Slack), based on my preferences.

**As a user**, I want quick option-based responses (Option 1, 2, 3 + Other), so I can provide context without typing lengthy explanations.

---

## Acceptance Criteria

### 1. Ticket Quality Assessment (Dev Manager Agent)

- [ ] On ticket creation (via MCP or manual UI), automatically assess ticket quality
- [ ] Generate a quality score/rating based on:
  - Clarity of requirements
  - Completeness of acceptance criteria
  - Technical specificity
  - Presence of edge cases / error handling requirements
  - Reference to existing code/files
- [ ] If quality score exceeds threshold → auto-spin to cloud (skip questions)
- [ ] If quality score below threshold → trigger clarifying questions flow
- [ ] Log assessment reasoning for transparency

### 2. Clarifying Questions Generation

- [ ] Dev Manager generates contextual clarifying questions based on what's missing
- [ ] Questions formatted as multiple choice where possible:
  - Option 1: [Specific suggestion]
  - Option 2: [Alternative approach]
  - Option 3: [Third option]
  - Other: [Free text input]
- [ ] Maximum of 3-5 questions per round
- [ ] Questions should be specific to the ticket context, not generic

### 3. Multi-Channel Delivery (User Preference Based)

**Dev Hub App:**
- [ ] Display questions in the ticket UI
- [ ] Radio buttons / clickable options for choices
- [ ] Text input field for "Other" option
- [ ] Submit button to confirm answers

**Slack Integration:**
- [ ] Deliver questions via Slack blocks
- [ ] Interactive buttons for Option 1, 2, 3
- [ ] "Other" button opens modal or prompts text reply
- [ ] Handle user selection and free-text responses
- [ ] User preference stored in profile (app vs Slack)

### 4. Context Aggregation & Spin-Up

- [ ] Aggregate all clarifying answers into enriched ticket context
- [ ] Update ticket with additional context before cloud spin-up
- [ ] Re-assess quality after clarification (should now meet threshold)
- [ ] Trigger cloud development process with enriched context

### 5. MCP & Manual UI Parity

- [ ] Works identically whether ticket added via MCP or manual UI
- [ ] Same assessment logic, same question flow
- [ ] Consistent user experience across entry points

---

## Technical Notes

### Suggested Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TICKET ENTRY                                │
│         (MCP Flow)              (Manual UI)                     │
└─────────────────┬──────────────────────┬───────────────────────┘
                  │                      │
                  ▼                      ▼
         ┌────────────────────────────────────────┐
         │        DEV MANAGER AGENT               │
         │   - Assess ticket quality              │
         │   - Score against threshold            │
         │   - Generate clarifying questions      │
         └────────────────┬───────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
        Score >= Threshold      Score < Threshold
              │                       │
              ▼                       ▼
    ┌─────────────────┐    ┌─────────────────────┐
    │ SPIN TO CLOUD   │    │ CLARIFYING QUESTIONS│
    │ (Skip questions)│    │ (Slack or App)      │
    └─────────────────┘    └──────────┬──────────┘
                                      │
                                      ▼
                           ┌──────────────────────┐
                           │ AGGREGATE CONTEXT    │
                           │ Update ticket        │
                           └──────────┬───────────┘
                                      │
                                      ▼
                           ┌──────────────────────┐
                           │ SPIN TO CLOUD        │
                           └──────────────────────┘
```

### Slack Block Example Structure

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🤖 *DevBot needs clarification on:* `TICKET-123`"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn", 
        "text": "*Q1: How should the API handle authentication?*"
      }
    },
    {
      "type": "actions",
      "elements": [
        { "type": "button", "text": { "type": "plain_text", "text": "JWT Tokens" }, "value": "q1_opt1" },
        { "type": "button", "text": { "type": "plain_text", "text": "API Keys" }, "value": "q1_opt2" },
        { "type": "button", "text": { "type": "plain_text", "text": "OAuth 2.0" }, "value": "q1_opt3" },
        { "type": "button", "text": { "type": "plain_text", "text": "Other..." }, "value": "q1_other" }
      ]
    }
  ]
}
```

### Quality Assessment Prompt (Starting Point)

```
Assess this development ticket for completeness:

TICKET:
{ticket_content}

Score 1-10 on each dimension:
1. Requirement Clarity: Is it clear what needs to be built?
2. Acceptance Criteria: Are success conditions defined?
3. Technical Specificity: Are technologies/patterns specified?
4. Edge Cases: Are error states and edge cases considered?
5. Context: Are relevant files/code areas referenced?

If overall score < 7, generate 3-5 clarifying questions as multiple choice.
```

---

## Out of Scope (Handled in V2-B)

- Hooks system (notification, stop hooks)
- Live preview in PR
- PR review workflow
- Auto-test generation

---

## Definition of Done

- [ ] Ticket quality assessment runs on all new tickets
- [ ] High-quality tickets skip straight to cloud
- [ ] Low-quality tickets trigger clarifying questions
- [ ] Questions delivered via user's preferred channel
- [ ] Slack blocks work with buttons + "Other" text input
- [ ] Dev Hub app has equivalent question UI
- [ ] Answers enrich ticket context before development
- [ ] Works for both MCP and manual ticket creation
- [ ] Unit tests for quality assessment logic
- [ ] Integration tests for Slack interaction flow