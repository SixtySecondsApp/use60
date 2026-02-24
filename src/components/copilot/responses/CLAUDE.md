# Copilot Response Components

## Overview

This folder contains 48 specialized response components for rendering structured Copilot responses. Each component handles a specific response type with appropriate data visualization and actions.

## Response Types (48 Total)

### Core Entity Types
| Type | Component | Description |
|------|-----------|-------------|
| `activity` | `ActivityResponse` | Activity feed with created/upcoming/overdue items |
| `pipeline` | `PipelineResponse` | Pipeline deals with health metrics |
| `meeting` / `calendar` | `CalendarResponse` | Meetings and availability |
| `email` | `EmailResponse` | Email draft with tone controls |
| `lead` | `LeadResponse` | Lead list with scoring |
| `task` | `TaskResponse` | Tasks with priority indicators |
| `contact` | `ContactResponse` | Contact profile with history |

### Analytics & Insights
| Type | Component | Description |
|------|-----------|-------------|
| `sales_coach` | `SalesCoachResponse` | Performance comparison MoM |
| `goal_tracking` | `GoalTrackingResponse` | Goal progress tracking |
| `trend_analysis` | `TrendAnalysisResponse` | Metric trend charts |
| `forecast` | `ForecastResponse` | Revenue forecast scenarios |
| `team_comparison` | `TeamComparisonResponse` | User vs team metrics |
| `metric_focus` | `MetricFocusResponse` | Single metric deep dive |
| `insights` | `InsightsResponse` | Priority insights and quick wins |
| `stage_analysis` | `StageAnalysisResponse` | Stage conversion analysis |
| `activity_breakdown` | `ActivityBreakdownResponse` | Activity by type |
| `deal_health` | `DealHealthResponse` | At-risk and stale deals |
| `pipeline_forecast` | `PipelineForecastResponse` | Weighted pipeline forecast |

### Relationship & Communication
| Type | Component | Description |
|------|-----------|-------------|
| `contact_relationship` | `ContactRelationshipResponse` | Relationship strength |
| `communication_history` | `CommunicationHistoryResponse` | Timeline of communications |
| `company_intelligence` | `CompanyIntelligenceResponse` | Company profile with contacts |

### Meeting-Specific
| Type | Component | Description |
|------|-----------|-------------|
| `meeting_prep` | `MeetingPrepResponse` | Meeting preparation brief |
| `meeting_count` | `MeetingCountResponse` | Meeting count with breakdown |
| `meeting_briefing` | `MeetingBriefingResponse` | Next meeting with full context |
| `meeting_list` | `MeetingListResponse` | Today/tomorrow meetings list |
| `time_breakdown` | `TimeBreakdownResponse` | Time in meetings analysis |

### Workflow Sequences (Demo-Grade Panels)
| Type | Component | Description |
|------|-----------|-------------|
| `pipeline_focus_tasks` | `PipelineFocusTasksResponse` | Priority deals with tasks |
| `deal_rescue_pack` | `DealRescuePackResponse` | At-risk deal rescue plan |
| `next_meeting_command_center` | `NextMeetingCommandCenterResponse` | Full meeting prep |
| `post_meeting_followup_pack` | `PostMeetingFollowUpPackResponse` | Follow-up drafts |
| `deal_map_builder` | `DealMapBuilderResponse` | Mutual action plan |
| `daily_focus_plan` | `DailyFocusPlanResponse` | Today's priorities |
| `followup_zero_inbox` | `FollowupZeroInboxResponse` | Email triage + replies |
| `deal_slippage_guardrails` | `DealSlippageGuardrailsResponse` | Slipping deals alerts |
| `daily_brief` | `DailyBriefResponse` | Catch me up briefing |

### Creation & Selection Flows
| Type | Component | Description |
|------|-----------|-------------|
| `contact_selection` | `ContactSelectionResponse` | Disambiguation UI |
| `activity_creation` | `ActivityCreationResponse` | Activity logging form |
| `task_creation` | `TaskCreationResponse` | Task creation form |
| `proposal_selection` | `ProposalSelectionResponse` | Proposal linking |
| `action_summary` | `ActionSummaryResponse` | Write operation results |

### Other
| Type | Component | Description |
|------|-----------|-------------|
| `roadmap` | `RoadmapResponse` | Roadmap item created |
| `data_quality` | `DataQualityResponse` | CRM data issues |
| `activity_planning` | `ActivityPlanningResponse` | Daily activity plan |
| `workflow_process` | `WorkflowProcessResponse` | Workflow status |
| `search_discovery` | `SearchDiscoveryResponse` | Search results |

## Data Interface Pattern

Every response type has a corresponding data interface in `../types.ts`:

```typescript
// Example: DailyBriefResponseData
export interface DailyBriefResponseData {
  sequenceKey: string;
  isSimulation: boolean;
  executionId?: string;
  greeting: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  schedule: DailyBriefMeeting[];
  priorityDeals: DailyBriefDeal[];
  contactsNeedingAttention: DailyBriefContact[];
  tasks: DailyBriefTask[];
  tomorrowPreview?: DailyBriefMeeting[];
  summary: string;
}
```

## Required Props Pattern

All response components MUST implement this interface:

```typescript
interface ResponseComponentProps {
  data: CopilotResponse & { data: SpecificResponseData };
  onActionClick?: (action: QuickActionResponse) => void;
}
```

## Action Contract (CRITICAL)

### ALWAYS use `onActionClick`

```tsx
// CORRECT - Uses action contract
<button onClick={() => onActionClick?.({
  id: 'view-deal',
  label: 'View',
  type: 'primary',
  callback: 'open_deal',
  params: { dealId: deal.id }
})}>
  View Deal
</button>
```

### NEVER use direct navigation

```tsx
// WRONG - Bypasses action contract
<button onClick={() => window.location.href = `/deals/${deal.id}`}>
  View Deal
</button>

// WRONG - Bypasses action contract
<button onClick={() => navigate(`/deals/${deal.id}`)}>
  View Deal
</button>
```

### Standard Action Vocabulary

| Action | Purpose | Params |
|--------|---------|--------|
| `open_contact` | Navigate to contact page | `{ contactId }` |
| `open_deal` | Navigate to deal page | `{ dealId }` |
| `open_meeting` | Navigate to meeting page | `{ meetingId }` |
| `open_task` | Navigate to tasks page | `{}` |
| `open_external_url` | Open URL in new tab | `{ url }` |

## Sequence Response Pattern

Workflow sequence responses include:

```typescript
{
  sequenceKey: string;      // e.g., 'seq-catch-me-up'
  isSimulation: boolean;    // true = preview mode
  executionId?: string;     // for tracking
  // ... sequence-specific data
}
```

Preview mode (`isSimulation: true`) shows actions without executing them. User can confirm to execute.

## Creating a New Response Component

### 1. Create the component file

```tsx
// NewTypeResponse.tsx
import { CopilotResponse, QuickActionResponse, NewTypeResponseData } from '../types';

interface Props {
  data: CopilotResponse & { data: NewTypeResponseData };
  onActionClick?: (action: QuickActionResponse) => void;
}

export function NewTypeResponse({ data, onActionClick }: Props) {
  const responseData = data.data;

  const handleAction = (callback: string, params?: Record<string, any>) => {
    onActionClick?.({
      id: `action-${Date.now()}`,
      label: 'Action',
      type: 'primary',
      callback,
      params
    });
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-card">
      {/* Summary always at top */}
      {data.summary && (
        <p className="text-sm text-muted-foreground">{data.summary}</p>
      )}
      
      {/* Main content */}
      <div>
        {/* Render responseData */}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {data.actions?.map((action) => (
          <button
            key={action.id}
            onClick={() => onActionClick?.(action)}
            className={cn(
              'px-3 py-1.5 rounded text-sm',
              action.type === 'primary' && 'bg-primary text-primary-foreground',
              action.type === 'secondary' && 'bg-secondary text-secondary-foreground'
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 2. Add type definitions to `../types.ts`

```typescript
// Add to CopilotResponseType union
export type CopilotResponseType =
  // ... existing types
  | 'new_type';

// Define the data interface
export interface NewTypeResponseData {
  // Your fields here
}

// Add to ResponseData union
export type ResponseData = 
  // ... existing types
  | NewTypeResponseData;
```

### 3. Add to router in `../CopilotResponse.tsx`

```typescript
case 'new_type':
  return <NewTypeResponse data={response} onActionClick={onActionClick} />;
```

### 4. Add backend detection

In `supabase/functions/api-copilot/index.ts`, add to `detectAndStructureResponse()`.

## Testing Checklist

For each response component:

- [ ] Renders with all required data fields
- [ ] Handles missing/null optional fields gracefully
- [ ] All clickable elements use `onActionClick`
- [ ] No direct `window.location` or `navigate()` calls
- [ ] Empty state handled (no data)
- [ ] Loading state handled (if applicable)
- [ ] Actions array rendered correctly
- [ ] TypeScript strict compliance
- [ ] Matches existing design patterns

## Common Issues

### "onActionClick is not defined"

Make sure to destructure from props:

```tsx
export function MyResponse({ data, onActionClick }: Props) {
  // onActionClick is now available
}
```

### Action not triggering navigation

Check that `AssistantShell.tsx` handles your action type. Add new cases if needed.

### Type errors on data fields

Ensure your data interface matches what the backend sends. Check `detectAndStructureResponse()` in api-copilot.


<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

*No recent activity*
</claude-mem-context>