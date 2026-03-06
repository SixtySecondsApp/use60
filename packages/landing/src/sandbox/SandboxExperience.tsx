/**
 * SandboxExperience
 *
 * Top-level orchestrator for the sandbox demo flow on the homepage.
 * Manages the transition: research complete → entrance animation → interactive sandbox.
 *
 * Usage in LandingPage:
 *   <SandboxExperience research={researchData} onSignup={handleSignup} />
 */

import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SandboxApp } from './SandboxApp';
import { SandboxEntrance } from './SandboxEntrance';
import { generatePersonalizedData, type ResearchInput, type VisitorInfo } from './data/generatePersonalizedData';
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

export function SandboxExperience({
  research,
  visitor,
  campaignCode,
  campaignLinkId,
  onSignup,
  className = '',
}: SandboxExperienceProps) {
  const [phase, setPhase] = useState<SandboxPhase>('entrance');

  const companyName = research.company.name || 'Your company';

  // Generate personalized sandbox data from research
  const sandboxData: SandboxData = useMemo(
    () => generatePersonalizedData(toResearchInput(research), visitor),
    [research, visitor]
  );

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
              visitorDomain={visitor?.domain || research.company.domain}
              campaignCode={campaignCode}
              campaignLinkId={campaignLinkId}
              onSignup={onSignup}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
