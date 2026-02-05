# Copilot Improvement Plan - January 3, 2026

## Executive Summary

This plan outlines a comprehensive improvement initiative for the Sixty Copilot, including:
- Testing with 30 queries across difficulty levels
- Building a Platform Admin Test Page for continuous quality monitoring
- Creating new high-value skills (including Gemini image generation)
- Building powerful sequences that combine skills for impressive demos

---

## Phase 1: Copilot Testing & Assessment

### 1.1 Test Query Categories

#### Easy Queries (10 queries) - Direct data retrieval
1. "What meetings do I have today?"
2. "Show me my pipeline summary"
3. "How many deals are closing this month?"
4. "What's my next meeting?"
5. "List my recent activities"
6. "Show deals at risk"
7. "What tasks are overdue?"
8. "Show my calendar for tomorrow"
9. "How many meetings did I have last week?"
10. "List contacts I haven't contacted in 30 days"

#### Medium Queries (10 queries) - Multi-step reasoning
1. "Prep me for my next meeting with talking points"
2. "Research Stripe and their key stakeholders"
3. "Draft a follow-up email to my last meeting attendee"
4. "Analyze my win/loss patterns this quarter"
5. "What competitors should I know about for Acme Corp?"
6. "Summarize my pipeline health and forecast"
7. "Create a task to follow up on stale deals"
8. "Research industry trends for fintech"
9. "Find contacts at companies in my pipeline"
10. "Generate a morning brief for today"

#### Hard Queries (10 queries) - Complex multi-skill operations
1. "Create a full prospecting package for conturae.com with company research, key contacts, and personalized outreach"
2. "Analyze my entire pipeline, identify at-risk deals, and suggest specific recovery actions"
3. "Research my next 3 meetings and prepare talking points for each"
4. "Build a competitive analysis comparing Stripe vs Square vs PayPal"
5. "Create a sales sequence for following up with cold leads"
6. "Generate a quarterly business review summary with charts data"
7. "Research and enrich all contacts from companies in my closing-soon deals"
8. "Create personalized outreach for top 5 prospects with research backing"
9. "Analyze meeting patterns and suggest optimal meeting times"
10. "Generate a deal acceleration plan for my largest opportunity"

### 1.2 Quality Assessment Criteria

| Dimension | Weight | Scoring |
|-----------|--------|---------|
| Accuracy | 30% | Data correctness, no hallucinations |
| Completeness | 25% | All requested info provided |
| Relevance | 20% | Response matches query intent |
| Actionability | 15% | Clear next steps provided |
| Speed | 10% | Response time acceptable |

### 1.3 Test Results Template

```typescript
interface TestResult {
  query: string;
  difficulty: 'easy' | 'medium' | 'hard';
  response: string;
  executionTime: number;
  toolsUsed: string[];
  scores: {
    accuracy: number;      // 1-5
    completeness: number;  // 1-5
    relevance: number;     // 1-5
    actionability: number; // 1-5
    speed: number;         // 1-5
  };
  overallScore: number;    // weighted average
  issues: string[];
  suggestions: string[];
}
```

---

## Phase 2: Platform Admin Test Page

### 2.1 File Structure

```
src/
├── pages/platform/
│   └── CopilotTestPage.tsx          # Main test page
├── components/platform/
│   ├── CopilotTestRunner.tsx        # Test execution component
│   ├── CopilotTestResults.tsx       # Results display
│   ├── CopilotTestQueryEditor.tsx   # Query management
│   └── CopilotQualityMetrics.tsx    # Quality dashboard
├── lib/hooks/
│   └── useCopilotTests.ts           # Test management hooks
```

### 2.2 Route Configuration

Add to `src/lib/routes/routeConfig.ts`:
```typescript
{
  path: 'copilot-tests',
  label: 'Copilot Tests',
  icon: 'FlaskConical',
  component: 'CopilotTestPage',
}
```

### 2.3 Features

- **Test Runner**: Execute test queries against Copilot API
- **Results Dashboard**: Visual display of test outcomes
- **Quality Trends**: Historical quality tracking
- **Query Editor**: Add/edit test queries
- **AI Assessment**: Automated quality scoring using Claude

---

## Phase 3: New Skills to Build

### 3.1 Image Generation Skill

**Skill: `image-generation`**
- Uses Gemini Imagen 3 API for high-quality image generation
- Input: Prompt, style, dimensions
- Output: Image URL, metadata

```yaml
---
skill_key: image-generation
name: AI Image Generator
description: Generate professional images using Gemini Imagen 3
category: creative
model: gemini-imagen-3
---
```

### 3.2 Prospecting Visual Creator

**Skill: `prospect-visual`**
- Combines prospect research with image generation
- Creates personalized visual content for outreach

### 3.3 Meeting Summary Emailer

**Skill: `meeting-summary-email`**
- Takes meeting transcript
- Generates summary email with action items
- Ready to send follow-up

### 3.4 Deal Health Analyzer

**Skill: `deal-health-analyzer`**
- Analyzes deal signals and activity
- Provides health score with reasoning
- Suggests recovery actions

### 3.5 Contact Enrichment Bundle

**Skill: `contact-enrichment-bundle`**
- Combines multiple enrichment sources
- LinkedIn profile analysis
- Company context
- Recent news/triggers

---

## Phase 4: Sequences to Build

### 4.1 Prospecting Power Sequence

**Name**: "Full Prospecting Package"
**Steps**:
1. `lead-research` - Research the company
2. `image-generation` - Create personalized visual
3. `draft-email` - Draft personalized outreach

### 4.2 Meeting Mastery Sequence

**Name**: "Meeting Prep & Follow-up"
**Steps**:
1. `meeting-prep` - Research attendees and company
2. `talking-points` - Generate discussion topics
3. [HITL: Meeting happens]
4. `meeting-summary-email` - Draft follow-up email

### 4.3 Deal Rescue Sequence

**Name**: "Deal Recovery Plan"
**Steps**:
1. `deal-health-analyzer` - Analyze deal status
2. `competitor-intel` - Research competitive threats
3. [HITL: Review analysis]
4. `draft-email` - Create re-engagement message

### 4.4 Weekly Pipeline Review

**Name**: "Pipeline Intelligence Report"
**Steps**:
1. `get_pipeline_summary` - Pull pipeline data
2. `deal-health-analyzer` - Score all active deals
3. `forecast-analysis` - Generate forecast
4. `image-generation` - Create summary visual

---

## Phase 5: AI Quality Assessment Tests

### 5.1 Test Architecture

```typescript
// Quality assessment using Claude
async function assessCopilotResponse(
  query: string,
  response: CopilotResponse,
  expectedBehavior: string
): Promise<QualityAssessment> {
  const assessment = await runSkill(supabase, 'quality-assessment', {
    query,
    response: JSON.stringify(response),
    expectedBehavior,
    criteria: QUALITY_CRITERIA
  });

  return assessment;
}
```

### 5.2 Continuous Testing

- Run tests on deployment
- Daily scheduled test runs
- Alert on quality regression
- Track trends over time

---

## Phase 6: Demo Preparation

### 6.1 Demo Scenarios

1. **"Research Stripe"** - Shows web search + structured output
2. **"Prep me for my next meeting"** - Shows CRM integration + AI
3. **"Create prospecting visual for Acme Corp"** - Shows image generation sequence
4. **"What's my pipeline health?"** - Shows data analysis + recommendations

### 6.2 Demo Checklist

- [ ] All demo queries tested and working
- [ ] Response times under 5 seconds
- [ ] Image generation producing quality visuals
- [ ] Sequences executing without errors
- [ ] HITL flows working smoothly

---

## Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | Run 30 test queries | 2h | High |
| P0 | Fix any critical Copilot issues | 2h | Critical |
| P1 | Build Copilot Test Page | 3h | High |
| P1 | Build image-generation skill | 2h | High |
| P1 | Build prospecting sequence | 2h | High |
| P2 | AI quality assessment tests | 2h | Medium |
| P2 | Additional skills | 2h | Medium |
| P3 | Additional sequences | 2h | Medium |

---

## Success Metrics

- 80%+ of test queries score 4+ out of 5
- All demo scenarios working flawlessly
- Test page operational in platform admin
- At least 3 impressive sequences ready
- Image generation producing usable visuals

---

## Notes

- Organization ID for testing: `80e0fefe-6077-41b2-8116-50125e506dd0`
- Gemini API key required for image generation
- HITL flows require Slack integration for notifications
