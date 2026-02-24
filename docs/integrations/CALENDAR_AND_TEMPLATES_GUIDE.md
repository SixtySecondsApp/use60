# Calendar & Sales Templates - Comprehensive Guide

## Table of Contents

1. [Overview](#overview)
2. [Calendar Features](#calendar-features)
3. [Event Export/Import](#event-exportimport)
4. [Bulk Operations](#bulk-operations)
5. [Sales Templates System](#sales-templates-system)
6. [Integration & Workflows](#integration--workflows)
7. [API Reference](#api-reference)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Sixty Sales Dashboard Calendar and Sales Templates system provides a comprehensive solution for managing sales activities, calendar events, and automated email communications. This guide covers all features, workflows, and best practices.

### Key Features

✅ **Full Calendar Management**: View, create, edit, and delete calendar events
✅ **Google Calendar Integration**: Two-way sync with Google Calendar
✅ **Export/Import**: RFC 5545 compliant .ics file support
✅ **Bulk Operations**: Multi-select for batch delete, reschedule, and categorize
✅ **AI-Powered Sales Templates**: Context-aware email personalization
✅ **LinkedIn Enrichment**: Automatic profile enrichment for contacts
✅ **Smart Context Extraction**: AI-driven pain point and value proposition analysis

---

## Calendar Features

### Viewing Calendar Events

The calendar supports multiple view modes:

- **Month View**: Overview of the entire month
- **Week View**: Detailed weekly schedule with time slots
- **Day View**: Hourly breakdown of a single day
- **Agenda View**: List view of upcoming events

**Switching Views:**
```typescript
// Use the view selector buttons in the header
<CalendarView view={currentView} />
```

### Creating Events

**Method 1: Quick Add**
1. Use the Quick Add input in the calendar header
2. Type event name and press Enter
3. Event is created instantly

**Method 2: Date Click**
1. Click on any date in the calendar
2. Event editor modal opens
3. Fill in details and click Save

**Method 3: New Event Button**
1. Click "New Event" in the header
2. Complete the event form
3. Submit to create

### Event Categories

Events are automatically categorized:

| Category | Description | Color |
|----------|-------------|-------|
| `meeting` | In-person or virtual meetings | Emerald |
| `call` | Phone calls with prospects/clients | Blue |
| `task` | To-do items and action items | Amber |
| `deal` | Deal-related activities | Violet |
| `personal` | Personal appointments | Pink |
| `follow-up` | Follow-up activities | Cyan |

### Event Properties

```typescript
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  description?: string;
  category: 'meeting' | 'call' | 'task' | 'deal' | 'personal' | 'follow-up';
  color?: string;
  attendees?: string[];
  location?: string;
  priority?: 'low' | 'medium' | 'high';
  recurring?: boolean;
  recurringPattern?: string; // RRULE format
  dealId?: string;
  contactId?: string;
  companyId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Google Calendar Sync

**Initial Setup:**
1. Navigate to Settings → Integrations
2. Click "Connect Google Calendar"
3. Authorize the application
4. Calendar sync begins automatically

**Manual Sync:**
- Click "Sync Calendar" button
- Select time period:
  - Last Week (test)
  - This Month
  - Last Month
  - Last 3 Months
  - This Year
  - All Events (2024-2025)

**Sync Behavior:**
- Events are stored locally in PostgreSQL
- Real-time updates via Supabase subscriptions
- Hourly background sync for current month
- Composite unique constraint on `(external_id, user_id)` prevents duplicates

---

## Event Export/Import

### Exporting Events

**Export All Events:**
```typescript
// Click Export/Import → Export tab → Export All
// Downloads: sixty-sales-calendar-YYYY-MM-DD.ics
```

**Export Selected Events:**
1. Click "Select" to enter selection mode
2. Check events to export
3. Click Export/Import → Export Selected
4. File downloads with only selected events

**Export Features:**
- RFC 5545 compliant .ics format
- Compatible with Google Calendar, Apple Calendar, Outlook
- Preserves all event metadata
- Custom X-SIXTY-* fields for app-specific data

### Importing Events

**Import Workflow:**
1. Click Export/Import → Import tab
2. Click "Choose File" and select .ics file
3. Review preview:
   - Event count statistics
   - First 10 events shown
   - Category breakdown
4. Click "Import {n} Events"
5. Events are created in Google Calendar (if connected)

**Supported Import Sources:**
- Google Calendar exports
- Apple Calendar exports
- Outlook calendar exports
- Any RFC 5545 compliant .ics file

**Import Features:**
- File validation (.ics only)
- Preview before import
- Statistics: total, meetings, calls, tasks
- Smart category inference from content
- Error handling for malformed files

### iCal Format Details

**Generated iCal Structure:**
```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Sixty Sales//Calendar//EN
X-WR-CALNAME:Sixty Sales Calendar
X-WR-TIMEZONE:UTC
CALSCALE:GREGORIAN
METHOD:PUBLISH

BEGIN:VEVENT
UID:event-id@sixtysales.com
DTSTAMP:20250122T120000Z
DTSTART:20250125T140000Z
DTEND:20250125T150000Z
SUMMARY:Client Meeting
DESCRIPTION:Quarterly review meeting
LOCATION:Conference Room A
CATEGORIES:MEETING
PRIORITY:1
ATTENDEE;CN=john@example.com:mailto:john@example.com
STATUS:CONFIRMED
X-SIXTY-CATEGORY:meeting
X-SIXTY-DEAL-ID:deal-123
X-SIXTY-CONTACT-ID:contact-456
END:VEVENT

END:VCALENDAR
```

**Custom Fields:**
- `X-SIXTY-CATEGORY`: App-specific category
- `X-SIXTY-DEAL-ID`: Associated deal ID
- `X-SIXTY-CONTACT-ID`: Associated contact ID
- `X-SIXTY-COMPANY-ID`: Associated company ID

---

## Bulk Operations

### Entering Selection Mode

Click "Select" button in the calendar header to switch from calendar view to selection mode.

**Selection Mode Features:**
- Checkbox list of all events
- Grouped by date
- Select all / Clear selection
- Floating bulk actions toolbar

### Selecting Events

**Individual Selection:**
- Click checkbox next to any event
- Click event row to toggle selection

**Select All:**
- Click "Select all" checkbox in header
- All filtered events are selected

**Clear Selection:**
- Click "Clear selection"
- Exit selection mode to clear automatically

### Bulk Actions

#### Bulk Delete

1. Select events to delete
2. Click "Delete" in toolbar
3. Confirm deletion in dialog
4. Events are permanently deleted

**Warning:** This action cannot be undone!

#### Bulk Reschedule

1. Select events to reschedule
2. Click "Reschedule" in toolbar
3. Choose offset:
   - 1-3 days forward/backward
   - 1-2 weeks forward/backward
4. Click "Reschedule Events"
5. All events shift by the offset

**Use Cases:**
- Shift entire week due to vacation
- Move all meetings to next quarter
- Adjust for schedule changes

#### Bulk Categorize

1. Select events to categorize
2. Click "Categorize" in toolbar
3. Choose new category:
   - Meeting
   - Phone Call
   - Task
   - Deal Activity
   - Personal
   - Follow-up
4. Click "Categorize Events"

**Note:** Category changes are stored locally and sync to app metadata.

### Bulk Actions Toolbar

The floating toolbar appears when events are selected:

```typescript
<BulkActionsToolbar
  selectedCount={selectedEventIds.size}
  onClearSelection={handleClearSelection}
  onBulkDelete={handleBulkDelete}
  onBulkReschedule={handleBulkReschedule}
  onBulkCategorize={handleBulkCategorize}
/>
```

**Toolbar Position:** Fixed at `top: 80px`, centered horizontally

---

## Sales Templates System

### Overview

The Sales Templates system provides AI-powered email personalization with LinkedIn enrichment and smart context extraction.

### Database Schema

```sql
CREATE TABLE sales_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'meeting_followup',
    'initial_outreach',
    'nurture_sequence',
    'deal_progression',
    'reengagement',
    'thank_you',
    'custom'
  )),

  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,

  variables JSONB DEFAULT '[]'::jsonb,
  tone TEXT DEFAULT 'professional',
  is_active BOOLEAN DEFAULT true,

  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  average_response_rate DECIMAL(5,2),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE sales_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON sales_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own templates"
  ON sales_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON sales_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON sales_templates FOR DELETE
  USING (auth.uid() = user_id);
```

### Template Variables

Templates support dynamic variable replacement:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{contact_name}}` | Contact's full name | John Smith |
| `{{contact_first_name}}` | First name only | John |
| `{{contact_company}}` | Company name | Acme Corp |
| `{{contact_title}}` | Job title | VP of Sales |
| `{{meeting_date}}` | Meeting date | January 25, 2025 |
| `{{meeting_time}}` | Meeting time | 2:00 PM |
| `{{deal_name}}` | Deal/opportunity name | Q1 Enterprise Deal |
| `{{deal_value}}` | Deal value | $50,000 |
| `{{user_name}}` | Your name | Andrew Bryce |
| `{{user_title}}` | Your title | Account Executive |
| `{{user_company}}` | Your company | Sixty Sales |

### Creating Templates

**Via SalesTemplateManager:**
```typescript
<SalesTemplateManager
  userId={userId}
  orgId={orgId}
/>
```

**Template Form Fields:**
- Name: Template identifier
- Description: Purpose and use case
- Category: Template type (see categories above)
- Subject Template: Email subject with variables
- Body Template: Email body with variables
- Tone: professional | friendly | casual | formal
- Variables: List of available variables
- Active Status: Enable/disable template

**Example Template:**
```typescript
{
  name: "Post-Meeting Follow-up",
  description: "Send after initial discovery meeting",
  category: "meeting_followup",
  subject_template: "Great connecting today, {{contact_first_name}}!",
  body_template: `Hi {{contact_first_name}},

It was wonderful meeting with you today to discuss {{deal_name}}.

I particularly appreciated your insights on {{pain_point_1}}. Based on our conversation, I believe {{value_proposition}} could be a great fit for {{contact_company}}.

Next steps:
1. {{next_action_1}}
2. {{next_action_2}}

Looking forward to continuing our conversation!

Best regards,
{{user_name}}
{{user_title}}
{{user_company}}`,
  tone: "professional",
  variables: [
    "contact_name", "contact_first_name", "contact_company",
    "deal_name", "pain_point_1", "value_proposition",
    "next_action_1", "next_action_2",
    "user_name", "user_title", "user_company"
  ]
}
```

### AI Personalization

#### Template Context Building

When selecting a template, the system builds comprehensive context:

```typescript
interface TemplateContext {
  contact?: {
    id: string;
    full_name: string;
    email: string;
    company_name?: string;
    title?: string;
    linkedin_url?: string;
  };
  calendar_event?: {
    id: string;
    title: string;
    start: Date;
    end?: Date;
    description?: string;
  };
  deal?: {
    id: string;
    name: string;
    value?: number;
    stage?: string;
  };
  user_profile?: {
    full_name: string;
    title?: string;
    company_name?: string;
  };
  linkedin_profile?: {
    headline: string;
    summary: string;
    experience: Array<{
      title: string;
      company: string;
      description: string;
    }>;
  };
  smart_context?: {
    pain_points: string[];
    value_propositions: string[];
    ice_breakers: string[];
    recent_activities: string[];
  };
}
```

#### LinkedIn Enrichment

The system automatically enriches contact data with LinkedIn information:

```typescript
// Automatic enrichment when LinkedIn URL is available
const enrichedProfile = await LinkedInEnrichmentService.enrichContact(contactId);

// Profile data structure:
{
  headline: "VP of Sales at Tech Corp",
  summary: "15+ years experience in enterprise software sales...",
  experience: [
    {
      title: "VP of Sales",
      company: "Tech Corp",
      duration: "2020 - Present",
      description: "Leading 50+ person sales organization..."
    }
  ],
  education: [...],
  skills: ["SaaS", "Enterprise Sales", "Team Leadership"],
  certifications: [...]
}
```

#### Smart Context Extraction

AI analyzes all available data to extract:

**Pain Points:**
- Identified from meeting notes
- Extracted from LinkedIn profile
- Inferred from industry/role

**Value Propositions:**
- Matched to pain points
- Customized for company size/industry
- Aligned with deal stage

**Ice Breakers:**
- Recent LinkedIn posts
- Shared connections
- Common interests/background
- Recent company news

**Example Smart Context:**
```json
{
  "pain_points": [
    "Manual sales processes slowing down team",
    "Lack of visibility into pipeline health",
    "Difficulty coordinating across distributed team"
  ],
  "value_propositions": [
    "Automated workflow reduces admin time by 60%",
    "Real-time pipeline analytics and forecasting",
    "Unified platform for remote team collaboration"
  ],
  "ice_breakers": [
    "Noticed your recent post about sales enablement",
    "We both worked at Salesforce (different times)",
    "Congratulations on Tech Corp's Series B announcement"
  ]
}
```

#### AI Personalization Process

1. **Context Gathering**: Fetch all relevant data (contact, meeting, deal, LinkedIn)
2. **Smart Analysis**: Extract pain points, value props, ice breakers
3. **Template Selection**: User chooses appropriate template
4. **Variable Replacement**: Replace all `{{variables}}` with actual data
5. **AI Enhancement**: Use Gemini to:
   - Personalize greeting based on relationship
   - Incorporate ice breakers naturally
   - Align value props with pain points
   - Adjust tone based on context
   - Add relevant details from research
6. **Quality Check**: Verify email quality and completeness
7. **Return Result**: Subject + body ready to send

**Personalization API:**
```typescript
const personalizedEmail = await SalesTemplateService.personalizeTemplate(
  template,
  context,
  {
    enhanceWithAI: true,
    includeIceBreakers: true,
    maxLength: 500
  }
);

// Result:
{
  subject: "Following up on our AI automation discussion, John",
  body: `Hi John,

Thanks for taking the time to meet yesterday! I really enjoyed learning about how Tech Corp is scaling your sales organization.

Your point about manual CRM data entry eating up 2-3 hours per rep per day really resonated with me. I've seen this challenge across many high-growth SaaS companies, and I think there's a clear path to getting that time back.

Based on what you shared, here are three ways Sixty Sales could help:

1. Automated activity logging reduces data entry by 60%
2. Real-time pipeline visibility helps you forecast with confidence
3. Team collaboration features designed for distributed organizations

I'd love to show you a quick demo focused specifically on your team's workflow. Are you available next Tuesday or Wednesday afternoon?

Best,
Andrew Bryce
Account Executive
Sixty Sales`,
  confidence: 0.92,
  variables_used: [
    "contact_first_name",
    "contact_company",
    "pain_point_1",
    "value_proposition_1",
    "user_name"
  ]
}
```

### Template Management

**Listing Templates:**
```typescript
const templates = await SalesTemplateService.listTemplates(userId, orgId);
```

**Creating Template:**
```typescript
const newTemplate = await SalesTemplateService.createTemplate({
  userId,
  orgId,
  name: "Template Name",
  category: "meeting_followup",
  subjectTemplate: "Subject with {{variable}}",
  bodyTemplate: "Body content...",
  tone: "professional"
});
```

**Updating Template:**
```typescript
await SalesTemplateService.updateTemplate(templateId, {
  name: "Updated Name",
  is_active: true
});
```

**Deleting Template:**
```typescript
await SalesTemplateService.deleteTemplate(templateId);
```

**Tracking Usage:**
```typescript
await SalesTemplateService.trackUsage(templateId, {
  responseReceived: true,
  responseTime: 3600, // seconds
  converted: false
});
```

### Template Categories

| Category | Use Case | Timing |
|----------|----------|--------|
| `meeting_followup` | After discovery/demo meetings | Within 24 hours of meeting |
| `initial_outreach` | First contact with prospect | Cold outreach campaigns |
| `nurture_sequence` | Ongoing relationship building | Every 2-4 weeks |
| `deal_progression` | Moving deal forward | After key milestones |
| `reengagement` | Reconnecting with cold leads | 3-6 months inactive |
| `thank_you` | Expressing gratitude | After positive outcome |
| `custom` | Other use cases | As needed |

---

## Integration & Workflows

### Calendar + Sales Templates Integration

#### Workflow 1: Post-Meeting Follow-up

1. **Meeting Occurs** → Calendar event is created/synced
2. **Open Event** → Click on meeting in calendar
3. **Send Follow-up** → Click "Send Follow-up Email" button
4. **Email Composer Opens** → Pre-filled with:
   - Subject: "Follow-up: {meeting title}"
   - Contact ID from event
   - Calendar event ID for context
   - Deal ID if associated
5. **Select Template** → Click "AI Templates"
6. **Choose Category** → Select "Meeting Follow-up"
7. **AI Personalization** → System:
   - Fetches contact details
   - Retrieves meeting notes
   - Enriches with LinkedIn data
   - Extracts pain points from discussion
   - Generates personalized email
8. **Review & Send** → Edit if needed, then send

#### Workflow 2: Bulk Follow-up Campaign

1. **Select Events** → Enter selection mode
2. **Choose Meetings** → Select all recent prospect meetings
3. **Export for Reference** → Export to .ics for records
4. **Manual Follow-ups** → For each selected event:
   - Open event details
   - Click "Send Follow-up Email"
   - Use appropriate template
   - Personalize and send

#### Workflow 3: Event Import with Automated Templates

1. **Import Events** → Import .ics from external calendar
2. **Review Imported** → Check meeting events
3. **Identify Follow-up Needed** → Find meetings without follow-up
4. **Bulk Template Application**:
   - Open template selector
   - Choose "Meeting Follow-up"
   - Apply to multiple contacts
   - Review and send batch

### API Integration Examples

**Example 1: Create Event with Follow-up Template**
```typescript
// Create calendar event
const event = await createEvent.mutateAsync({
  summary: "Discovery Meeting with Acme Corp",
  startTime: meetingDate.toISOString(),
  endTime: meetingEndDate.toISOString(),
  attendees: ["john@acmecorp.com"],
  location: "Zoom"
});

// Automatically create follow-up task
const followUpTask = await createTask({
  title: `Follow up with ${contactName}`,
  due_date: addDays(meetingDate, 1),
  description: "Send personalized follow-up email using template"
});

// Suggest template
const suggestedTemplate = await SalesTemplateService.suggestTemplate({
  category: "meeting_followup",
  contactId,
  eventId: event.id
});
```

**Example 2: Smart Template Recommendation**
```typescript
const recommendation = await SalesTemplateService.recommendTemplate({
  contactId: "contact-123",
  dealStage: "discovery",
  lastInteraction: "2025-01-15",
  responseHistory: {
    averageResponseTime: 7200, // seconds
    responseRate: 0.75
  }
});

// Returns:
{
  templateId: "template-abc",
  confidence: 0.88,
  reasoning: "Contact has high engagement and deal is in discovery stage",
  suggestedTiming: "Send within next 24 hours for optimal response"
}
```

---

## API Reference

### ICalService

#### `generateICalFile(events, calendarName)`

Generates RFC 5545 compliant iCal content from calendar events.

**Parameters:**
- `events: CalendarEvent[]` - Array of calendar events
- `calendarName: string` - Name for the calendar (default: "Sixty Sales Calendar")

**Returns:** `string` - iCal content

**Example:**
```typescript
const iCalContent = ICalService.generateICalFile(events, "My Calendar");
```

#### `parseICalFile(content)`

Parses iCal content and extracts events.

**Parameters:**
- `content: string` - iCal file content

**Returns:** `ParsedICalEvent[]` - Array of parsed events

**Example:**
```typescript
const parsedEvents = ICalService.parseICalFile(iCalContent);
```

#### `convertToCalendarEvents(parsedEvents, userId)`

Converts parsed iCal events to CalendarEvent format.

**Parameters:**
- `parsedEvents: ParsedICalEvent[]` - Parsed events from iCal
- `userId: string` - User ID for event ownership

**Returns:** `Partial<CalendarEvent>[]` - Calendar events

#### `downloadICalFile(content, filename)`

Triggers browser download of iCal file.

**Parameters:**
- `content: string` - iCal content to download
- `filename: string` - Filename (default: "calendar.ics")

#### `readICalFile(file)`

Reads uploaded .ics file content.

**Parameters:**
- `file: File` - File object from input

**Returns:** `Promise<string>` - File content

### SalesTemplateService

#### `personalizeTemplate(template, context, options)`

Personalizes template with AI and context data.

**Parameters:**
```typescript
template: SalesTemplate
context: TemplateContext
options?: {
  enhanceWithAI?: boolean;
  includeIceBreakers?: boolean;
  maxLength?: number;
}
```

**Returns:** `Promise<PersonalizedEmail>`

**Example:**
```typescript
const email = await SalesTemplateService.personalizeTemplate(
  template,
  {
    contact: { full_name: "John Smith", company_name: "Acme Corp" },
    calendar_event: { title: "Discovery Meeting", start: new Date() }
  },
  { enhanceWithAI: true }
);
```

#### `createTemplate(data)`

Creates a new sales template.

**Parameters:**
```typescript
{
  userId: string;
  orgId: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  subjectTemplate: string;
  bodyTemplate: string;
  tone?: string;
  variables?: string[];
}
```

**Returns:** `Promise<SalesTemplate>`

#### `listTemplates(userId, orgId, options)`

Lists templates with optional filtering.

**Parameters:**
```typescript
userId: string
orgId?: string
options?: {
  category?: TemplateCategory;
  isActive?: boolean;
  search?: string;
}
```

**Returns:** `Promise<SalesTemplate[]>`

#### `trackUsage(templateId, metrics)`

Tracks template usage and performance.

**Parameters:**
```typescript
templateId: string
metrics: {
  responseReceived?: boolean;
  responseTime?: number;
  converted?: boolean;
}
```

**Returns:** `Promise<void>`

### Hooks

#### `useCalendarEvents()`

React hook for calendar events with real-time updates.

**Returns:**
```typescript
{
  data: CalendarEvent[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
```

#### `useExportImport()`

Hook for export/import functionality.

**Returns:**
```typescript
{
  exportEvents: (events: CalendarEvent[], filename?: string) => void;
  importEvents: (file: File) => Promise<CalendarEvent[]>;
  isImporting: boolean;
  importError: Error | null;
}
```

---

## Troubleshooting

### Common Issues

#### Export/Import Issues

**Problem:** "Failed to parse calendar file"
- **Cause:** Malformed or non-standard .ics file
- **Solution:** Ensure file is from a supported calendar app (Google, Apple, Outlook)

**Problem:** "No events found in file"
- **Cause:** File format not recognized or empty calendar
- **Solution:** Open file in text editor, verify BEGIN:VEVENT entries exist

**Problem:** Imported events have wrong timezone
- **Cause:** All-day events vs. timed events confusion
- **Solution:** Check DTSTART format - VALUE=DATE for all-day, datetime with Z for UTC

#### Template Personalization Issues

**Problem:** "Template personalization failed"
- **Cause:** Missing required context data
- **Solution:** Ensure contact has email and name, calendar event is properly linked

**Problem:** AI personalization timeout
- **Cause:** Gemini API rate limit or network issue
- **Solution:** Retry after a few seconds, check API key configuration

**Problem:** Variables not replaced in email
- **Cause:** Variable name mismatch or missing context
- **Solution:** Check template variable names match context keys exactly

#### Google Calendar Sync Issues

**Problem:** Events not syncing
- **Cause:** Token expired or calendar service disabled
- **Solution:** Re-authorize Google Calendar integration

**Problem:** Duplicate events after sync
- **Cause:** Composite key constraint not working
- **Solution:** Check `external_id` and `user_id` are both set correctly

### Performance Optimization

**Large Event Exports:**
- Limit to last 90 days for faster export
- Use pagination for 1000+ events
- Export in chunks if browser hangs

**Template Personalization:**
- Cache LinkedIn profiles for 24 hours
- Batch template personalizations when possible
- Use lighter AI models for simple replacements

**Calendar Rendering:**
- Use virtualization for 500+ events
- Implement date-range filtering
- Lazy load event details on click

### Security Considerations

**Template Content:**
- Never include sensitive data in templates
- Sanitize user input in custom variables
- Review AI-generated content before sending

**Export/Import:**
- Validate file MIME type on upload
- Scan for malicious iCal content
- Limit file size to 10MB

**API Keys:**
- Rotate API keys every 90 days
- Use environment variables, never hardcode
- Implement rate limiting on template usage

---

## Appendix

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `N` | New event |
| `E` | Export/Import modal |
| `S` | Toggle selection mode |
| `Esc` | Close modal/dialog |
| `Arrow Keys` | Navigate calendar |
| `/` | Focus search |

### File Size Limits

- Export: Unlimited events (browser memory permitting)
- Import: Max 10MB file size
- Import: Max 10,000 events per file

### Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Full Support |
| Firefox | 88+ | ✅ Full Support |
| Safari | 14+ | ✅ Full Support |
| Edge | 90+ | ✅ Full Support |

### API Rate Limits

| Service | Limit | Window |
|---------|-------|--------|
| Google Calendar | 10 req/sec | Per user |
| Gemini AI | 60 req/min | Per API key |
| LinkedIn Enrichment | 100 req/day | Per org |
| Template Personalization | 1000 req/day | Per user |

---

## Support

For questions or issues:

1. Check this documentation first
2. Review test files for usage examples
3. Check GitHub issues for known problems
4. Contact support: support@sixtysales.com

**Documentation Version:** 1.0.0
**Last Updated:** January 22, 2025
**Maintainer:** Sixty Sales Development Team
