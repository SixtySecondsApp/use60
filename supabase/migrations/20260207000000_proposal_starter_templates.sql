-- Migration: STR-001 - Seed 5 built-in starter templates
-- Global templates (org_id=NULL) visible to all users.
-- Each template defines a sensible default section structure and neutral brand_config.

-- Idempotent: uses ON CONFLICT DO NOTHING on a composite check.
-- Since proposal_templates has no natural unique constraint for this seed,
-- we use a simple existence check.

DO $$
BEGIN
  -- Only seed if no global starter templates exist yet
  IF NOT EXISTS (
    SELECT 1 FROM proposal_templates WHERE org_id IS NULL AND category = 'starter' LIMIT 1
  ) THEN

    -- 1. Training Programme
    INSERT INTO proposal_templates (name, description, org_id, category, sections, brand_config)
    VALUES (
      'Training Programme',
      'Structured training proposal with curriculum overview, learning objectives, schedule, and pricing.',
      NULL,
      'starter',
      '[
        {"id":"cover","type":"cover","title":"Training Programme Proposal","content":"","order":0},
        {"id":"exec","type":"executive_summary","title":"Executive Summary","content":"<p>Overview of the proposed training programme, objectives, and expected outcomes.</p>","order":1},
        {"id":"problem","type":"problem","title":"Training Needs Assessment","content":"<p>Analysis of current skill gaps and training requirements identified during discussions.</p>","order":2},
        {"id":"solution","type":"solution","title":"Proposed Curriculum","content":"<p>Detailed curriculum covering modules, topics, and learning materials.</p>","order":3},
        {"id":"approach","type":"approach","title":"Delivery Methodology","content":"<p>Training delivery format: in-person workshops, virtual sessions, self-paced modules, or blended approach.</p>","order":4},
        {"id":"timeline","type":"timeline","title":"Schedule & Milestones","content":"<p>Proposed training schedule with key milestones and completion targets.</p>","order":5},
        {"id":"pricing","type":"pricing","title":"Investment","content":"<p>Pricing breakdown by module, including materials and facilitator costs.</p>","order":6},
        {"id":"terms","type":"terms","title":"Terms & Next Steps","content":"<p>Engagement terms, cancellation policy, and next steps to proceed.</p>","order":7}
      ]'::jsonb,
      '{"primary_color":"#1e40af","secondary_color":"#64748b","font_family":"Inter, system-ui, sans-serif"}'::jsonb
    );

    -- 2. Consulting Engagement
    INSERT INTO proposal_templates (name, description, org_id, category, sections, brand_config)
    VALUES (
      'Consulting Engagement',
      'Professional consulting proposal with discovery findings, recommendations, phases, and fees.',
      NULL,
      'starter',
      '[
        {"id":"cover","type":"cover","title":"Consulting Proposal","content":"","order":0},
        {"id":"exec","type":"executive_summary","title":"Executive Summary","content":"<p>High-level overview of the engagement scope, approach, and expected business impact.</p>","order":1},
        {"id":"problem","type":"problem","title":"Current Challenges","content":"<p>Key challenges and pain points identified during the discovery phase.</p>","order":2},
        {"id":"solution","type":"solution","title":"Recommendations","content":"<p>Strategic recommendations with rationale and expected outcomes for each.</p>","order":3},
        {"id":"approach","type":"approach","title":"Engagement Approach","content":"<p>Phased approach: Discovery, Analysis, Strategy Development, Implementation Support.</p>","order":4},
        {"id":"timeline","type":"timeline","title":"Project Timeline","content":"<p>Detailed project timeline with phase durations, deliverables, and review checkpoints.</p>","order":5},
        {"id":"pricing","type":"pricing","title":"Fees & Investment","content":"<p>Fee structure: fixed-fee phases, day rates, or retainer options with payment schedule.</p>","order":6},
        {"id":"terms","type":"terms","title":"Terms & Conditions","content":"<p>Engagement terms including scope boundaries, IP ownership, confidentiality, and termination.</p>","order":7}
      ]'::jsonb,
      '{"primary_color":"#0f172a","secondary_color":"#475569","font_family":"Inter, system-ui, sans-serif"}'::jsonb
    );

    -- 3. SaaS Onboarding
    INSERT INTO proposal_templates (name, description, org_id, category, sections, brand_config)
    VALUES (
      'SaaS Onboarding',
      'Software implementation proposal with setup phases, integrations, training, and subscription pricing.',
      NULL,
      'starter',
      '[
        {"id":"cover","type":"cover","title":"SaaS Implementation Proposal","content":"","order":0},
        {"id":"exec","type":"executive_summary","title":"Executive Summary","content":"<p>Overview of the platform, how it addresses your requirements, and implementation approach.</p>","order":1},
        {"id":"problem","type":"problem","title":"Current Pain Points","content":"<p>Inefficiencies and challenges in your current workflow that our platform resolves.</p>","order":2},
        {"id":"solution","type":"solution","title":"Platform Solution","content":"<p>Feature overview, key capabilities, and how they map to your specific requirements.</p>","order":3},
        {"id":"approach","type":"approach","title":"Implementation Plan","content":"<p>Phased rollout: Account Setup, Data Migration, Integration Configuration, User Training, Go-Live.</p>","order":4},
        {"id":"timeline","type":"timeline","title":"Onboarding Timeline","content":"<p>Typical onboarding timeline from kickoff to full adoption, including support milestones.</p>","order":5},
        {"id":"pricing","type":"pricing","title":"Subscription & Pricing","content":"<p>Subscription tiers, per-seat pricing, implementation fees, and ongoing support costs.</p>","order":6},
        {"id":"terms","type":"terms","title":"Service Agreement","content":"<p>SLA commitments, data handling, uptime guarantees, and contract terms.</p>","order":7}
      ]'::jsonb,
      '{"primary_color":"#7c3aed","secondary_color":"#6b7280","font_family":"Inter, system-ui, sans-serif"}'::jsonb
    );

    -- 4. Monthly Retainer
    INSERT INTO proposal_templates (name, description, org_id, category, sections, brand_config)
    VALUES (
      'Monthly Retainer',
      'Ongoing services retainer proposal with scope, deliverables, hours allocation, and monthly fees.',
      NULL,
      'starter',
      '[
        {"id":"cover","type":"cover","title":"Retainer Services Proposal","content":"","order":0},
        {"id":"exec","type":"executive_summary","title":"Executive Summary","content":"<p>Overview of the proposed retainer arrangement, scope of services, and value proposition.</p>","order":1},
        {"id":"problem","type":"problem","title":"Why a Retainer","content":"<p>Benefits of an ongoing partnership versus project-based engagements.</p>","order":2},
        {"id":"solution","type":"solution","title":"Services Included","content":"<p>Detailed list of services covered under the retainer with monthly deliverables.</p>","order":3},
        {"id":"approach","type":"approach","title":"Working Model","content":"<p>Communication cadence, reporting structure, monthly reviews, and escalation process.</p>","order":4},
        {"id":"timeline","type":"timeline","title":"Engagement Structure","content":"<p>Contract duration, renewal terms, ramp-up period, and quarterly review schedule.</p>","order":5},
        {"id":"pricing","type":"pricing","title":"Monthly Investment","content":"<p>Monthly retainer fee, included hours, overage rates, and payment terms.</p>","order":6},
        {"id":"terms","type":"terms","title":"Agreement Terms","content":"<p>Notice period, scope change process, unused hours policy, and confidentiality.</p>","order":7}
      ]'::jsonb,
      '{"primary_color":"#059669","secondary_color":"#6b7280","font_family":"Inter, system-ui, sans-serif"}'::jsonb
    );

    -- 5. Custom Proposal
    INSERT INTO proposal_templates (name, description, org_id, category, sections, brand_config)
    VALUES (
      'Custom Proposal',
      'Flexible proposal template with minimal structure — adapt freely to any engagement type.',
      NULL,
      'starter',
      '[
        {"id":"cover","type":"cover","title":"Proposal","content":"","order":0},
        {"id":"exec","type":"executive_summary","title":"Overview","content":"<p>Brief overview of what is being proposed and why.</p>","order":1},
        {"id":"solution","type":"solution","title":"Our Approach","content":"<p>Description of the proposed solution, methodology, or deliverables.</p>","order":2},
        {"id":"timeline","type":"timeline","title":"Timeline","content":"<p>Estimated timeline and key milestones.</p>","order":3},
        {"id":"pricing","type":"pricing","title":"Investment","content":"<p>Pricing and payment terms.</p>","order":4},
        {"id":"terms","type":"terms","title":"Next Steps","content":"<p>How to proceed and key terms.</p>","order":5}
      ]'::jsonb,
      '{"primary_color":"#1e40af","secondary_color":"#64748b","font_family":"Inter, system-ui, sans-serif"}'::jsonb
    );

    RAISE NOTICE 'Seeded 5 global starter templates for proposal generator';

  ELSE
    RAISE NOTICE 'Starter templates already exist, skipping seed';
  END IF;
END $$;
