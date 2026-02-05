Skills-Based Onboarding V2 Implementation Plan

 Overview

 Create a "wow factor" onboarding experience with deep company intelligence.

 Two-Prompt Pipeline (both Gemini 3 Flash for speed):
 1. Data Collection Prompt - Scrape and extract raw company information
 2. Skill Generation Prompt - Contextualize data into structured skill configurations

 Two-Prompt Architecture

 Prompt 1: Data Collection (Gemini 3 Flash)

 Scrapes and extracts raw company data from available sources.

 | Source           | Priority     | Data Collected                                             |
 |------------------|--------------|------------------------------------------------------------|
 | Company Website  | Required     | Products, services, pricing, value props, about page, team |
 | LinkedIn Company | If available | Employee count, recent posts, company description          |
 | G2/Capterra      | If available | Reviews, competitor mentions                               |
 | Crunchbase       | If available | Funding, investors, news                                   |
 | Job Postings     | If available | Open roles, tech stack hints                               |

 Prompt 2: Skill Generation (Gemini 3 Flash)

 Takes collected data and generates company-specific skill configurations.

 Why two prompts?
 - Clear separation - Data collection vs interpretation
 - Better quality - Each prompt focused on one task
 - Easier debugging - Can inspect raw data before skill generation
 - Fast - Both using Gemini 3 Flash for speed

 What We Show Them

 Progressive reveal during loading (based on what we find):
 1. "Analyzing your website..." → Company info appears
 2. "Found your products..." → Product list appears (if found)
 3. "Identifying competitors..." → Competitors appear (if found)
 4. "Understanding your customers..." → ICP preview appears
 5. "Generating your personalized sales AI..." → Skills preview

 Flow Comparison

 | V1 (Current)                                          | V2 (Skills-Based)
                          |
 |-------------------------------------------------------|--------------------------------------------------
 -------------------------|
 | Welcome → Org Setup → Team Invite → Fathom → Complete | Deep Enrichment Loading → Company Intel Review →
 Skills Config → Complete |

 Implementation Steps

 Phase 1: Database Schema

 1.1 Create organization_enrichment table
 CREATE TABLE organization_enrichment (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
   domain TEXT NOT NULL,

   -- Core company info
   company_name TEXT,
   logo_url TEXT,
   tagline TEXT,
   description TEXT,
   industry TEXT,
   employee_count TEXT,
   funding_stage TEXT,
   founded_year INT,
   headquarters TEXT,

   -- Products & Services
   products JSONB DEFAULT '[]', -- [{name, description, pricing_tier}]
   value_propositions JSONB DEFAULT '[]',
   use_cases JSONB DEFAULT '[]',

   -- Market Intelligence
   competitors JSONB DEFAULT '[]', -- [{name, domain, comparison}]
   target_market TEXT,
   ideal_customer_profile JSONB DEFAULT '{}',

   -- Team Intelligence
   key_people JSONB DEFAULT '[]', -- [{name, title, linkedin_url}]
   recent_hires JSONB DEFAULT '[]',
   open_roles JSONB DEFAULT '[]',
   tech_stack JSONB DEFAULT '[]',

   -- Social Proof
   customer_logos JSONB DEFAULT '[]',
   case_studies JSONB DEFAULT '[]',
   reviews_summary JSONB DEFAULT '{}',

   -- Pain Points & Opportunities
   pain_points JSONB DEFAULT '[]',
   buying_signals JSONB DEFAULT '[]',
   recent_news JSONB DEFAULT '[]',

   -- Meta
   sources_used JSONB DEFAULT '[]',
   confidence_score DECIMAL(3,2),
   model TEXT DEFAULT 'gemini-3-flash',
   raw_scraped_data JSONB DEFAULT '{}',
   status TEXT DEFAULT 'pending',
   error_message TEXT,
   created_at TIMESTAMPTZ DEFAULT now(),
   updated_at TIMESTAMPTZ DEFAULT now(),

   UNIQUE(organization_id)
 );

 1.2 Create organization_skills table
 CREATE TABLE organization_skills (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
   skill_id TEXT NOT NULL,
   skill_name TEXT NOT NULL,
   config JSONB NOT NULL DEFAULT '{}',
   ai_generated BOOLEAN DEFAULT true,
   user_modified BOOLEAN DEFAULT false,
   version INT NOT NULL DEFAULT 1,
   is_active BOOLEAN DEFAULT true,
   created_at TIMESTAMPTZ DEFAULT now(),
   updated_at TIMESTAMPTZ DEFAULT now(),
   created_by UUID REFERENCES auth.users(id),
   UNIQUE(organization_id, skill_id)
 );

 1.3 Add feature flag for V2 onboarding
 ALTER TABLE organizations ADD COLUMN onboarding_version TEXT DEFAULT 'v1';

 Phase 2: Edge Functions

 2.1 Create deep-enrich-organization edge function

 Two-prompt pipeline using Gemini 3 Flash:

 // PROMPT 1: DATA COLLECTION
 // Scrape available sources (website required, others optional)
 const scrapingPipeline = async (domain: string) => {
   const rawContent = {
     website: await scrapeWebsite(domain),  // Required - multiple pages
     linkedin: await trySource(() => scrapeLinkedIn(domain)),
     g2: await trySource(() => scrapeG2Reviews(domain)),
     crunchbase: await trySource(() => fetchCrunchbase(domain)),
   };
   return rawContent;
 };

 const dataCollectionPrompt = `
 Extract structured company data from these web pages.

 **Raw Content:**
 ${rawScrapedContent}

 **Extract this information:**
 {
   "company_name": "",
   "tagline": "",
   "description": "",
   "industry": "",
   "products": [{"name": "", "description": "", "pricing_tier": ""}],
   "value_propositions": [],
   "competitors": [],
   "target_market": "",
   "team_size": "",
   "customer_types": [],
   "key_features": [],
   "content_samples": [],  // Actual text samples for brand voice
   "pain_points_mentioned": [],
   "case_study_customers": []
 }

 Return only valid JSON. Include everything you can find.
 `;

 // PROMPT 2: SKILL GENERATION
 const skillGenerationPrompt = `
 Using this company data, generate personalized sales AI skill configurations.

 **Company Data:**
 ${JSON.stringify(enrichmentData, null, 2)}

 **Generate 5 skills with company-specific configurations:**

 1. **lead_qualification** - Discovery questions specific to selling their products
 2. **lead_enrichment** - Data fields that matter for their industry
 3. **brand_voice** - Tone and language matching their content
 4. **objection_handling** - Responses to objections vs their competitors
 5. **icp** - Specific buyer criteria for their target market

 **Output Format:**
 {
   "lead_qualification": {
     "questions": ["Specific question using their product names..."],
     "scoring_criteria": ["Budget indicator", "Timeline urgency"]
   },
   "lead_enrichment": {
     "priority_fields": ["company_size", "tech_stack"],
     "enrichment_sources": ["linkedin", "crunchbase"]
   },
   "brand_voice": {
     "tone": ["professional", "innovative"],
     "key_phrases": ["from their actual content"],
     "avoid": ["competitor terminology"]
   },
   "objection_handling": {
     "objections": [
       {"objection": "Why not [competitor]?", "response": "Specific response..."}
     ]
   },
   "icp": {
     "industries": ["from their case studies"],
     "company_sizes": ["10-500 employees"],
     "titles": ["VP Sales", "Revenue Operations"],
     "pain_points": ["from their marketing"]
   }
 }

 Be specific. Use actual product names, competitor names, and terms from their content.
 `;

 2.2 Create save-organization-skills edge function
 - Validate and save skill configurations
 - Track ai_generated vs user_modified flags
 - Support version history for rollback

 Phase 3: Frontend Components

 Design code: /Users/andrewbryce/Documents/sixty-sales-dashboard/sales-training.jsx

 Port the components from the design file, adapting for TypeScript and the codebase patterns.

 3.1 Onboarding Steps (from design file)
 Location: /src/pages/onboarding/v2/

 | Component                 | Based On              | Changes                            |
 |---------------------------|-----------------------|------------------------------------|
 | EnrichmentLoadingStep.tsx | EnrichmentLoadingStep | Connect to real API, dynamic tasks |
 | EnrichmentResultStep.tsx  | EnrichmentResultStep  | Show real enrichment data          |
 | SkillsConfigStep.tsx      | SkillConfigStep       | Connect to state, save to DB       |
 | CompletionStep.tsx        | CompletionStep        | Real navigation to dashboard       |

 3.2 Shared UI Components (from design file)
 Location: /src/components/onboarding/

 | Component         | Based On      | Purpose                                     |
 |-------------------|---------------|---------------------------------------------|
 | EditableItem.tsx  | EditableItem  | Inline editable text with icon, edit/delete |
 | EditableTag.tsx   | EditableTag   | Tag chip with edit/remove                   |
 | AddItemButton.tsx | AddItemButton | "+ Add" button with input mode              |

 3.3 Skills Definition (from design file)
 const skills = [
   { id: 'lead_qualification', name: 'Qualification', icon: Target },
   { id: 'lead_enrichment', name: 'Enrichment', icon: Database },
   { id: 'brand_voice', name: 'Brand Voice', icon: MessageSquare },
   { id: 'objection_handling', name: 'Objections', icon: GitBranch },
   { id: 'icp', name: 'ICP', icon: UserCheck },
 ];

 3.4 Skill Data Structures (from design file)
 interface SkillData {
   lead_qualification: {
     criteria: string[];
     disqualifiers: string[];
   };
   lead_enrichment: {
     questions: string[];
   };
   brand_voice: {
     tone: string;
     avoid: string[];
   };
   objection_handling: {
     objections: { trigger: string; response: string }[];
   };
   icp: {
     companyProfile: string;
     buyerPersona: string;
     buyingSignals: string[];
   };
 }

 3.5 Flow (skipping SignupStep as per requirements)
 EnrichmentLoadingStep → EnrichmentResultStep → SkillsConfigStep → CompletionStep

 Phase 4: Loading Animation Design

 [Logo placeholder animates in]
      ↓
 "Analyzing sixtyseconds.co..."
      ↓
 [Progress bar: 15%]
 "Found your website • Extracting products..."
      ↓
 [Products appear one by one with stagger animation]
 • AI workflows
 • Video personalization
 • Sales automation
      ↓
 [Progress bar: 35%]
 "Identifying competitors..."
      ↓
 [Competitor logos fade in]
 Vidyard • Loom • Outreach
      ↓
 [Progress bar: 55%]
 "Studying your team on LinkedIn..."
      ↓
 [Key people appear]
 👤 CEO - John Smith
 👤 Head of Sales - Jane Doe
      ↓
 [Progress bar: 75%]
 "Understanding your ideal customers..."
      ↓
 [ICP preview fades in]
 B2B Sales Teams • 50-500 employees • SaaS
      ↓
 [Progress bar: 95%]
 "Generating your personalized sales AI..."
      ↓
 [Completion animation - confetti or subtle celebration]

 Phase 5: Skill Generation Details

 | Skill         | AI Generates
  | From Sources                           |
 |---------------|------------------------------------------------------------------------------------------
 -|----------------------------------------|
 | Qualification | 5-7 discovery questions specific to their product, budget qualifiers, timeline indicators
  | Products, pricing, case studies        |
 | Enrichment    | Priority data fields, enrichment sources, scoring weights
  | ICP, target market                     |
 | Brand Voice   | Tone descriptors, example phrases, words to avoid, competitor differentiation
  | Website copy, marketing content        |
 | Objections    | 5-8 objection-response pairs with competitor mentions
  | G2 reviews, competitor analysis        |
 | ICP           | Target industries, company sizes, job titles, pain points, buying triggers
  | LinkedIn data, case studies, job posts |

 Phase 6: Simulator Updates

 6.1 Add "Version Control" tab
 - Toggle between V1 and V2
 - Shows which is currently live
 - Preview both versions

 6.2 Mock enrichment for simulator
 const mockEnrichment = {
   company_name: 'Acme Corp',
   products: ['Widget Pro', 'Widget Enterprise'],
   competitors: ['CompetitorA', 'CompetitorB'],
   // ... full mock data
 };

 Phase 7: Feature Flags

 7.1 Global toggle for new signups
 // Admin can toggle in simulator
 export function setLiveOnboardingVersion(version: 'v1' | 'v2'): void {
   // Stored in database, affects all new signups
 }

 File Structure

 src/
 ├── pages/onboarding/
 │   ├── index.tsx                         # Router
 │   ├── v2/
 │   │   ├── DeepEnrichmentLoadingStep.tsx # Animated scraping display
 │   │   ├── CompanyIntelReviewStep.tsx    # Review/edit enrichment
 │   │   ├── SkillsConfigStep.tsx          # Configure 5 skills
 │   │   └── CompletionStep.tsx            # Success + next steps
 ├── components/onboarding/
 │   ├── EnrichmentCard.tsx
 │   ├── SourceBadge.tsx
 │   ├── EditableItem.tsx
 │   ├── EditableTag.tsx
 │   ├── ConfidenceBadge.tsx
 │   └── SkillPreview.tsx
 ├── lib/
 │   ├── stores/onboardingV2Store.ts
 │   └── utils/featureFlags.ts
 supabase/
 ├── migrations/
 │   ├── YYYYMMDD_organization_enrichment.sql
 │   └── YYYYMMDD_organization_skills.sql
 └── functions/
     ├── deep-enrich-organization/
     ├── generate-skills-from-enrichment/
     └── save-organization-skills/

 Success Criteria

 - Website scraping always works (required source)
 - Additional sources enriched when available
 - Prompt 1 (Data Collection) extracts structured company data
 - Prompt 2 (Skill Generation) creates company-specific suggestions
 - Loading shows progressive reveal of discovered info
 - Skills are pre-filled with specific, relevant suggestions
 - User can edit/refine AI suggestions
 - Skills saved to database for AI to use
 - Simulator can preview both V1 and V2
 - Admin can toggle live version
 - Total onboarding time < 2 minutes