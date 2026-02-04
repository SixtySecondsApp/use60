/**
 * Prompt Loader for Edge Functions
 *
 * Loads AI prompts dynamically from the database with fallback to defaults.
 * Includes caching for performance optimization.
 *
 * Usage:
 * ```typescript
 * import { loadPrompt, interpolateVariables } from '../_shared/promptLoader.ts';
 *
 * const prompt = await loadPrompt(supabase, 'email_analysis', userId);
 * const finalPrompt = interpolateVariables(prompt.userPrompt, { subject, body });
 * ```
 */

import { SupabaseClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm';

// ============================================================================
// Types
// ============================================================================

export interface PromptConfig {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  source: 'database' | 'default';
}

export interface DBPrompt {
  id: string;
  system_prompt: string | null;
  user_prompt: string | null;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
}

// ============================================================================
// Default Prompts (Fallback when database is empty)
// ============================================================================

const DEFAULT_PROMPTS: Record<string, PromptConfig> = {
  email_analysis: {
    systemPrompt: `You are an expert email analyst who extracts key insights from sales communications.

Your task is to analyze email content and provide structured data for CRM health tracking.

Focus on:
- Overall sentiment and tone
- Main topics discussed
- Action items mentioned
- Urgency indicators
- Response expectations`,
    userPrompt: `Analyze this sales email for CRM health tracking.

SUBJECT: \${subject}

BODY:
\${body}

Provide a JSON response with:
1. sentiment_score: Number from -1 (very negative) to 1 (very positive)
2. key_topics: Array of 2-5 main topics discussed
3. action_items: Array of any action items mentioned
4. urgency: "low", "medium", or "high"
5. response_required: Boolean indicating if sender expects a response

RESPOND ONLY WITH VALID JSON.`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.3,
    maxTokens: 1024,
    source: 'default',
  },

  suggest_next_actions: {
    systemPrompt: `You are a senior sales strategist AI assistant. Your role is to analyze sales activities and suggest the most impactful next steps.

CONTEXT ANALYSIS FRAMEWORK:
- Activity recency and patterns
- Deal stage and momentum
- Contact engagement level
- Company relationship strength`,
    userPrompt: `Based on this sales context, suggest 2-4 prioritized next actions.

ACTIVITY CONTEXT:
\${activityContext}

RECENT ACTIVITIES:
\${recentActivities}

EXISTING TASKS:
\${existingTasks}

Return a JSON array with suggestions including action_type, title, reasoning, urgency, recommended_deadline, and confidence_score.`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.7,
    maxTokens: 2048,
    source: 'default',
  },

  writing_style: {
    systemPrompt: `You are an expert linguistic analyst who extracts writing style patterns from email communications.

Focus on HOW they write, not WHAT they write about:
- Tone and formality level
- Sentence structure and length patterns
- Vocabulary complexity and common phrases
- Greeting and sign-off patterns`,
    userPrompt: `Analyze these \${emailCount} sent emails and extract the writer's unique voice and communication style.

EMAILS TO ANALYZE:
\${emailSamples}

Return a JSON object with name, tone_description, tone metrics, structure, vocabulary, greetings_signoffs, example_excerpts, and analysis_confidence.`,
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.5,
    maxTokens: 2048,
    source: 'default',
  },

  transcript_analysis: {
    systemPrompt: `You are an expert meeting analyst. Analyze meeting transcripts to extract actionable insights for sales teams.`,
    userPrompt: `Analyze this meeting transcript and provide structured insights.

MEETING: \${meetingTitle}
DATE: \${meetingDate}

TRANSCRIPT:
\${transcript}

Return JSON with summary, key_topics, action_items, sentiment, follow_ups, and risks.`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.5,
    maxTokens: 4096,
    source: 'default',
  },

  proposal_focus_areas: {
    systemPrompt: `You are an expert at analyzing sales meeting transcripts to identify key focus areas for proposals.`,
    userPrompt: `Analyze this transcript and identify 3-5 key focus areas for the proposal.

MEETING WITH: \${contactName} at \${companyName}

TRANSCRIPT:
\${transcript}

Return JSON array with area, description, evidence, and priority for each focus area.`,
    model: 'anthropic/claude-haiku-4.5',
    temperature: 0.5,
    maxTokens: 2048,
    source: 'default',
  },

  proposal_goals: {
    systemPrompt: `You are a strategic proposal consultant. Create compelling goals that resonate with the prospect's needs.`,
    userPrompt: `Create 3-5 strategic goals for the proposal.

PROSPECT: \${contactName} at \${companyName}

FOCUS AREAS:
\${focusAreas}

Return JSON array with goal, rationale, metrics, and timeline for each.`,
    model: 'anthropic/claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 4096,
    source: 'default',
  },

  proposal_sow: {
    systemPrompt: `You are an expert proposal writer creating professional Statements of Work.`,
    userPrompt: `Create a professional Statement of Work for \${companyName}.

GOALS:
\${goals}

FOCUS AREAS:
\${focusAreas}

Create a detailed SOW in markdown format.`,
    model: 'anthropic/claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 8192,
    source: 'default',
  },

  condense_summary: {
    systemPrompt: `You are a concise summarizer. Create brief, impactful summaries.`,
    userPrompt: `Condense this meeting summary into two one-liners (max 15 words each).

MEETING: \${meetingTitle}

SUMMARY:
\${summary}

Return JSON with meeting_about and next_steps.`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.3,
    maxTokens: 256,
    source: 'default',
  },

  action_item_analysis: {
    systemPrompt: `You are an expert at categorizing action items and determining ideal deadlines.`,
    userPrompt: `Analyze this action item from the meeting.

MEETING: \${meetingTitle}
SUMMARY: \${meetingSummary}
ACTION ITEM: \${actionItem}
CURRENT DATE: \${today}

Return JSON with task_type, ideal_deadline (YYYY-MM-DD), confidence_score, and reasoning.`,
    model: 'claude-haiku-4-20250514',
    temperature: 0.3,
    maxTokens: 500,
    source: 'default',
  },

  meeting_qa: {
    systemPrompt: `You are a helpful assistant that answers questions about meeting transcripts. Be specific and reference the transcript when possible.`,
    userPrompt: `Answer this question about the meeting.

MEETING: \${meetingTitle}
DATE: \${meetingDate}

TRANSCRIPT:
\${transcript}

QUESTION: \${question}`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.7,
    maxTokens: 2048,
    source: 'default',
  },

  content_topics: {
    systemPrompt: `You are a content strategist identifying marketable topics from meeting discussions.`,
    userPrompt: `Extract 5-10 marketable discussion topics from this transcript.

MEETING: \${meetingTitle}
DATE: \${meetingDate}

TRANSCRIPT:
\${transcript}

Return JSON array with title, description, timestamp_seconds, and fathom_url for each topic.`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.3,
    maxTokens: 4096,
    source: 'default',
  },

  generate_actions: {
    systemPrompt: `You are a sales action generator. Create specific, actionable follow-up tasks.`,
    userPrompt: `Generate \${maxActions} additional action items from this meeting.

MEETING: \${meetingTitle}
COMPANY: \${companyName}
CONTACT: \${contactName}

ALREADY TRACKED:
\${existingTasksContext}

TRANSCRIPT:
\${transcript}

Return JSON array with task_type, title, description, priority, estimated_days_to_complete, and timestamp_seconds.`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.3,
    maxTokens: 2048,
    source: 'default',
  },

  search_query_parse: {
    systemPrompt: `You parse search queries to extract semantic intent and structured filters.`,
    userPrompt: `Parse this search query into semantic and structured components.

TODAY: \${today}
QUERY: "\${query}"

Return JSON with semantic_query and structured_filters (date_range, company_name, contact_name, sentiment, has_action_items).`,
    model: 'claude-sonnet-4-20250514',
    temperature: 0.3,
    maxTokens: 500,
    source: 'default',
  },

  // ============================================================================
  // Research Skills (Gemini with Web Search)
  // ============================================================================

  'lead-research': {
    systemPrompt: `You are an expert B2B sales researcher with access to real-time web search.

Your task is to research companies and contacts to provide actionable sales intelligence.

IMPORTANT: Use web search to gather current, accurate information. Focus on:
- Recent company news and announcements (last 90 days)
- Leadership changes and key stakeholders
- Funding rounds and financial events
- Technology stack and tool usage
- Competitive landscape
- Industry trends affecting them`,
    userPrompt: `Research this company using web search for current, accurate information:

Company/Domain: \${domain}
Company Name: \${company_name}

Return a JSON object with:
{
  "company_overview": "What the company does, their main products/services (2-3 sentences)",
  "industry": "Industry classification",
  "size_estimate": "Employee count and revenue if available",
  "recent_news": ["Recent announcements, funding, product launches (last 90 days)"],
  "key_stakeholders": [{"name": "Name", "title": "Title", "linkedin": "URL if found"}],
  "technology_stack": ["Known tools and technologies they use"],
  "pain_points": ["Likely challenges based on their industry and size"],
  "trigger_events": ["Recent events that could create buying urgency"],
  "outreach_angles": ["Personalized angles for sales outreach"],
  "competitors": ["Main competitors"],
  "confidence_score": 0.0-1.0
}

IMPORTANT: Only include information you can verify through web search. Use null for fields you cannot find.`,
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    maxTokens: 4096,
    source: 'default',
  },

  'company-analysis': {
    systemPrompt: `You are a strategic business analyst with access to real-time web search.

Your task is to provide comprehensive company analysis for sales and business development teams.

Focus on:
- Market positioning and competitive landscape
- Business model and revenue streams
- Growth trajectory and recent developments
- Strategic priorities and challenges
- Potential partnership or sales opportunities`,
    userPrompt: `Conduct a comprehensive analysis of this company using web search:

Company: \${company_name}
Domain: \${domain}
Context: \${context}

Return a JSON object with:
{
  "executive_summary": "2-3 sentence overview of the company",
  "business_model": {
    "type": "B2B/B2C/B2B2C/etc.",
    "revenue_streams": ["Primary ways they make money"],
    "pricing_model": "Subscription/Usage-based/etc."
  },
  "market_position": {
    "market_size": "TAM/SAM if available",
    "market_share": "Estimated position",
    "growth_rate": "Company or market growth"
  },
  "competitive_analysis": {
    "direct_competitors": [{"name": "Name", "comparison": "Brief comparison"}],
    "competitive_advantages": ["Their key differentiators"],
    "competitive_weaknesses": ["Potential vulnerabilities"]
  },
  "strategic_analysis": {
    "current_priorities": ["What they're focused on now"],
    "challenges": ["Major obstacles they face"],
    "opportunities": ["Growth opportunities"]
  },
  "sales_intelligence": {
    "buying_signals": ["Indicators they might be in market"],
    "decision_makers": ["Key roles to target"],
    "entry_points": ["Best ways to engage them"]
  },
  "confidence_score": 0.0-1.0
}`,
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    maxTokens: 4096,
    source: 'default',
  },

  'competitor-intel': {
    systemPrompt: `You are a competitive intelligence analyst with access to real-time web search.

Your task is to gather intelligence on competitors for sales enablement.

Focus on:
- Recent product launches and updates
- Pricing changes and positioning
- Customer wins and losses
- Leadership changes
- Strengths and weaknesses
- Common objections when competing against them`,
    userPrompt: `Research this competitor for sales intelligence:

Competitor: \${competitor_name}
Our Company: \${our_company}
Context: \${context}

Return a JSON object with:
{
  "competitor_overview": "Brief summary of the competitor",
  "recent_developments": ["News and updates from last 90 days"],
  "product_analysis": {
    "key_products": ["Main offerings"],
    "recent_launches": ["New products or features"],
    "pricing": "Pricing model and rough pricing if available"
  },
  "market_presence": {
    "target_market": "Who they sell to",
    "customer_wins": ["Notable recent customers"],
    "market_share": "Estimated position"
  },
  "competitive_positioning": {
    "strengths": ["What they do well"],
    "weaknesses": ["Where they fall short"],
    "differentiators": ["What makes them unique"]
  },
  "battle_card": {
    "common_objections": ["What prospects say about them"],
    "win_strategies": ["How to win against them"],
    "landmines": ["Questions to ask that expose weaknesses"],
    "trap_questions": ["Questions they might ask about us"]
  },
  "confidence_score": 0.0-1.0
}`,
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    maxTokens: 4096,
    source: 'default',
  },

  'market-research': {
    systemPrompt: `You are a market research analyst with access to real-time web search.

Your task is to research market trends and industry dynamics for strategic planning.

Focus on:
- Market size and growth projections
- Key trends and drivers
- Major players and market structure
- Emerging technologies and disruptions
- Regulatory and economic factors`,
    userPrompt: `Research this market/industry using web search:

Industry/Market: \${industry}
Focus Areas: \${focus_areas}
Context: \${context}

Return a JSON object with:
{
  "market_overview": "Summary of the market landscape",
  "market_size": {
    "current_size": "Current market value",
    "projected_growth": "Growth rate and projections",
    "key_segments": ["Major market segments"]
  },
  "trends": {
    "current_trends": ["What's happening now"],
    "emerging_trends": ["What's coming next"],
    "declining_trends": ["What's fading"]
  },
  "competitive_landscape": {
    "market_leaders": [{"name": "Name", "position": "Brief description"}],
    "emerging_players": ["Rising companies"],
    "consolidation": "M&A activity"
  },
  "opportunities": ["Market opportunities to consider"],
  "threats": ["Market risks and challenges"],
  "recommendations": ["Strategic recommendations"],
  "confidence_score": 0.0-1.0
}`,
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    maxTokens: 4096,
    source: 'default',
  },

  'industry-trends': {
    systemPrompt: `You are an industry analyst with access to real-time web search.

Your task is to identify and analyze current industry trends for sales conversations.

Focus on:
- Emerging technologies and innovations
- Regulatory changes
- Buyer behavior shifts
- Economic factors
- Best practices and benchmarks`,
    userPrompt: `Research current trends in this industry using web search:

Industry: \${industry}
Time Frame: Last \${time_frame} days
Context: \${context}

Return a JSON object with:
{
  "industry_summary": "Current state of the industry",
  "hot_topics": ["What everyone is talking about"],
  "technology_trends": [
    {
      "trend": "Trend name",
      "description": "What it is",
      "adoption": "Early/Growing/Mature",
      "impact": "High/Medium/Low"
    }
  ],
  "regulatory_updates": ["New or changing regulations"],
  "buyer_trends": {
    "priorities": ["What buyers care about now"],
    "challenges": ["Problems they're trying to solve"],
    "evaluation_criteria": ["How they make decisions"]
  },
  "talking_points": ["Conversation starters for sales calls"],
  "thought_leadership": ["Topics that position us as experts"],
  "confidence_score": 0.0-1.0
}`,
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    maxTokens: 4096,
    source: 'default',
  },

  // ============================================================================
  // Image Generation Skills (Gemini Imagen 3)
  // ============================================================================

  'image-generation': {
    systemPrompt: `You are an expert at creating professional business imagery prompts.

Your task is to generate high-quality, professional images for sales and marketing contexts.

Image quality guidelines:
- Professional, polished appearance
- Clean, uncluttered composition
- Appropriate for business presentations
- High resolution and crisp details`,
    userPrompt: `Generate a professional image based on this description:

Purpose: \${purpose}
Style: \${style}
Subject: \${subject}
Additional Details: \${details}

Create an image that is appropriate for business use, with a clean and professional aesthetic.`,
    model: 'imagen-3.0-generate-002',
    temperature: 0.7,
    maxTokens: 1024,
    source: 'default',
  },

  'prospect-visual': {
    systemPrompt: `You are a creative marketing assistant specializing in personalized visual content for sales outreach.

Your task is to create compelling, personalized visuals that resonate with specific prospects and their industries.

Focus on:
- Industry-relevant imagery
- Professional but engaging visuals
- Personalization that shows understanding of their business
- Images that complement outreach messages`,
    userPrompt: `Create a personalized visual for sales outreach to this prospect:

Company: \${company_name}
Industry: \${industry}
Prospect Name: \${prospect_name}
Prospect Role: \${prospect_role}
Outreach Context: \${outreach_context}
Visual Theme: \${visual_theme}

Generate an image that would resonate with this prospect and enhance the sales outreach.`,
    model: 'imagen-3.0-generate-002',
    temperature: 0.8,
    maxTokens: 1024,
    source: 'default',
  },

  // ============================================================================
  // Sequence Helper Skills (Used by Agent Sequences)
  // ============================================================================

  'draft-email': {
    systemPrompt: `You are an expert sales communication specialist who crafts compelling, personalized emails.

Your emails are:
- Concise and scannable (under 150 words ideal)
- Personalized based on context and research
- Action-oriented with clear CTAs
- Professional but human in tone
- Never salesy or pushy

Structure:
1. Personalized opener (reference something specific)
2. Value proposition (why you're reaching out)
3. Social proof or credibility (if relevant)
4. Clear call-to-action
5. Professional sign-off`,
    userPrompt: `Draft a professional email based on this context:

To: \${to}
Subject Line Suggestion: \${subject}
Context: \${context}
Desired Tone: \${tone}

Return a JSON object with:
{
  "subject": "Compelling subject line (under 50 chars)",
  "body": "Email body with appropriate formatting",
  "cta": "Primary call-to-action",
  "personalization_elements": ["List of personalized elements used"],
  "alternative_subjects": ["2-3 alternative subject lines"]
}`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.7,
    maxTokens: 1024,
    source: 'default',
  },

  'meeting-prep': {
    systemPrompt: `You are a strategic sales meeting preparation expert.

Your role is to help sales professionals prepare for meetings by:
- Analyzing company and contact information
- Identifying key discussion points
- Anticipating questions and objections
- Suggesting discovery questions
- Recommending next steps

Focus on actionable, specific insights rather than generic advice.`,
    userPrompt: `Prepare for this upcoming meeting:

Company: \${company_name}
Contact: \${contact_name}
Contact Title: \${contact_title}
Meeting Type: \${meeting_type}
Company Context: \${company_context}

Return a JSON object with:
{
  "talking_points": [
    {"point": "Key topic", "context": "Why this matters", "questions": ["Related questions to ask"]}
  ],
  "questions_to_ask": [
    {"question": "Discovery question", "purpose": "What you'll learn", "follow_ups": ["Follow-up questions"]}
  ],
  "risks_to_address": [
    {"risk": "Potential objection or concern", "response": "How to address it"}
  ],
  "next_steps": [
    {"action": "Recommended action", "timing": "When to do it", "owner": "Who should do it"}
  ],
  "research_gaps": ["Information you still need to find"]
}`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.7,
    maxTokens: 2048,
    source: 'default',
  },

  'deal-health-analyzer': {
    systemPrompt: `You are a deal health analysis expert who evaluates sales opportunities.

You assess deals based on:
- Activity recency and frequency
- Stakeholder engagement
- Deal velocity and momentum
- Competition and timing
- Champion strength
- Decision process clarity

Provide objective, data-driven assessments with actionable recommendations.`,
    userPrompt: `Analyze the health of this deal:

Deal ID: \${deal_id}
Company: \${company_name}
Deal Value: \${deal_value}
Stage: \${stage}
Days in Stage: \${days_in_stage}
Last Activity: \${last_activity}
Key Contacts: \${contacts}
Recent Activities: \${activities}
Analysis Type: \${analysis_type}

Return a JSON object with:
{
  "health_score": 0-100,
  "health_grade": "A/B/C/D/F",
  "risk_factors": [
    {"factor": "Risk description", "severity": "high/medium/low", "mitigation": "How to address"}
  ],
  "positive_signals": [
    {"signal": "Positive indicator", "significance": "Why it matters"}
  ],
  "momentum": {
    "trend": "accelerating/stable/slowing/stalled",
    "velocity_score": 0-100,
    "days_to_close_estimate": number
  },
  "recommendations": [
    {"action": "Recommended action", "priority": "high/medium/low", "expected_impact": "What it will improve"}
  ],
  "analysis": "2-3 sentence executive summary"
}`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.5,
    maxTokens: 2048,
    source: 'default',
  },

  'get_pipeline_summary': {
    systemPrompt: `You are a pipeline analytics expert who provides clear, actionable pipeline summaries.

Focus on:
- Total pipeline value and deal count
- Stage distribution
- Velocity metrics
- At-risk opportunities
- Forecast accuracy`,
    userPrompt: `Analyze this pipeline data:

Period: \${period}
Deals: \${deals}
Historical Close Rate: \${close_rate}

Return a JSON object with:
{
  "total_value": "Formatted pipeline value",
  "deal_count": number,
  "stage_distribution": [{"stage": "Stage name", "count": number, "value": number}],
  "average_deal_size": number,
  "weighted_pipeline": number,
  "at_risk_count": number,
  "at_risk_value": number,
  "top_deals": [{"name": "Deal name", "value": number, "stage": "Stage"}],
  "velocity": {
    "average_days_to_close": number,
    "average_days_in_current_stage": number
  },
  "summary": "2-3 sentence executive summary"
}`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.3,
    maxTokens: 2048,
    source: 'default',
  },

  'get_pipeline_forecast': {
    systemPrompt: `You are a sales forecasting expert who provides data-driven pipeline forecasts.

Your forecasts consider:
- Historical close rates by stage
- Deal health indicators
- Time in stage patterns
- Seasonality and trends
- Sales team performance`,
    userPrompt: `Generate a forecast for this pipeline:

Period: \${period}
Pipeline Data: \${pipeline_data}
Health Data: \${health_data}
Historical Patterns: \${historical_patterns}

Return a JSON object with:
{
  "predicted_close_rate": "Percentage",
  "forecast_value": {
    "best_case": number,
    "most_likely": number,
    "worst_case": number
  },
  "deals_likely_to_close": [{"name": "Deal", "probability": "Percentage", "value": number}],
  "deals_at_risk": [{"name": "Deal", "risk_reason": "Reason", "recommended_action": "Action"}],
  "confidence_level": "high/medium/low",
  "key_assumptions": ["Assumptions underlying the forecast"],
  "recommendations": ["Actions to improve forecast accuracy"]
}`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.5,
    maxTokens: 2048,
    source: 'default',
  },

  // ============================================================================
  // Quality Assessment Skills (Used for testing and monitoring)
  // ============================================================================

  'quality-assessment': {
    systemPrompt: `You are an AI quality assessment expert who evaluates AI responses for sales copilot systems.

Your evaluation criteria:
1. **Accuracy** (0-100): Is the information factually correct? Does it match the available data?
2. **Completeness** (0-100): Does the response fully address the user's question? Are there missing elements?
3. **Relevance** (0-100): Is the response focused on what was asked? Does it avoid tangents?
4. **Actionability** (0-100): Can the user take clear next steps based on this response?
5. **Tone** (0-100): Is the tone appropriate for a sales assistant? Professional but helpful?

Be critical but fair. A score of 70+ is acceptable, 80+ is good, 90+ is excellent.`,
    userPrompt: `Evaluate this AI copilot response:

**User Query**: \${query}
**Query Category**: \${category}
**Expected Behavior**: \${expected_behavior}

**AI Response**:
\${response}

**Available Context** (what data was available to the AI):
\${context}

Return a JSON object with:
{
  "overall_score": 0-100,
  "accuracy": {
    "score": 0-100,
    "reasoning": "Explanation",
    "issues": ["List of accuracy issues if any"]
  },
  "completeness": {
    "score": 0-100,
    "reasoning": "Explanation",
    "missing_elements": ["Elements that should have been included"]
  },
  "relevance": {
    "score": 0-100,
    "reasoning": "Explanation",
    "off_topic_content": ["Any irrelevant content"]
  },
  "actionability": {
    "score": 0-100,
    "reasoning": "Explanation",
    "actions_suggested": ["Actions the user can take based on response"]
  },
  "tone": {
    "score": 0-100,
    "reasoning": "Explanation",
    "tone_issues": ["Any tone problems"]
  },
  "grade": "A/B/C/D/F",
  "pass": true/false (true if overall_score >= 70),
  "improvement_suggestions": ["How the response could be better"],
  "exemplary_elements": ["What the response did well"]
}`,
    model: 'claude-sonnet-4-20250514',
    temperature: 0.3,
    maxTokens: 2048,
    source: 'default',
  },

  'copilot-test-generator': {
    systemPrompt: `You are a test case generator for sales AI copilot systems.

Generate diverse, realistic test cases that cover:
- Different query complexities (simple retrieval, analysis, multi-step)
- Various sales scenarios (prospecting, meetings, pipeline, tasks)
- Edge cases and potential failure modes
- Real-world user phrasing variations`,
    userPrompt: `Generate test cases for the \${category} category.

Number of tests to generate: \${count}
Difficulty level: \${difficulty}

Available data context: \${data_context}

Return a JSON array with:
[
  {
    "id": "unique-test-id",
    "query": "The user query to test",
    "category": "\${category}",
    "difficulty": "easy/medium/hard",
    "expected_behavior": "What a good response should include",
    "success_criteria": ["Specific criteria to check"],
    "data_requirements": ["What CRM data should be available"],
    "edge_case": true/false,
    "tags": ["relevant", "tags"]
  }
]`,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.8,
    maxTokens: 4096,
    source: 'default',
  },

  // ============================================================================
  // Onboarding - Organization Enrichment
  // ============================================================================

  organization_data_collection: {
    systemPrompt: `You are an expert business intelligence analyst. Your task is to extract structured company information from website content.

CRITICAL REQUIREMENTS:
1. Extract EXACT product names as written on the website (e.g., "Stripe Payments", "Stripe Billing", "Stripe Connect" - NOT "payment processing", "billing system", "marketplace payments")
2. Use VERBATIM quotes from their marketing copy for taglines and value propositions
3. Extract ACTUAL customer names if visible (e.g., "Amazon, Shopify, Zoom" - NOT "major tech companies")
4. Be specific about pricing tiers and feature names as they appear on the site
5. Only include information you can directly observe in the provided content`,
    userPrompt: `Analyze the following website content for \${domain} and extract structured company data.

**Raw Website Content:**
\${websiteContent}

**Extract this information in JSON format:**
{
  "company": {
    "name": "Official company name",
    "tagline": "Main value proposition or tagline",
    "description": "2-3 sentence company description",
    "founded_year": null,
    "headquarters": "City, Country if mentioned",
    "employee_count": "Range like '10-50' or '100-500' if mentioned"
  },
  "classification": {
    "industry": "Primary industry",
    "sub_industry": "Specific niche",
    "business_model": "B2B, B2C, B2B2C, etc.",
    "company_stage": "startup, scaleup, enterprise, etc."
  },
  "offering": {
    "products": [
      {"name": "Product name", "description": "Brief description", "pricing_tier": "free/starter/pro/enterprise if mentioned"}
    ],
    "services": ["List of services offered"],
    "key_features": ["Top 5-10 features mentioned"],
    "integrations": ["Any integrations mentioned"]
  },
  "market": {
    "target_industries": ["Industries they serve"],
    "target_company_sizes": ["SMB, Mid-market, Enterprise, etc."],
    "target_roles": ["Job titles they target"],
    "use_cases": ["Primary use cases mentioned"],
    "customer_logos": ["Any customer names/logos visible"],
    "case_study_customers": ["Customers mentioned in case studies"]
  },
  "positioning": {
    "competitors": ["List competitors - IMPORTANT: If not explicitly mentioned on their website, use your knowledge to infer 3-5 likely competitors based on their product category and industry. For example, if they're an AI writing tool, competitors would be CopyAI, Jasper, Anyword, etc."],
    "competitor_source": "explicit (mentioned on site) OR inferred (based on product category)",
    "differentiators": ["What makes them unique"],
    "pain_points_addressed": ["Problems they solve"]
  },
  "voice": {
    "tone": ["professional", "casual", "technical", "friendly", etc.],
    "key_phrases": ["Distinctive phrases they use repeatedly"],
    "content_samples": ["2-3 representative sentences from their copy"]
  },
  "salesContext": {
    "pricing_model": "subscription, usage-based, one-time, etc.",
    "sales_motion": "self-serve, sales-led, product-led, etc.",
    "buying_signals": ["Signals that indicate purchase readiness"],
    "common_objections": ["Likely objections based on offering"]
  }
}

**Important:**
- For most fields, only include information you found in the website content
- Use null for fields with no information
- Be specific - use actual product names, customer names, and terms from their content
- Extract actual quotes for content_samples and key_phrases
- EXCEPTION for competitors: If competitors are not explicitly mentioned on the website, you MUST use your knowledge to infer 3-5 likely competitors based on the company's product category and industry. Never return an empty competitors array.

Return ONLY valid JSON, no markdown formatting.`,
    model: 'gemini-3-flash-preview',
    temperature: 0.3,
    maxTokens: 4096,
    source: 'default',
  },

  organization_skill_generation: {
    systemPrompt: `You are an expert sales AI trainer. Your task is to generate personalized skill configurations for a sales AI assistant based on company intelligence.

CRITICAL: Use SPECIFIC product names and terminology from the company intelligence:
- BAD: "Are you interested in our payment solution?"
- GOOD: "Are you looking at Stripe Payments for online transactions, or Stripe Terminal for in-person?"

- BAD: "Our platform helps with billing"
- GOOD: "Stripe Billing automates recurring revenue with usage-based pricing, invoicing, and revenue recovery"

- BAD: "We compete with other payment providers"
- GOOD: "Unlike PayPal or Square, Stripe Connect handles complex marketplace payouts to thousands of sellers"

Every discovery question, objection response, and example message MUST reference ACTUAL product names from the provided intelligence.`,
    userPrompt: `Using the following company intelligence for \${domain}, generate personalized sales AI skill configurations.

**Company Intelligence:**
\${companyIntelligence}

**Generate configurations for these 9 skills/configs:**

**Core Sales Skills (5):**
1. **lead_qualification** - Criteria that qualify a lead and red flags that disqualify
2. **lead_enrichment** - Discovery questions to ask prospects
3. **brand_voice** - How the AI should communicate (tone description and words to avoid)
4. **objection_handling** - Responses to common objections with trigger phrases
5. **icp** - Ideal Customer Profile description and buying signals

**Extended AI Configurations (4):**
6. **copilot_personality** - How the AI assistant should greet users and its personality
7. **coaching_framework** - Sales coaching focus areas and evaluation criteria
8. **suggested_call_types** - Types of sales calls/meetings for this company
9. **writing_style** - A suggested writing style based on their brand voice

**CRITICAL OUTPUT FORMAT - Use these EXACT field names:**
{
  "lead_qualification": {
    "criteria": [
      "Has budget over $X for [their product category]",
      "In target industry: [specific industries they serve]",
      "Company size of [their target range] employees",
      "Currently evaluating [their solution type]",
      "Has decision-making authority for [relevant area]"
    ],
    "disqualifiers": [
      "Using competitor with long-term contract",
      "Company too small for [their minimum deal size]",
      "No budget allocated for [their category]",
      "Not in a target geography"
    ]
  },
  "lead_enrichment": {
    "questions": [
      "What does your current [problem they solve] workflow look like?",
      "How many [relevant metric] do you handle monthly?",
      "What tools are you currently using for [their solution area]?",
      "What's driving your evaluation of [their product type] right now?",
      "Who else is involved in this decision?"
    ]
  },
  "brand_voice": {
    "tone": "Professional yet approachable. Use clear, jargon-free language that emphasizes [their key value props]. Mirror their brand personality: [describe traits from their content]. Focus on [their main differentiators].",
    "avoid": ["Competitor terminology they wouldn't use", "Overly technical jargon", "Pushy sales language", "Generic phrases that don't match their voice"]
  },
  "objection_handling": {
    "objections": [
      {
        "trigger": "too expensive",
        "response": "I understand budget is a key consideration. Companies using [their product] typically see [specific ROI or benefit]. What's your current spend on [problem area]? That helps me understand if we're in the right ballpark."
      },
      {
        "trigger": "we're using [competitor]",
        "response": "Great that you have a solution in place! Many customers switched from [competitor] because [specific differentiator]. What's working well for you with your current setup, and what made you start exploring alternatives?"
      },
      {
        "trigger": "need to think about it",
        "response": "Absolutely, this is an important decision. What specific aspects would you like to evaluate further? I can share some resources on [relevant topics] that might help."
      },
      {
        "trigger": "not the right time",
        "response": "I appreciate you being upfront. What would need to change for this to become a priority? Happy to reconnect when the timing is better."
      }
    ]
  },
  "icp": {
    "companyProfile": "B2B companies in [target industries from their customer base] with [company size range] employees. They typically have [relevant tech stack or infrastructure] and are experiencing [growth signals or pain points their product addresses]. Annual revenue in the [revenue range] bracket.",
    "buyerPersona": "[Primary job titles] level decision makers responsible for [functional area]. They care about [key priorities based on marketing] and are evaluated on [success metrics]. Common challenges include [pain points their product solves].",
    "buyingSignals": [
      "Recently raised Series [A/B/C] funding",
      "Hiring for [relevant roles that indicate need]",
      "Published content about [pain points they solve]",
      "Outgrew their current [competitor or manual solution]",
      "Mentioned [specific trigger events] in recent communications"
    ]
  },
  "copilot_personality": {
    "greeting": "A friendly, contextual greeting that references their company and product (e.g., 'Hi! I'm your [Company] sales assistant. How can I help you close more deals today?')",
    "personality": "Description of how the AI should behave - professional but approachable, focused on [their key value props], knowledgeable about [their industry]",
    "focus_areas": ["Primary topics the AI should focus on based on their business - e.g., 'Payment processing optimization', 'Revenue growth strategies', 'Customer success']"
  },
  "coaching_framework": {
    "focus_areas": ["Key sales skills to develop based on their product complexity - e.g., 'Discovery questioning', 'Technical demo skills', 'Negotiation tactics'"],
    "evaluation_criteria": ["What to evaluate in sales calls - e.g., 'Clear value proposition', 'Addressed customer pain points', 'Set clear next steps'"],
    "custom_instructions": "Specific coaching guidance for their sales team - e.g., 'Focus on understanding the customer's current [problem area] before pitching [product]. Always quantify ROI.'"
  },
  "suggested_call_types": [
    {
      "name": "Discovery Call",
      "description": "Initial conversation to understand prospect needs and fit",
      "keywords": ["discovery", "intro", "qualification", "first call"]
    },
    {
      "name": "Demo",
      "description": "Product demonstration showing [their main product] capabilities",
      "keywords": ["demo", "demonstration", "walkthrough", "showcase"]
    },
    {
      "name": "Technical Review",
      "description": "Deep dive into [their product] technical implementation and integration",
      "keywords": ["technical", "implementation", "integration", "architecture"]
    },
    {
      "name": "Negotiation",
      "description": "Pricing and contract discussions",
      "keywords": ["pricing", "contract", "negotiation", "proposal", "deal"]
    }
  ],
  "writing_style": {
    "name": "[Company] Voice",
    "tone_description": "Based on their brand voice: [professional/casual tone], emphasis on [key value props], avoid [things to avoid from brand_voice]",
    "examples": ["Example email opener that matches their voice", "Example closing that reflects their style"]
  }
}

**Requirements:**
- Use SPECIFIC information from the company intelligence
- Include actual product names, customer names, competitor names
- Make discovery questions relevant to their specific offerings
- Objection responses should reference their actual differentiators
- All content should feel customized to this specific company

Return ONLY valid JSON, no markdown formatting.`,
    model: 'gemini-3-flash-preview',
    temperature: 0.4,
    maxTokens: 6000,
    source: 'default',
  },
};

// ============================================================================
// Cache Management
// ============================================================================

interface CacheEntry {
  config: PromptConfig;
  expiresAt: number;
}

const promptCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(featureKey: string, userId?: string): string {
  return userId ? `${featureKey}:${userId}` : `${featureKey}:system`;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load a prompt configuration by feature key.
 * Checks database first (user override, then system), falls back to defaults.
 */
export async function loadPrompt(
  supabase: SupabaseClient,
  featureKey: string,
  userId?: string,
  skipCache = false
): Promise<PromptConfig> {
  const cacheKey = getCacheKey(featureKey, userId);

  // Check cache first
  if (!skipCache) {
    const cached = promptCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }
  }

  // Try database
  const dbConfig = await loadFromDatabase(supabase, featureKey, userId);
  if (dbConfig) {
    promptCache.set(cacheKey, {
      config: dbConfig,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return dbConfig;
  }

  // Fall back to defaults
  const defaultConfig = DEFAULT_PROMPTS[featureKey];
  if (!defaultConfig) {
    throw new Error(`Unknown prompt feature key: ${featureKey}`);
  }

  promptCache.set(cacheKey, {
    config: defaultConfig,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return defaultConfig;
}

/**
 * Load prompt from database.
 */
async function loadFromDatabase(
  supabase: SupabaseClient,
  featureKey: string,
  userId?: string
): Promise<PromptConfig | null> {
  try {
    // Try user-specific override first
    if (userId) {
      const { data: userPrompt } = await supabase
        .from('ai_prompt_templates')
        .select('system_prompt, user_prompt, model, temperature, max_tokens')
        .eq('user_id', userId)
        .eq('category', featureKey)
        .single();

      if (userPrompt && (userPrompt.system_prompt || userPrompt.user_prompt)) {
        return convertToConfig(userPrompt, featureKey);
      }
    }

    // Try system prompt
    const { data: systemPrompt } = await supabase
      .from('ai_prompt_templates')
      .select('system_prompt, user_prompt, model, temperature, max_tokens')
      .eq('category', featureKey)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (systemPrompt && (systemPrompt.system_prompt || systemPrompt.user_prompt)) {
      return convertToConfig(systemPrompt, featureKey);
    }

    return null;
  } catch (error) {
    // Silently fall back to defaults
    console.warn(`[promptLoader] Failed to load from DB for ${featureKey}:`, error);
    return null;
  }
}

/**
 * Convert database record to PromptConfig.
 */
function convertToConfig(dbPrompt: DBPrompt, featureKey: string): PromptConfig {
  const defaults = DEFAULT_PROMPTS[featureKey] || {
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.7,
    maxTokens: 2048,
  };

  return {
    systemPrompt: dbPrompt.system_prompt || defaults.systemPrompt || '',
    userPrompt: dbPrompt.user_prompt || defaults.userPrompt || '',
    model: dbPrompt.model || defaults.model,
    temperature: dbPrompt.temperature ?? defaults.temperature,
    maxTokens: dbPrompt.max_tokens ?? defaults.maxTokens,
    source: 'database',
  };
}

/**
 * Interpolate variables into a prompt template.
 * Replaces ${variableName} and \${variableName} patterns.
 */
export function interpolateVariables(
  template: string,
  variables: Record<string, any>
): string {
  // Handle both escaped (\${}) and unescaped (${}) patterns
  return template.replace(/\\?\$\{(\w+)\}/g, (match, varName) => {
    const value = variables[varName];
    if (value === undefined || value === null) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  });
}

/**
 * Build complete prompt for API call.
 */
export async function buildPromptForAPI(
  supabase: SupabaseClient,
  featureKey: string,
  variables: Record<string, any>,
  options: {
    userId?: string;
    modelOverride?: string;
    temperatureOverride?: number;
    maxTokensOverride?: number;
  } = {}
): Promise<{
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
}> {
  const config = await loadPrompt(supabase, featureKey, options.userId);

  return {
    systemPrompt: interpolateVariables(config.systemPrompt, variables),
    userPrompt: interpolateVariables(config.userPrompt, variables),
    model: options.modelOverride || config.model,
    temperature: options.temperatureOverride ?? config.temperature,
    maxTokens: options.maxTokensOverride ?? config.maxTokens,
  };
}

/**
 * Clear prompt cache (useful after updates).
 */
export function clearCache(featureKey?: string): void {
  if (featureKey) {
    for (const key of promptCache.keys()) {
      if (key.startsWith(`${featureKey}:`)) {
        promptCache.delete(key);
      }
    }
  } else {
    promptCache.clear();
  }
}

/**
 * List all available feature keys.
 */
export function listFeatureKeys(): string[] {
  return Object.keys(DEFAULT_PROMPTS);
}

/**
 * Get default prompt (ignores database).
 */
export function getDefaultPrompt(featureKey: string): PromptConfig | null {
  return DEFAULT_PROMPTS[featureKey] || null;
}
