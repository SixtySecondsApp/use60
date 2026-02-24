# Agent Activity Feed Components

This directory contains the Agent Activity Feed UI system (CONF-011), which displays a chronological feed of proactive agent activities.

## Components

### AgentActivityFeed.tsx
Main feed panel component that displays the activity list.

**Features:**
- Paginated activity list with infinite scroll
- Read/unread tracking with visual indicators
- Expandable activity items
- "Mark all as read" functionality
- Color-coded sequence type badges
- Empty states and loading states
- Responsive design (full-screen on mobile, panel on desktop)

**Props:**
- `onClose?: () => void` - Callback when panel is closed

**Sequence Type Icons:**
- `meeting_ended` → Video (blue)
- `pre_meeting_90min` → Clock (purple)
- `deal_risk_scan` → AlertTriangle (amber)
- `stale_deal_revival` → RefreshCw (emerald)
- `coaching_weekly` → GraduationCap (indigo)
- `campaign_daily_check` → Mail (rose)
- `email_received` → Inbox (cyan)
- `proposal_generation` → FileText (violet)
- `calendar_find_times` → Calendar (teal)

### AgentActivityBell.tsx (in /src/components/)
Trigger button that opens the activity feed panel.

**Features:**
- Displays unread count badge
- Purple badge color (distinct from red notification bell)
- Pulse animation for new activity
- Positioned as portal (appears above page content)
- Mobile-responsive (full-screen overlay on mobile)
- Keyboard support (Escape to close)
- Click-outside-to-close behavior

## Hooks

### useAgentActivity.ts (in /src/hooks/)
React Query hooks for agent activity data management.

**Exports:**
- `useAgentActivityFeed(options)` - Paginated feed with infinite query
- `useAgentActivityUnreadCount(orgId)` - Real-time unread count (30s refresh)
- `useMarkAgentActivityRead()` - Mutation to mark activities as read
- `useMarkAllAgentActivityRead()` - Mutation to mark all as read for org

**Options:**
```typescript
{
  orgId: string | null;
  limit?: number;      // Default: 20
  enabled?: boolean;   // Default: true
}
```

## Database Integration

Uses the following RPCs from `supabase/migrations/20260216000006_add_agent_activity.sql`:
- `get_agent_activity_feed(p_user_id, p_org_id, p_limit, p_offset)` - Paginated feed
- `get_agent_activity_unread_count(p_user_id, p_org_id)` - Unread count
- `mark_agent_activity_read(p_user_id, p_activity_ids)` - Mark as read

## Integration

The AgentActivityBell is integrated into AppLayout.tsx, positioned in the top bar next to the NotificationBell:

```tsx
<EmailIcon />
<CalendarIcon />
<HITLIndicator />
<AgentActivityBell />      // ← Agent activity feed
<NotificationBell />        // ← System notifications
```

## Usage

```tsx
import { AgentActivityBell } from '@/components/AgentActivityBell';

function MyTopBar() {
  return (
    <div className="flex items-center gap-2">
      <AgentActivityBell />
    </div>
  );
}
```

## Styling

- Uses Tailwind CSS for styling
- Follows existing design system (same patterns as NotificationCenter)
- Dark mode support via `dark:` classes
- Framer Motion for animations
- Lucide React icons

## Dependencies

- `@tanstack/react-query` - Data fetching and caching
- `date-fns` - Date formatting (formatDistanceToNow)
- `framer-motion` - Animations
- `lucide-react` - Icons
- `sonner` - Toast notifications
- `react-dom` - Portal rendering

## Future Enhancements

- Real-time updates via Supabase Realtime subscriptions
- Filtering by sequence type
- Search functionality
- Export activity log
- Desktop notifications for new activity
- Activity detail modal with full context
