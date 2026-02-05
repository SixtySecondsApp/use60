# QA Testing Checklist — Copilot Excellence Upgrade

**Date**: 2026-01-24  
**Build**: Copilot Excellence Upgrade  
**Environment**: Staging / Production

---

## Pre-Testing Setup

- [ ] Clear browser cache and cookies
- [ ] Log in with a test user account
- [ ] Ensure test data exists (meetings, deals, contacts, tasks)
- [ ] Open browser DevTools console to monitor for errors

---

## 1. ToolCallIndicator — Error State Visualization

### Test Scenario: Error State Display

**Steps:**
1. Open the Copilot panel
2. Type a query that will fail (e.g., request data that doesn't exist)
3. Observe the tool execution indicator

**Expected Results:**
- [ ] Error state shows **red icon** (XCircle) instead of green checkmark
- [ ] Error state shows **"Failed"** status label
- [ ] Error message displays in a **red-tinted box** with alert icon
- [ ] Error message text is readable and descriptive
- [ ] Progress bar shows red gradient when in error state
- [ ] Animation pulse uses red color scheme

### Test Scenario: Normal Completion

**Steps:**
1. Type "What meetings do I have today?"
2. Observe the tool execution flow

**Expected Results:**
- [ ] Pending state shows gray icon
- [ ] Active state shows blue spinner with pulse animation
- [ ] Complete state shows green checkmark with spring animation
- [ ] Duration estimate shows while processing
- [ ] Actual duration shows after completion

---

## 2. Response Components — Action Contract Compliance

### Test Components (all should navigate via action system, not direct URL):

#### DailyFocusPlanResponse
**Steps:**
1. Trigger daily focus plan: "What should I focus on today?"
2. Click "View tasks" button

**Expected Results:**
- [ ] Clicking "View tasks" navigates to `/tasks` page
- [ ] No console errors about `window.location`
- [ ] Navigation is smooth (uses React Router)

#### DealSlippageGuardrailsResponse
**Steps:**
1. Ask "Which deals are slipping?"
2. Click "View deal" button on any deal card

**Expected Results:**
- [ ] Clicking "View deal" navigates to `/crm/deals/{dealId}`
- [ ] Deal page loads correctly with right data

#### DealMapBuilderResponse
**Steps:**
1. Ask "Build a MAP for [deal name]"
2. Click "View deal" button
3. Click "View tasks" button

**Expected Results:**
- [ ] "View deal" navigates correctly
- [ ] "View tasks" navigates correctly
- [ ] No direct `window.location` calls in console

#### DealRescuePackResponse
**Steps:**
1. Ask "How do I rescue [at-risk deal]?"
2. Test both "View deal" and "View tasks" buttons

**Expected Results:**
- [ ] Both buttons navigate correctly
- [ ] Buttons use the action contract pattern

#### PipelineFocusTasksResponse
**Steps:**
1. Ask "What pipeline deals need attention?"
2. Click on deal and task links

**Expected Results:**
- [ ] Deal links navigate to deal pages
- [ ] Task button navigates to tasks page

#### NextMeetingCommandCenterResponse
**Steps:**
1. Ask "Prep me for my next meeting"
2. Click "View meeting" button
3. Click on attendee names (if linked)
4. Click "View tasks" button

**Expected Results:**
- [ ] Meeting link opens meeting detail
- [ ] Contact links open contact profiles
- [ ] Tasks button navigates correctly

---

## 3. CopilotEmpty — Welcome State

### Test Scenario: Initial State Display

**Steps:**
1. Open Copilot panel with no conversation history
2. Observe the welcome state

**Expected Results:**
- [ ] "Let's close more deals today" heading displays
- [ ] 4 action cards show in 2x2 grid:
  - [ ] Draft a follow-up (violet icon)
  - [ ] Prep for a meeting (emerald icon)
  - [ ] What needs attention? (pink icon)
  - [ ] Catch me up (blue icon)
- [ ] Hover effects work on all cards (scale, shadow)
- [ ] Input textarea is visible with placeholder text
- [ ] "Try asking" section shows suggested prompts

### Test Scenario: Action Card Clicks

**Steps:**
1. Click each action card in sequence
2. Observe the message sent

**Expected Results:**
- [ ] "Draft a follow-up" sends: "Draft a follow-up email for my recent meeting"
- [ ] "Prep for a meeting" sends: "Prepare me for my next meeting"
- [ ] "What needs attention?" sends: "What deals or tasks need my attention today?"
- [ ] "Catch me up" sends: "Catch me up on recent activity and what I missed"

### Test Scenario: Custom Input

**Steps:**
1. Type custom message in textarea
2. Press Enter or click "Let's go" button

**Expected Results:**
- [ ] Button enables when text is entered
- [ ] Enter key sends message (without Shift)
- [ ] Shift+Enter creates new line
- [ ] Textarea auto-resizes with content

---

## 4. Structured Response Types

### Test Each Response Type Renders Correctly:

| Response Type | Trigger Query | Check |
|---------------|---------------|-------|
| `meeting_list` | "What meetings today?" | [ ] Shows meeting cards |
| `calendar` | "What's on my calendar?" | [ ] Shows calendar view |
| `pipeline` | "Show my pipeline" | [ ] Shows deal cards with health |
| `email` | "Draft email to [contact]" | [ ] Shows email composer |
| `daily_brief` | "Catch me up" | [ ] Shows time-aware briefing |
| `contact` | "Tell me about [person]" | [ ] Shows contact profile |
| `task` | "What tasks are due?" | [ ] Shows task list |
| `pipeline_focus_tasks` | "What deals need attention?" | [ ] Shows priority deals |
| `next_meeting_command_center` | "Prep for next meeting" | [ ] Shows full meeting prep |
| `post_meeting_followup_pack` | "Create follow-ups for [meeting]" | [ ] Shows email drafts |

---

## 5. Preview → Confirm Flow

### Test Scenario: Sequence Confirmation

**Steps:**
1. Ask "Create tasks for my priority deals"
2. Observe preview mode
3. Click "Confirm" or type "yes"

**Expected Results:**
- [ ] Preview shows with "Create task" button
- [ ] Task details visible before confirmation
- [ ] Clicking "Confirm" executes the action
- [ ] Success state shows after execution
- [ ] "View tasks" button appears post-confirmation

### Test Scenario: Cancel Preview

**Steps:**
1. Trigger a preview action
2. Click "Cancel" or type "no"

**Expected Results:**
- [ ] Action is cancelled
- [ ] No task/email/etc is created
- [ ] Copilot acknowledges cancellation

---

## 6. Loading States

### Test Scenario: Tool Execution Loading

**Steps:**
1. Submit any query
2. Observe loading indicators

**Expected Results:**
- [ ] Tool call indicator appears immediately
- [ ] Steps reveal with staggered animation
- [ ] Active step shows spinner
- [ ] Progress bar animates
- [ ] Estimated time remaining displays
- [ ] Shimmer effect on progress bar

### Test Scenario: Long-Running Query

**Steps:**
1. Submit a complex query (e.g., "Summarize all my meetings this month")
2. Wait for completion

**Expected Results:**
- [ ] Loading state persists without timeout errors
- [ ] Progress updates as steps complete
- [ ] Final response replaces loading state

---

## 7. Right Panel (CopilotRightPanel)

### Test Scenario: Panel Display

**Steps:**
1. Open Copilot in desktop view
2. Observe right panel sections

**Expected Results:**
- [ ] Progress section shows during execution
- [ ] Context section shows data sources
- [ ] Connected integrations show status

---

## 8. Mobile Responsiveness

### Test Scenario: Mobile View

**Steps:**
1. Resize browser to mobile width (<768px)
2. Open Copilot

**Expected Results:**
- [ ] Action cards stack vertically (1 column)
- [ ] Input area is full width
- [ ] Response cards are readable
- [ ] No horizontal scroll

---

## 9. Error Handling

### Test Scenario: Network Error

**Steps:**
1. Disable network (DevTools → Network → Offline)
2. Send a query

**Expected Results:**
- [ ] Error message displays
- [ ] UI doesn't crash
- [ ] User can retry after reconnecting

### Test Scenario: Invalid Query

**Steps:**
1. Send gibberish query
2. Observe response

**Expected Results:**
- [ ] Copilot responds gracefully
- [ ] No uncaught exceptions in console

---

## 10. Console Error Check

### Throughout All Testing:

- [ ] No `window.location` warnings in console
- [ ] No React key warnings
- [ ] No TypeScript type errors
- [ ] No unhandled promise rejections
- [ ] No 4xx/5xx API errors (except intentional test cases)

---

## Browser Compatibility

Test in each browser:

| Browser | Version | Pass |
|---------|---------|------|
| Chrome | Latest | [ ] |
| Firefox | Latest | [ ] |
| Safari | Latest | [ ] |
| Edge | Latest | [ ] |

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| QA Tester | | | |
| Dev Lead | | | |
| Product | | | |

---

## Notes / Issues Found

<!-- Document any bugs or issues discovered during testing -->

1. 
2. 
3. 

---

## Regression Items

If any of the above fail, create tickets with:
- Screenshot/recording
- Console errors (if any)
- Steps to reproduce
- Expected vs actual behavior
