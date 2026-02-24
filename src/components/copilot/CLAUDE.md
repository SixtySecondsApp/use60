# Copilot Components

## Overview

The Copilot UI implements a skill-first, deterministic workflow system with rich loading states and structured responses.

## Component Hierarchy

```
CopilotLayout (100vh container)
├── AssistantShell (main chat area)
│   ├── CopilotEmpty (welcome state)
│   ├── ChatMessage[] (message list)
│   │   └── ToolCallIndicator (loading state)
│   │   └── CopilotResponse (structured response router)
│   │       └── [48 Response Components]
│   └── ChatInput (always visible at bottom)
└── CopilotRightPanel (320px sidebar)
    ├── ProgressSection (tool execution stepper)
    ├── ActionItemsSection (pending approvals)
    ├── ContextSection (data sources)
    └── ConnectedSection (integration status)
```

## Key Files

| File | Purpose |
|------|---------|
| `CopilotLayout.tsx` | Main layout container with 100vh compliance |
| `AssistantShell.tsx` | Chat shell + central action handler |
| `ChatMessage.tsx` | Individual message renderer |
| `ToolCallIndicator.tsx` | Loading state visualization |
| `CopilotResponse.tsx` | Routes response type to component |
| `CopilotRightPanel.tsx` | Right sidebar with progress/context |
| `CopilotEmpty.tsx` | Welcome state with suggested actions |
| `ChatInput.tsx` | Input field with send button |
| `types.ts` | TypeScript interfaces (2296 lines) |
| `toolTypes.ts` | Tool type definitions |

## ToolCallIndicator State Machine

```
pending → initiating → fetching → processing → completing → complete
```

- **pending**: Waiting to start
- **initiating**: Request sent, no response yet
- **fetching**: Fetching data from sources
- **processing**: AI processing data
- **completing**: Finalizing response
- **complete**: Done, showing results

## Action Contract (CRITICAL)

All response components MUST emit actions via `onActionClick` prop. Never use direct `window.location` calls.

### Standard Actions

```typescript
// In-app navigation
'open_contact'      → navigate(`/crm/contacts/${contactId}`)
'open_deal'         → navigate(`/crm/deals/${dealId}`)
'open_meeting'      → navigate(`/meetings?meeting=${meetingId}`)
'open_task'         → navigate(`/tasks`)

// External links
'open_external_url' → window.open(url, '_blank')
```

### Legacy Aliases (Backwards Compatible)

```typescript
'open_meeting_url' → 'open_external_url'
'view_meeting'     → 'open_meeting'
'view_task'        → 'open_task'
```

### Handler Location

Central handler in `AssistantShell.tsx:handleActionClick()` (lines 36-191)

## Creating a New Response Component

1. Create file in `responses/` folder:

```tsx
// responses/MyNewResponse.tsx
import { CopilotResponse, QuickActionResponse } from '../types';

interface MyNewResponseData {
  // Define your data structure
}

interface Props {
  data: CopilotResponse & { data: MyNewResponseData };
  onActionClick?: (action: QuickActionResponse) => void;
}

export function MyNewResponse({ data, onActionClick }: Props) {
  const handleAction = (action: QuickActionResponse) => {
    onActionClick?.(action);
  };

  return (
    <div className="space-y-4">
      {/* Render your response */}
      <button onClick={() => handleAction({
        id: 'view',
        label: 'View',
        type: 'primary',
        callback: 'open_deal',
        params: { dealId: 'xxx' }
      })}>
        View Deal
      </button>
    </div>
  );
}
```

2. Add type to `types.ts`:

```typescript
export type CopilotResponseType =
  | 'activity'
  | 'pipeline'
  // ... existing types
  | 'my_new_type';  // Add here

export interface MyNewResponseData {
  // Your interface
}

// Add to ResponseData union
export type ResponseData = 
  | PipelineResponseData
  // ... existing types
  | MyNewResponseData;
```

3. Add to router in `CopilotResponse.tsx`:

```typescript
case 'my_new_type':
  return <MyNewResponse data={response} onActionClick={onActionClick} />;
```

4. Add backend detection in `api-copilot/index.ts` `detectAndStructureResponse()`

## Loading States

### Placeholder Steps (Client-Side)

```typescript
// CopilotContext.tsx - detectToolType() creates placeholders
const toolCall = createToolCall(detectToolType(message));
```

### Real Telemetry (Server-Side)

```typescript
// Backend returns tool_executions array
// createToolCallFromTelemetry() converts to ToolCall
```

## Common Patterns

### Reading Tool Call State

```tsx
const { toolCall } = message;
if (toolCall?.state === 'processing') {
  // Show loading indicator
}
```

### Emitting Actions

```tsx
// ALWAYS use onActionClick, never window.location
onActionClick?.({
  id: 'view-deal',
  label: 'View Deal',
  type: 'primary',
  callback: 'open_deal',
  params: { dealId: deal.id }
});
```

### Handling Structured Responses

```tsx
// ChatMessage.tsx checks for structuredResponse
if (message.structuredResponse) {
  return <CopilotResponse response={message.structuredResponse} />;
}
```

## Testing Checklist

- [ ] Component renders with all required props
- [ ] All clickable items emit actions via `onActionClick`
- [ ] No direct `window.location` calls
- [ ] Loading states handled gracefully
- [ ] Empty states handled gracefully
- [ ] TypeScript strict compliance


<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

*No recent activity*
</claude-mem-context>