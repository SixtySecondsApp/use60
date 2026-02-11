  ---
  The Opportunity

  You already capture incredibly rich data during onboarding — but almost none of it reaches
  the skills.

  What you capture (organization_enrichment + organization_context):
  ┌──────────────────────────────────┬───────────────────────────────────┬──────────────────┐
  │             Variable             │              Source               │ Currently Used   │
  │                                  │                                   │    in Skills?    │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ company_name                     │ Enrichment                        │ 3 skills only    │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ company_bio                      │ AI-generated                      │ None             │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ products                         │ Enrichment (array of {name,       │ 1 skill          │
  │                                  │ description, pricing_tier})       │                  │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ value_propositions               │ Enrichment (array)                │ 1 skill          │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ competitors                      │ Enrichment (array of {name,       │ 1 skill          │
  │                                  │ domain})                          │                  │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ target_market                    │ Enrichment                        │ None             │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ ideal_customer_profile           │ Enrichment + onboarding config    │ 2 skills         │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ pain_points                      │ Enrichment (array)                │ None             │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ industry                         │ Enrichment                        │ None             │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ company_size / employee_count    │ Enrichment                        │ None             │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ tech_stack                       │ Enrichment (array)                │ None             │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ case_studies                     │ Enrichment (array)                │ None             │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ customer_logos                   │ Enrichment (array)                │ None             │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ brand_voice (tone, avoid words)  │ Onboarding skill config           │ None             │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ objection_handling (triggers +   │ Onboarding skill config           │ None             │
  │ responses)                       │                                   │                  │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ lead_qualification criteria      │ Onboarding skill config           │ None             │
  ├──────────────────────────────────┼───────────────────────────────────┼──────────────────┤
  │ icp (company profile, buyer      │ Onboarding skill config           │ None             │
  │ persona, signals)                │                                   │                  │
  └──────────────────────────────────┴───────────────────────────────────┴──────────────────┘
  Only 3 of 21 skills use ANY variables at all. The rest say generic things like "your
  company", "your product", "your pricing" instead of actually resolving to the org's real
  data.

  The Pipeline Already Works

  The compilation system is solid:

  platform_skills (${company_name} placeholders)
      ↓ compile-organization-skills (interpolation engine)
  organization_context (key/value pairs per org)
      ↓
  organization_skills (compiled, org-specific content)
      ↓ get_organization_skills_for_agent RPC
  Copilot reads fully personalized skills

  The engine supports: simple vars (${company_name}), nested paths (${icp.companyProfile}),
  array modifiers (${products | join(', ')}), and defaults (${missing | 'your company'}).

  What Needs to Happen

  Two things:

  1. Thread variables throughout all 21 skills — Replace generic "your company/product/ICP"
  language with actual ${variable} placeholders that resolve to the org's real data.

  2. Add a variables section to frontmatter — Declare what each skill needs so the system can
   validate and warn when org context is incomplete.

  Example: What Changes Look Like

  Before (current sales-sequence SKILL.md):
  1. **What are you selling / promoting?** Product, service, event, or offer

  After (with variables):
  1. **What are you selling / promoting?** ${products | first | 'Product, service, event, or
  offer'}
     Context: Your company (${company_name}) offers: ${products | join(', ') | 'not yet
  configured'}.

  Before (current lead-qualification SKILL.md):
  Score the lead against your ICP criteria...

  After:
  Score the lead against ${company_name}'s ICP criteria:
  - Target company profile: ${icp.companyProfile | 'Not configured'}
  - Ideal buyer persona: ${icp.buyerPersona | 'Not configured'}
  - Key buying signals: ${icp.buyingSignals | join(', ') | 'Not configured'}

  Variable Map Per Skill Category
  Skill Category: Deal Management (4)
  Key Variables to Thread: ${company_name}, ${products}, ${value_propositions},
  ${competitors}
  ────────────────────────────────────────
  Skill Category: Meeting Intelligence (4)
  Key Variables to Thread: ${company_name}, ${products}, ${value_propositions},
    ${case_studies}, ${brand_voice.tone}
  ────────────────────────────────────────
  Skill Category: Follow-up & Communication (4)
  Key Variables to Thread: ${company_name}, ${brand_voice.tone}, ${brand_voice.avoid},
    ${products}, ${case_studies}
  ────────────────────────────────────────
  Skill Category: Lead & Research (4)
  Key Variables to Thread: ${company_name}, ${icp}, ${products}, ${competitors},
    ${target_market}, ${pain_points}
  ────────────────────────────────────────
  Skill Category: Planning & Utility (5)
  Key Variables to Thread: ${company_name}, ${products}, ${icp}, ${industry}
  Frontmatter Addition

  Each skill would get a new variables section:

  metadata:
    variables:
      - key: company_name
        type: string
        required: true
        fallback: "your company"
        used_for: "Competitive positioning, email personalization"
      - key: products
        type: array
        required: false
        fallback: "your products"
        used_for: "Solution mapping in proposals and emails"
      - key: brand_voice
        type: object
        required: false
        fallback: null
        used_for: "Tone calibration for all written output"

  ---
  Want me to go ahead and implement this? I'd thread the org variables through all 21 skills
  (SKILL.md files + reference docs where relevant) and add the variables frontmatter section.
   Same parallel approach — 5 agents, one per batch.

✻ Sautéed for 2m 11s

❯ Yes but we would need this to be dynamic as if we load more veriables or the org       
  changes their information                                                              

⏺ Right — you don't want to hardcode variable references across 21 skills that break when you
   add new org fields. Let me dig into how the current compilation trigger works so we design
   this properly.

⏺ 2 Explore agents finished (ctrl+o to expand)
   ├─ Find compilation triggers and context flow · 29 tool uses · 97.9k tokens
   │  ⎿  Done
   └─ Find org context update mechanisms · 31 tool uses · 104.2k tokens
      ⎿  Done

⏺ Now I have the full picture. Here's what I'd recommend:

  ---
  The Problem

  Right now, the variable system is compile-once, use-forever. Three issues:

  1. No auto-recompile — When an org updates their products, ICP, or brand voice, compiled
  skills stay stale until someone manually triggers recompilation
  2. Hardcoded ${var} references are brittle — If we scatter ${company_name} across 200
  places in 21 skills, adding or renaming a variable means editing every skill
  3. New variables don't propagate — When the platform adds a new context field (e.g.,
  pricing_model), existing skills can't use it without manual edits

  The Solution: Dynamic Context Injection + Auto-Recompile

  Instead of threading specific ${variables} throughout every skill body, we do two things:

  1. Dynamic Context Block (injected at compile time)

  Each skill gets a ## Organization Context section that the compile pipeline generates
  automatically from ALL available organization_context data:

  ## Organization Context (Auto-Generated)

  **Company**: Acme Corp
  **Industry**: Enterprise SaaS
  **Products**: Widget Pro (AI-powered analytics), DataSync (ETL pipeline)
  **Value Propositions**: 10x faster data processing, No-code setup, SOC2 compliant
  **Target Market**: Mid-market B2B companies (100-1000 employees)
  **ICP**: VP/Director of Data Engineering at Series B+ SaaS companies
  **Competitors**: Fivetran, Airbyte, Stitch Data
  **Pain Points**: Complex ETL pipelines, Data freshness issues, Engineering bottleneck
  **Brand Voice**: Confident partner — direct, technical but approachable
  **Words to Avoid**: synergy, leverage, best-in-class, cutting-edge
  **Case Studies**: DataCo (3x pipeline speed), TechFlow (saved $200k/yr)

  The skill body then naturally references "your organization context" or "the business
  context above" — no specific ${variable} needed in most places. Only key identifiers like
  ${company_name} get used inline for things like "Position ${company_name} as the better
  choice."

  When an org adds a new product → recompile → the context block updates → every skill sees
  it.
  When the platform adds pricing_model as a new field → it flows into the context block
  automatically → no skill edits needed.

  2. Auto-Recompile on Context Change

  Add a database trigger that marks skills for recompilation when organization_context
  changes:

  -- Trigger on organization_context INSERT/UPDATE/DELETE
  CREATE TRIGGER trg_context_changed
    AFTER INSERT OR UPDATE OR DELETE ON organization_context
    FOR EACH ROW
    EXECUTE FUNCTION mark_org_skills_for_recompile();

  -- Function marks all org skills as needing recompile
  CREATE FUNCTION mark_org_skills_for_recompile() RETURNS trigger AS $$
  BEGIN
    UPDATE organization_skills
    SET needs_recompile = true, updated_at = now()
    WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id);
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  Then the existing refresh-organization-skills edge function processes the queue — either
  via a cron schedule (every 5 min) or immediately via a pg_notify + webhook.

  3. Context Profiles (skill-level control)

  Not every skill needs every variable. Add a context_profile to frontmatter:

  metadata:
    context_profile: sales  # sales | research | communication | full
  Profile: sales
  Includes: company_name, products, value_propositions, competitors, icp, brand_voice,
    case_studies, pricing_model
  ────────────────────────────────────────
  Profile: research
  Includes: company_name, products, competitors, industry, target_market, tech_stack,
    pain_points
  ────────────────────────────────────────
  Profile: communication
  Includes: company_name, brand_voice, words_to_avoid, products, case_studies, email_sign_off
  ────────────────────────────────────────
  Profile: full
  Includes: Everything in organization_context
  The compile pipeline reads the profile and generates the appropriate context block.

  4. Minimal Inline Variables

  Only a handful of variables get used inline in skill bodies — things that need to appear in
   specific places:

  - ${company_name} — In titles, competitive framing, email signatures
  - ${company_name | 'your company'} — With fallback for orgs that haven't completed setup

  Everything else comes from the context block.

  ---
  Architecture Summary

  Org updates products in Settings
      ↓
  organization_context table updated
      ↓
  DB trigger → marks org_skills needs_recompile = true
      ↓
  Cron (5 min) OR pg_notify webhook
      ↓
  compile-organization-skills runs
      ↓
  Reads ALL org context → generates context block per profile
      ↓
  Injects block into each skill's compiled_content
      ↓
  organization_skills updated with fresh compiled content
      ↓
  Next copilot call reads updated skills automatically

  What Needs Building
  Component: context_profile field in skill frontmatter
  Type: Skill edit (21 skills)
  Effort: Small
  ────────────────────────────────────────
  Component: Context block generator in compile-organization-skills
  Type: Edge function update
  Effort: Medium
  ────────────────────────────────────────
  Component: DB trigger on organization_context
  Type: Migration
  Effort: Small
  ────────────────────────────────────────
  Component: Auto-recompile cron or pg_notify hook
  Type: Edge function + cron
  Effort: Medium
  ────────────────────────────────────────
  Component: Skills body updates (reference "Organization Context" section)
  Type: Skill edits (21 skills)
  Effort: Medium
  ────────────────────────────────────────
  Component: ${company_name} inline in key positions
  Type: Skill edits (21 skills)
  Effort: Small
  ---