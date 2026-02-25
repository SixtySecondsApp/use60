/**
 * DemoExperience
 *
 * Main orchestrator for the interactive demo flow.
 * Manages step transitions and passes research data through all phases.
 */

import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { DemoStep } from './demo-types';
import { useDemoResearch } from './useDemoResearch';
import { DemoHero } from './DemoHero';
import { ValueBridge } from './ValueBridge';
import { AgentResearch } from './AgentResearch';
import { BentoShowcase } from './BentoShowcase';
import { ResultsSummary } from './ResultsSummary';
import { DemoCopilot } from './DemoCopilot';
import { DemoSignup } from './DemoSignup';

/**
 * Demo flow (6 steps):
 *   hero → bridge → research → bento → results → copilot → signup
 *
 * Skills onboarding is deferred to post-signup — we already have enough
 * context from the research to power the demo, and removing it shortens
 * the funnel by one step.
 */
export default function DemoExperience() {
  const [step, setStep] = useState<DemoStep>('hero');
  const [url, setUrl] = useState('');
  const research = useDemoResearch();

  // Scroll to top on step change for consistent positioning
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step]);

  const handleUrlSubmit = useCallback(
    (submittedUrl: string) => {
      setUrl(submittedUrl);
      // Fire the API call immediately — runs during the ValueBridge animation
      // giving us a ~6s head start before the research screen appears
      research.start(submittedUrl);
      setStep('bridge');
    },
    [research]
  );

  const handleBridgeComplete = useCallback(() => {
    setStep('research');
  }, []);

  const handleResearchComplete = useCallback(() => {
    setStep('bento');
  }, []);

  const handleBentoComplete = useCallback(() => {
    setStep('results');
  }, []);

  const handleResultsContinue = useCallback(() => {
    setStep('copilot');
  }, []);

  const handleCopilotContinue = useCallback(() => {
    setStep('signup');
  }, []);

  return (
    <div className="dark">
      <div className="min-h-screen bg-gray-950 text-gray-100 overflow-x-hidden">
        <AnimatePresence mode="wait">
          {step === 'hero' && (
            <DemoHero key="hero" onSubmit={handleUrlSubmit} />
          )}

          {step === 'bridge' && (
            <ValueBridge
              key="bridge"
              companyDomain={url}
              onComplete={handleBridgeComplete}
            />
          )}

          {step === 'research' && (
            <AgentResearch
              key="research"
              agents={research.agents}
              isComplete={research.isComplete}
              isAnimationDone={research.isAnimationDone}
              stats={research.research?.stats ?? null}
              onComplete={handleResearchComplete}
            />
          )}

          {step === 'bento' && research.research && (
            <BentoShowcase
              key="bento"
              data={research.research}
              onComplete={handleBentoComplete}
            />
          )}

          {step === 'results' && research.research && (
            <ResultsSummary
              key="results"
              stats={research.research.stats}
              companyName={research.research.company.name}
              onContinue={handleResultsContinue}
            />
          )}

          {step === 'copilot' && research.research && (
            <DemoCopilot
              key="copilot"
              research={research.research}
              onContinue={handleCopilotContinue}
            />
          )}

          {step === 'signup' && (
            <DemoSignup
              key="signup"
              companyName={research.research?.company.name ?? ''}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
