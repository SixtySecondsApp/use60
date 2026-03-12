/**
 * SandboxExperience
 *
 * Top-level orchestrator for the sandbox demo flow on the homepage.
 * Manages the transition: research complete → entrance animation → interactive sandbox.
 *
 * Usage in LandingPage:
 *   <SandboxExperience research={researchData} onSignup={handleSignup} />
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SandboxApp } from './SandboxApp';
import { SandboxEntrance } from './SandboxEntrance';
import { generatePersonalizedData, type ResearchInput, type VisitorInfo, type PersonalizedContent } from './data/generatePersonalizedData';
import type { ResearchData } from '../demo/demo-types';
import type { SandboxData } from './data/sandboxTypes';

type SandboxPhase = 'entrance' | 'sandbox';

interface SandboxExperienceProps {
  /** Research data from useDemoResearch hook */
  research: ResearchData;
  /** Optional visitor info (from /t/{code} campaign) */
  visitor?: VisitorInfo;
  /** Campaign code for attribution tracking (from /t/{code}) */
  campaignCode?: string;
  /** Campaign link UUID for visitor tracking attribution */
  campaignLinkId?: string;
  /** Called when user clicks the signup CTA */
  onSignup?: () => void;
  className?: string;
}

/** Convert demo-types ResearchData → sandbox ResearchInput */
function toResearchInput(data: ResearchData): ResearchInput {
  return {
    company: {
      name: data.company.name,
      domain: data.company.domain,
      vertical: data.company.vertical,
      product_summary: data.company.product_summary,
      value_props: data.company.value_props,
      employee_range: data.company.employee_range,
      competitors: data.company.competitors,
    },
    demo_actions: {
      cold_outreach: data.demo_actions.cold_outreach
        ? {
            target_name: data.demo_actions.cold_outreach.target_name,
            target_title: data.demo_actions.cold_outreach.target_title,
            target_company: data.demo_actions.cold_outreach.target_company,
            personalised_hook: data.demo_actions.cold_outreach.personalised_hook,
            email_preview: data.demo_actions.cold_outreach.email_preview,
          }
        : undefined,
      meeting_prep: data.demo_actions.meeting_prep
        ? {
            attendee_name: data.demo_actions.meeting_prep.attendee_name,
            attendee_company: data.demo_actions.meeting_prep.attendee_company,
            context: data.demo_actions.meeting_prep.context,
            talking_points: data.demo_actions.meeting_prep.talking_points,
          }
        : undefined,
      pipeline_action: data.demo_actions.pipeline_action
        ? {
            deal_name: data.demo_actions.pipeline_action.deal_name,
            deal_value: data.demo_actions.pipeline_action.deal_value,
            health_score: data.demo_actions.pipeline_action.health_score,
            risk_signal: data.demo_actions.pipeline_action.risk_signal,
            suggested_action: data.demo_actions.pipeline_action.suggested_action,
            signals: data.demo_actions.pipeline_action.signals,
          }
        : undefined,
    },
    stats: {
      signals_found: data.stats.signals_found,
      contacts_identified: data.stats.contacts_identified,
    },
  };
}

/**
 * Fetch deep product research from the demo-research edge function.
 * Returns full ResearchData including company product/service info,
 * plus AI-generated email/meeting content based on website scraping.
 * Fire-and-forget — failure is silent, demo works without it.
 */
async function fetchDeepResearch(
  domain: string,
  companyName: string,
  visitor?: VisitorInfo
): Promise<{ research: ResearchInput; aiContent: PersonalizedContent } | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !anonKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(`${supabaseUrl}/functions/v1/demo-research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        domain,
        company_name: companyName,
        visitor_name: visitor?.first_name ? `${visitor.first_name} ${visitor.last_name ?? ''}`.trim() : undefined,
        visitor_title: visitor?.title,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const json = await res.json();
    if (!json.success || !json.data) return null;

    const data = json.data;

    // Extract company research data
    const research: ResearchInput = {
      company: {
        name: data.company?.name,
        domain: data.company?.domain,
        vertical: data.company?.vertical,
        product_summary: data.company?.product_summary,
        value_props: data.company?.value_props,
        employee_range: data.company?.employee_range,
        competitors: data.company?.competitors,
      },
    };

    // Extract AI-generated content for email/meeting
    const aiContent: PersonalizedContent = {
      email_draft: data.demo_actions?.cold_outreach ? {
        subject: `Re: ${data.demo_actions.cold_outreach.target_company} — next steps`,
        body: data.demo_actions.cold_outreach.email_preview,
      } : undefined,
      meeting_prep: data.demo_actions?.meeting_prep ? {
        company_overview: `${data.demo_actions.meeting_prep.attendee_company} — ${data.demo_actions.meeting_prep.context}`,
        talking_points: data.demo_actions.meeting_prep.talking_points,
        risk_signals: data.demo_actions?.pipeline_action?.signals
          ?.filter((s: { type: string }) => s.type === 'warning')
          .map((s: { label: string }) => s.label) ?? [],
        questions_to_ask: [
          'What does your current process look like and where are the biggest bottlenecks?',
          'How are you measuring ROI on solutions like this today?',
          'Who else needs to be involved in the decision before we can move forward?',
        ],
        deal_context: data.demo_actions?.pipeline_action
          ? `${data.demo_actions.pipeline_action.deal_value} deal, health score ${data.demo_actions.pipeline_action.health_score}/100. ${data.demo_actions.pipeline_action.risk_signal}`
          : undefined,
      } : undefined,
    };

    return { research, aiContent };
  } catch {
    return null;
  }
}

export function SandboxExperience({
  research,
  visitor,
  campaignCode,
  campaignLinkId,
  onSignup,
  className = '',
}: SandboxExperienceProps) {
  const [phase, setPhase] = useState<SandboxPhase>('entrance');
  const [deepResearchData, setDeepResearchData] = useState<Partial<SandboxData> | null>(null);
  const deepResearchFired = useRef(false);

  const companyName = research.company.name || 'Your company';
  const domain = visitor?.domain || research.company.domain;

  // Phase 1: Generate instant sandbox data from basic research
  const sandboxData: SandboxData = useMemo(
    () => generatePersonalizedData(toResearchInput(research), visitor),
    [research, visitor]
  );

  // Phase 2: Fire deep research during entrance animation (runs in parallel)
  useEffect(() => {
    if (deepResearchFired.current || !domain) return;
    deepResearchFired.current = true;

    fetchDeepResearch(domain, companyName, visitor).then((result) => {
      if (!result) return;

      // Merge deep research company data with existing research input
      const baseResearch = toResearchInput(research);
      const enrichedResearch: ResearchInput = {
        ...baseResearch,
        company: {
          ...baseResearch.company,
          ...result.research.company,
          // Keep original values as fallback, override with deep research
          name: result.research.company?.name || baseResearch.company?.name,
        },
      };

      // Re-generate full sandbox data with real product/service info + AI content
      const enriched = generatePersonalizedData(
        enrichedResearch,
        visitor,
        result.aiContent
      );

      // Pass through all enriched data — company info, email, meetings
      setDeepResearchData({
        emailDraft: enriched.emailDraft,
        meetings: enriched.meetings,
      });
    });
  }, [domain, companyName, visitor, research]);

  const handleEntranceComplete = useCallback(() => {
    setPhase('sandbox');
  }, []);

  return (
    <div className={className}>
      <AnimatePresence mode="wait">
        {phase === 'entrance' && (
          <motion.div
            key="entrance"
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <SandboxEntrance
              companyName={companyName}
              domain={domain}
              isReady={true}
              onComplete={handleEntranceComplete}
            />
          </motion.div>
        )}

        {phase === 'sandbox' && (
          <motion.div
            key="sandbox"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className=""
          >
            <SandboxApp
              data={sandboxData}
              initialView="dashboard"
              visitorName={visitor?.first_name ? `${visitor.first_name} ${visitor.last_name ?? ''}`.trim() : undefined}
              visitorEmail={visitor?.email}
              visitorDomain={domain}
              campaignCode={campaignCode}
              campaignLinkId={campaignLinkId}
              deepResearchData={deepResearchData}
              onSignup={onSignup}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
