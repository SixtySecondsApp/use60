# Consult Report: World-Class Copilot Lab + Specialized Sales Co-Pilot

**Generated**: 2026-01-24
**Status**: Analysis Complete

---

## User Request

"How can we improve the Copilot Lab to check the flows and improvements we have made? This needs to be a world-class feature."

**Additional Context**: 
- User asked about onboarding data personalization
- Clarified: The agent is an **INTERNAL sales co-pilot** (not customer-facing)
- Helps senior sales reps be more successful
- Assists with external communications via email
- Uses HITL (Human-in-the-Loop) for confirmations before sending/executing

---

## Primary Use Case

**All of the above** — Full-featured AI testing platform:
1. QA Testing — Ensure skills/sequences work correctly before deployment
2. Development — Build and debug new skills iteratively
3. Monitoring — Track AI quality and performance over time

---

## The Vision: Your Dedicated Team Member

After onboarding, the copilot transforms from a generic AI into **your dedicated sales analyst with superpowers**.

**Before Onboarding:**
> "I'm a generic AI assistant. How can I help you today?"

**After Onboarding:**
> "Hey Sarah! I just reviewed your pipeline and noticed the Acme deal has been in Proposal for 12 days. Should I draft a follow-up email referencing our Widget Pro integration that their CTO asked about? I can also prep you for your call with TechCorp tomorrow — they're evaluating us against WidgetCo and I have some talking points ready."

### What Makes It Feel Like a Team Member

| Aspect | Generic AI | Your Team Member |
|--------|-----------|------------------|
| **Greeting** | "How can I help?" | "Hey Sarah, quick update on your pipeline..." |
| **Product knowledge** | None | "...our Widget Pro integration..." |
| **Competitor awareness** | None | "...they're evaluating us against WidgetCo..." |
| **Context** | None | "...the Acme deal has been in Proposal for 12 days..." |
| **Proactivity** | Reactive only | Suggests actions before you ask |
| **Voice** | Generic | Writes like your company |

### Superpowers via Sequences

The team member has "superpowers" — complex multi-step workflows they can execute in seconds:

| Superpower | Sequence | What It Does |
|------------|----------|--------------|
| 🎯 **Meeting Prep** | `seq-next-meeting-command-center` | Full brief in 30 seconds |
| 📊 **Pipeline Check** | `seq-pipeline-focus-tasks` | Health check with action items |
| ✉️ **Follow-up Emails** | `seq-post-meeting-followup-pack` | Drafts in company voice |
| 🚨 **Deal Rescue** | `seq-deal-rescue-pack` | Plan to save stalling deals |
| 📋 **Daily Focus** | `seq-daily-focus-plan` | Prioritized task list |
| 🔍 **Research** | `lead-research` | Intel on prospects |

---

## Analysis Summary

### Current State: 6.2/10

| Component | Score | Notes |
|-----------|-------|-------|
| Component Architecture | 8/10 | 9 well-organized components |
| Execution Tracing | 7/10 | Good step visualization |
| Quality Dashboard | 7/10 | Health metrics, readiness scores |
| Analytics | 6/10 | Basic coverage tracking |
| Testing Infrastructure | 5/10 | Manual testing only |
| Debug Capabilities | 4/10 | Limited introspection |
| Personalization Usage | 4/10 | Rich data collected but not used |

### Target State: 9.5/10 (World-Class)

---

## Part 1: Copilot Lab Improvements

### Critical Gaps (All Agents Agreed)

1. **Prompt Library** — Save prompts with expected outputs for regression testing
2. **Response Grading** — Rate AI responses on accuracy, helpfulness, tone
3. **A/B Comparison** — Compare results side-by-side
4. **Regression Testing** — Auto-run golden tests on skill/prompt changes
5. **Debug Mode** — Verbose logging toggle, request/response inspection
6. **Cost/Latency Display** — Show in playground (Quick Win)
7. **Query Collections** — Organize saved queries into folders
8. **Execution Replay** — Replay past conversations for debugging

### Quick Wins (< 1 day each)

| Feature | Effort | Impact | Files |
|---------|--------|--------|-------|
| Cost/Latency Display | 2-3h | High | `InteractivePlayground.tsx` |
| Save/Load Queries | 3-4h | High | `InteractivePlayground.tsx` |
| Export Test Results | 2-3h | Medium | `CopilotTestPage.tsx` |
| Keyboard Shortcuts | 2h | Medium | Lab components |
| Debug Mode Toggle | 3-4h | High | `api-copilot/index.ts` |

### World-Class Features

| Phase | Features | Priority |
|-------|----------|----------|
| **Phase 1** | Cost/Latency, Save Queries, Debug Mode | Week 1 |
| **Phase 2** | Prompt Library, Response Grading, Result Comparison | Week 2-3 |
| **Phase 3** | Regression Testing, A/B Comparison, Execution Replay | Week 4-5 |
| **Phase 4** | Test Suites, Model Config, Variables/Environments | Week 6+ |

---

## Part 2: Onboarding Data Personalization

### Data We Collect (30+ fields)

#### During Onboarding

**Manual Q&A** (personal email users):
- `company_name`, `company_description`
- `industry`
- `target_customers`
- `main_products`
- `competitors`

**Website Enrichment** (corporate email users):
- Company: `tagline`, `founded_year`, `employee_count`, `headquarters`
- Classification: `industry`, `sub_industry`, `business_model`, `company_stage`
- Products: `products[]`, `services[]`, `key_features[]`, `integrations[]`
- Market: `target_industries[]`, `target_company_sizes[]`, `target_roles[]`
- Positioning: `competitors[]`, `differentiators[]`, `pain_points_addressed[]`
- Voice: `tone[]`, `key_phrases[]`, `content_samples[]`
- Sales: `pricing_model`, `sales_motion`, `buying_signals[]`, `common_objections[]`

**AI Preferences** (settings):
- User: `preferred_tone`, `preferred_length`, `prefers_ctas`, `prefers_bullet_points`
- Org: `brand_voice`, `tone_guidelines`, `blocked_phrases[]`, `required_disclaimers[]`

### Where It's Stored

| Table | Data Type | Usage |
|-------|-----------|-------|
| `organization_enrichment` | Rich company data | **NOT USED** in copilot |
| `organization_context` | Key-value pairs for skills | Used by skills only |
| `org_ai_preferences` | Brand voice, blocked phrases | **NOT USED** in copilot |
| `user_ai_preferences` | User tone preferences | **NOT USED** in copilot |
| `user_writing_styles` | Email training data | ✅ Used in copilot |
| `organizations` | Basic org info | ✅ Used (limited fields) |
| `profiles` | User bio | ✅ Used |

### Current Usage in Copilot (buildContext function)

**What's Used** (6 fields):
- `organizations.name`
- `organizations.currency_code/locale`
- `organizations.company_bio`
- `organizations.company_industry`
- `organizations.company_country_code/timezone`
- `profiles.bio`
- `user_writing_styles.*` (if set)

**What's NOT Used** (20+ fields):
- `organization_enrichment.*` (products, competitors, pain points, buying signals)
- `org_ai_preferences.*` (brand_voice, tone_guidelines, blocked_phrases)
- `user_ai_preferences.*` (preferred_tone, preferred_length)
- `profiles.working_hours_start/end`
- `organization_context.*` (only used by skills, not main prompt)

### Personalization Gap Score: 4/10

**Problem**: We collect rich personalization data during onboarding but only use ~20% of it in the copilot prompt context. Skills can access more via template variables, but the main copilot conversation doesn't benefit from:
- Products and services
- Competitors
- Pain points
- Buying signals
- Brand voice
- Tone preferences
- Working hours

---

## Recommendations

### Immediate: Enhance buildContext()

```typescript
// Add to buildContext() in api-copilot/index.ts

// 1. Include organization enrichment data
const { data: enrichment } = await client
  .from('organization_enrichment')
  .select('products, competitors, target_market, pain_points, buying_signals, value_propositions')
  .eq('organization_id', orgId)
  .maybeSingle()

if (enrichment) {
  if (enrichment.products?.length > 0) {
    contextParts.push(`Products: ${enrichment.products.slice(0,3).map(p => p.name).join(', ')}`)
  }
  if (enrichment.competitors?.length > 0) {
    contextParts.push(`Key competitors: ${enrichment.competitors.slice(0,3).map(c => c.name).join(', ')}`)
  }
  if (enrichment.pain_points?.length > 0) {
    contextParts.push(`Customer pain points: ${enrichment.pain_points.slice(0,3).join(', ')}`)
  }
}

// 2. Include user AI preferences
const { data: userPrefs } = await client
  .from('user_ai_preferences')
  .select('preferred_tone, preferred_length, prefers_ctas')
  .eq('user_id', userId)
  .maybeSingle()

if (userPrefs?.preferred_tone) {
  contextParts.push(`User prefers ${userPrefs.preferred_tone} tone`)
}

// 3. Include org AI preferences
const { data: orgPrefs } = await client
  .from('org_ai_preferences')
  .select('brand_voice, blocked_phrases')
  .eq('org_id', orgId)
  .maybeSingle()

if (orgPrefs?.brand_voice) {
  contextParts.push(`Brand voice: ${orgPrefs.brand_voice}`)
}
if (orgPrefs?.blocked_phrases?.length > 0) {
  contextParts.push(`Never use these phrases: ${orgPrefs.blocked_phrases.join(', ')}`)
}

// 4. Include working hours for time-aware suggestions
const { data: profile } = await client
  .from('profiles')
  .select('working_hours_start, working_hours_end, timezone')
  .eq('id', userId)
  .maybeSingle()

if (profile?.working_hours_start !== null) {
  contextParts.push(`User works ${profile.working_hours_start}:00-${profile.working_hours_end}:00`)
}
```

### Long-term: Personalization System

1. **Create unified context builder** — Cache compiled context per org/user
2. **Make skills aware of preferences** — Pass user/org prefs to skill execution
3. **Use enrichment proactively** — Reference competitors in positioning, pain points in objections
4. **Track effectiveness** — Log which context variables improve response quality

---

## Database Schema Additions

```sql
-- Prompt Library (for Lab testing)
CREATE TABLE copilot_prompt_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  expected_response_type TEXT,
  expected_structure JSONB,
  tags TEXT[],
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Response Grades (for quality rating)
CREATE TABLE copilot_response_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES copilot_messages(id),
  grader_user_id UUID REFERENCES profiles(id),
  accuracy INTEGER CHECK (accuracy BETWEEN 1 AND 5),
  helpfulness INTEGER CHECK (helpfulness BETWEEN 1 AND 5),
  tone INTEGER CHECK (tone BETWEEN 1 AND 5),
  actionability INTEGER CHECK (actionability BETWEEN 1 AND 5),
  overall INTEGER CHECK (overall BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Test Suites (for regression testing)
CREATE TABLE copilot_test_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  test_cases JSONB NOT NULL,
  schedule TEXT,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Execution Plan Summary

### Phase 1: Quick Wins + Personalization (Week 1)
- LAB-001: Add cost/latency display to playground
- LAB-002: Add save/load queries feature
- LAB-003: Add debug mode toggle
- PERS-001: Enhance buildContext with enrichment data
- PERS-002: Add user/org AI preferences to context

### Phase 2: Core Lab Features (Week 2-3)
- LAB-004: Create Prompt Library component
- LAB-005: Build Response Grading UI
- LAB-006: Implement Result Comparison view
- LAB-007: Add Query History & Collections

### Phase 3: Advanced Features (Week 4-5)
- LAB-008: Regression Testing automation
- LAB-009: A/B Comparison mode
- LAB-010: Execution Replay
- LAB-011: Test Suites & Scripts

### Phase 4: Excellence (Week 6+)
- LAB-012: Model Configuration panel
- LAB-013: Variables & Environments
- LAB-014: Export/Import test cases

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Lab Score | 6.2/10 | 9.5/10 |
| Personalization Usage | 20% | 80% |
| Test Coverage | Manual only | 80% automated |
| Debug Capability | Limited | Full request/response visibility |
| Context Fields Used | 6 | 25+ |

---

## Next Steps

Run `60/plan --feature 'copilot-lab-world-class'` to generate the execution plan, or proceed directly to implementation.
