# AI Copilot User Guide

## Overview

The AI Copilot is your intelligent sales assistant that helps you manage your pipeline, contacts, and deals. It uses Google Gemini Flash to provide actionable insights and can perform actions directly in your CRM.

## AI Model

The Copilot is powered by **Google Gemini Flash** with function calling capabilities. It has access to 4 core tools:

1. **list_skills** - Lists available skills for your organization
2. **get_skill** - Retrieves a specific skill document
3. **execute_action** - Executes CRM actions and runs skills/sequences
4. **resolve_entity** - Resolves ambiguous person references (e.g., first-name-only)

## Getting Started

### Accessing the Copilot

1. **Via Navigation**: Click "AI Copilot" in the sidebar
2. **Via Keyboard Shortcut**: Press `⌘K` (or `Ctrl+K` on Windows/Linux) to open Smart Search, then type your query
3. **Via Contact Record**: Click "Ask Copilot about this contact" in the AI insights banner

## Features

### 1. Conversational Interface

The Copilot uses a ChatGPT-style interface where you can:
- Ask questions about your sales pipeline
- Get recommendations on deals that need attention
- Request summaries of your meetings
- Generate email drafts

### 2. Action Tools

The Copilot can perform actions directly in your CRM:

#### Create Roadmap Items
**Example**: "Create a new roadmap item for adding email templates"

The Copilot will:
- Create a roadmap suggestion
- Set appropriate type (feature, bug, improvement, other)
- Assign priority level
- Submit it to your roadmap

#### Summarize Meetings
**Example**: "Summarise my meetings for the week"

The Copilot will:
- Fetch all meetings from the specified period
- Include Fathom transcripts, AI summaries, and action items
- Provide sentiment analysis and talk time metrics
- Generate a comprehensive summary

**Available periods**:
- "week" - Last 7 days
- "month" - Last 30 days
- "custom" - Specify start and end dates

#### Find Coldest Deals
**Example**: "What deals are the coldest?"

The Copilot will:
- Analyze deal engagement levels
- Calculate coldness scores based on:
  - Days since last update
  - Last activity date
  - Health score
- Return top deals needing attention

#### Create Tasks
**Example**: "Set up a new task to follow up with John Smith tomorrow"

The Copilot will:
- Create a task in your CRM
- Link it to contacts, deals, or companies if specified
- Set priority and due date
- Assign it to you by default

#### Write Impactful Emails
**Example**: "Write me 5 emails that will make the biggest impact this week"

The Copilot will:
- Analyze your deals by value, health score, and engagement
- Generate personalized email drafts for top opportunities
- Include subject lines, body text, and suggested send times
- Focus on high-value, at-risk, or cold deals based on your preference

**Focus options**:
- "all" - All active deals
- "cold_deals" - Deals with no activity in 7+ days
- "high_value" - Deals worth $50,000+
- "at_risk" - Deals with high/critical risk levels

## Best Practices

### 1. Be Specific
- ✅ "Summarise my meetings from last week"
- ❌ "Show me meetings"

### 2. Use Natural Language
- ✅ "What deals need the most attention right now?"
- ✅ "Create a task to call Sarah about the Acme deal"
- ✅ "Draft a follow-up email for the TechCorp proposal"

### 3. Provide Context
When asking about specific contacts or deals, mention them by name:
- ✅ "Tell me about the Acme Corp deal"
- ✅ "What should I do next with John Smith?"

## Rate Limits

- **100 requests per hour** per user
- Rate limit headers are included in responses:
  - `X-RateLimit-Limit`: Maximum requests
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset time (Unix timestamp)

If you exceed the limit, you'll receive a 429 status with a `Retry-After` header indicating when to try again.

## Troubleshooting

### Copilot Not Responding
1. Check your internet connection
2. Verify you're authenticated (refresh the page)
3. Check browser console for errors
4. Try a simpler query

### Tool Actions Not Working
1. Ensure you have proper permissions
2. Verify the data exists (e.g., meetings, deals)
3. Check that required fields are provided
4. Review error messages in the response

### Slow Responses
- Complex queries with multiple tool calls may take 10-30 seconds
- Large meeting transcripts are automatically chunked
- If timeout occurs, try breaking your request into smaller parts

## Examples

### Example 1: Weekly Review
```
You: "Summarise my meetings for the week and tell me what deals need attention"

Copilot will:
1. Fetch and summarize all meetings from the past week
2. Find the coldest deals
3. Provide actionable recommendations
```

### Example 2: Email Campaign
```
You: "Write me 5 emails for high-value deals that need follow-up"

Copilot will:
1. Find deals worth $50,000+ with low engagement
2. Generate personalized email drafts
3. Include suggested send times
```

### Example 3: Task Management
```
You: "Create a task to follow up with Acme Corp about their proposal, due tomorrow"

Copilot will:
1. Find the Acme Corp contact/deal
2. Create a task linked to them
3. Set due date to tomorrow
4. Assign it to you
```

## Technical Details

### Data Access
The Copilot has access to:
- **Fathom Meeting Data**: Full transcripts, AI summaries, action items, sentiment analysis
- **Deal Information**: Values, stages, health scores, risk levels, activity history
- **Contact Data**: Emails, companies, recent activities
- **Task Management**: Create and manage tasks
- **Roadmap**: Submit feature requests and improvements

### Privacy & Security
- All conversations are stored per-user
- Data access is restricted by Row Level Security (RLS)
- Rate limiting prevents abuse
- All API calls are authenticated

## Support

For issues or questions:
1. Check this guide first
2. Review error messages in the Copilot interface
3. Check browser console for detailed errors
4. Contact support with specific error messages







