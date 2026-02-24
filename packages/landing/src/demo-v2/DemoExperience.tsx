/**
 * DemoExperience V2
 *
 * 5-step flow — maximum excitement then signup:
 *   hero → research → showcase → recap → signup
 */

import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { DemoStep } from './demo-types';
import { useDemoResearch } from '../demo/useDemoResearch';
import { DemoHero } from './DemoHero';
import { AgentResearch } from './AgentResearch';
import { ProductShowcase } from './ProductShowcase';
import { WeekRecap } from './WeekRecap';
import { DemoSignup } from './DemoSignup';

export default function DemoExperience() {
  const [step, setStep] = useState<DemoStep>('hero');
  const [url, setUrl] = useState('');
  const research = useDemoResearch();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step]);

  const handleUrlSubmit = useCallback(
    (submittedUrl: string) => {
      setUrl(submittedUrl);
      research.start(submittedUrl);
      setStep('research');
    },
    [research]
  );

  const handleResearchComplete = useCallback(() => {
    setStep('showcase');
  }, []);

  const handleShowcaseComplete = useCallback(() => {
    setStep('recap');
  }, []);

  const handleRecapContinue = useCallback(() => {
    setStep('signup');
  }, []);

  return (
    <div className="dark">
      <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-x-hidden">
        <AnimatePresence mode="wait">
          {step === 'hero' && (
            <DemoHero key="hero" onSubmit={handleUrlSubmit} />
          )}

          {step === 'research' && (
            <AgentResearch
              key="research"
              agents={research.agents}
              isComplete={research.isComplete}
              isAnimationDone={research.isAnimationDone}
              stats={research.research?.stats ?? null}
              companyName={research.research?.company?.name ?? null}
              onComplete={handleResearchComplete}
            />
          )}

          {step === 'showcase' && research.research && (
            <ProductShowcase
              key="showcase"
              data={research.research}
              onComplete={handleShowcaseComplete}
            />
          )}

          {step === 'recap' && research.research && (
            <WeekRecap
              key="recap"
              data={research.research}
              onContinue={handleRecapContinue}
            />
          )}

          {step === 'signup' && (
            <DemoSignup
              key="signup"
              companyName={research.research?.company.name ?? ''}
              stats={research.research?.stats ?? null}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
