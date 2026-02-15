# CONF-011: Agent Activity Feed UI - Manual Testing Guide

## Prerequisites

1. **Database Setup**:
   - Migration `20260216000006_add_agent_activity.sql` must be applied
   - Table `agent_activity` exists with proper RLS policies
   - RPCs are available: `get_agent_activity_feed`, `get_agent_activity_unread_count`, `mark_agent_activity_read`

2. **Test Data**:
   To test the UI, you'll need some sample activity data. You can insert test data using:

   ```sql
   -- Insert test activity for current user
   SELECT insert_agent_activity(
     p_user_id := auth.uid(),
     p_org_id := 'your-org-id',
     p_sequence_type := 'meeting_ended',
     p_title := 'Meeting Debrief: Call with Acme Corp',
     p_summary := 'Recorded key action items and next steps from today''s sales call.',
     p_metadata := '{"deal_name": "Acme Enterprise Deal", "meeting_duration": "45 min"}'::jsonb,
     p_job_id := NULL
   );

   -- Insert another test activity (unread)
   SELECT insert_agent_activity(
     p_user_id := auth.uid(),
     p_org_id := 'your-org-id',
     p_sequence_type := 'deal_risk_scan',
     p_title := 'Deal Risk Alert: Enterprise Deal',
     p_summary := 'Risk score increased to 78% due to lack of recent activity. Recommended follow-up actions generated.',
     p_metadata := '{"deal_name": "Enterprise Deal", "risk_score": 78, "days_stale": 14}'::jsonb
   );
   ```

## Test Cases

### 1. Bell Icon Visibility

**Steps:**
1. Log in to the app
2. Navigate to any page

**Expected:**
- Graduation cap icon appears in top bar (between HITL indicator and notification bell)
- Icon is purple/indigo themed (distinct from red notification bell)

### 2. Unread Count Badge

**Steps:**
1. Insert 3 unread activities in database (see Prerequisites)
2. Refresh the page

**Expected:**
- Purple badge appears on the bell icon with count "3"
- Badge has pulse animation
- Badge is positioned at top-right of icon

### 3. Open Activity Feed Panel

**Steps:**
1. Click the graduation cap icon

**Expected:**
- Panel slides in from right (desktop) or appears full-screen (mobile)
- Panel shows "Agent Activity" header
- Unread count displayed in header ("3 unread")
- "Mark all as read" button visible in header

### 4. Activity List Display

**Steps:**
1. With panel open, review the activity list

**Expected:**
- Activities displayed in chronological order (most recent first)
- Each activity shows:
  - Color-coded icon based on sequence type
  - Title (bold if unread, normal if read)
  - Summary (truncated to 2 lines)
  - Sequence type badge (e.g., "Meeting Ended", "Deal Risk Scan")
  - Time ago (e.g., "2 hours ago")
  - Blue dot on right if unread
- Unread items have light blue background

### 5. Sequence Type Icons and Colors

**Steps:**
1. Create activities with different sequence types
2. Verify icon mapping

**Expected:**
| Sequence Type | Icon | Color |
|---------------|------|-------|
| meeting_ended | Video | Blue |
| pre_meeting_90min | Clock | Purple |
| deal_risk_scan | AlertTriangle | Amber |
| stale_deal_revival | RefreshCw | Emerald |
| coaching_weekly | GraduationCap | Indigo |
| campaign_daily_check | Mail | Rose |
| email_received | Inbox | Cyan |
| proposal_generation | FileText | Violet |
| calendar_find_times | Calendar | Teal |

### 6. Mark Single Activity as Read

**Steps:**
1. Click an unread activity item

**Expected:**
- Item background changes from light blue to white/gray
- Blue dot disappears
- Summary expands (if previously truncated)
- Unread count in header decrements by 1
- Badge on bell icon updates

### 7. Expand/Collapse Activity

**Steps:**
1. Click an activity item (already read)
2. Click it again

**Expected:**
- First click: Summary expands to show full text, chevron rotates 180°
- Second click: Summary collapses back to 2 lines, chevron rotates back

### 8. Mark All as Read

**Steps:**
1. Ensure there are multiple unread activities
2. Click "Mark all as read" button in header

**Expected:**
- Toast notification: "Marked all as read - X items marked as read"
- All blue dots disappear
- Unread count in header becomes "0 unread"
- Badge on bell icon disappears
- All item backgrounds change to normal

### 9. Pagination (Load More)

**Steps:**
1. Insert 25+ activities
2. Open activity feed

**Expected:**
- First 20 activities displayed
- "Load More" button appears at bottom
- Click "Load More"
- Next 5+ activities load and append to list
- Loading spinner appears briefly

### 10. Empty State

**Steps:**
1. Delete all activities for current user
2. Open activity feed

**Expected:**
- Bell icon (empty state)
- Panel shows centered message:
  - Bell-off icon (gray)
  - "No agent activity yet"
  - "Your AI teammate's actions will appear here"

### 11. Mobile Responsiveness

**Steps:**
1. Resize browser to mobile width (< 640px)
2. Click bell icon

**Expected:**
- Panel appears full-screen
- Background overlay (semi-transparent black)
- Panel fills entire viewport
- Close button works
- Tap outside overlay closes panel

### 12. Desktop Responsiveness

**Steps:**
1. Resize browser to desktop width (> 640px)
2. Click bell icon

**Expected:**
- Panel appears as floating card (480px wide, max-height 700px)
- Positioned below bell icon
- Rounded corners, shadow
- Panel doesn't overflow screen on right edge

### 13. Close Behaviors

**Steps:**
1. Open panel
2. Test each close method:
   - Click X button in header
   - Click outside panel (desktop only)
   - Press Escape key

**Expected:**
- All three methods close the panel smoothly
- Panel slides out with animation

### 14. Dark Mode

**Steps:**
1. Toggle dark mode in app settings
2. Open activity feed

**Expected:**
- Panel background is dark gray (not black)
- Text is light colored
- Icons are visible
- Borders/dividers are subtle
- Unread background is subtle blue (not bright)
- All colors maintain good contrast

### 15. Real-time Updates (Future)

**Note:** This test requires Wave 2 (orchestrator integration) to be complete.

**Steps:**
1. Have panel open
2. Trigger an orchestrator event (e.g., end a meeting)

**Expected:**
- New activity appears at top of list
- Unread count increments
- Badge appears/updates on bell icon
- (Future: Toast notification for new activity)

### 16. Error States

**Steps:**
1. Disconnect network
2. Click bell icon

**Expected:**
- Panel opens
- Error message displayed: "Failed to load activity feed"
- Alert icon shown
- Helpful error message

### 17. Loading States

**Steps:**
1. Open panel with slow network (throttle in DevTools)

**Expected:**
- Loading spinner appears centered
- "Loading..." or spinner animation visible
- No layout shift when data loads

## Performance Checks

1. **Initial Load**: Panel should open in < 200ms
2. **Pagination**: "Load More" should fetch in < 500ms
3. **Mark as Read**: Should feel instant (optimistic update)
4. **No Memory Leaks**: Open/close panel 10+ times, check memory in DevTools

## Accessibility Checks

1. **Keyboard Navigation**:
   - Tab to bell icon
   - Press Enter to open
   - Press Escape to close

2. **Screen Reader**:
   - Bell has aria-label "Agent Activity"
   - Panel has proper ARIA roles
   - Unread count announced

3. **Focus Management**:
   - Focus trapped in panel when open
   - Focus returns to bell when closed

## Browser Compatibility

Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

## Integration Checks

1. **With Orchestrator**: Verify activities appear when orchestrator runs (Wave 2)
2. **With Notifications**: Both systems work independently
3. **With Multi-org**: Activity scoped to active org
4. **With Permissions**: External users don't see bell (if applicable)

## Known Limitations

1. No real-time updates yet (polling every 30s for unread count only)
2. No filtering by sequence type (all activities shown)
3. No search functionality
4. No activity detail modal
5. No export functionality

## Bug Reporting Template

If you find issues, report with:
```
**Bug Title**: [Clear description]

**Steps to Reproduce**:
1.
2.
3.

**Expected**:
**Actual**:

**Environment**:
- Browser:
- Device:
- Org ID:
- User ID:

**Screenshots**: [Attach if possible]
```
