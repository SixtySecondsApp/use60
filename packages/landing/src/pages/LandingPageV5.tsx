/**
 * LandingPageV5 — SVG-Animated Redesign
 *
 * Cinema-grade visual narrative: chaos of sales admin → 60 brings order → everything handled.
 * Every section has intentional SVG animations. The interactive demo-v2 flow is the
 * proven conversion mechanism and stays unchanged.
 *
 * Route: /v5 (A/B testable against current /)
 *
 * Visitor paths:
 *   Ideal:    Hero input → Demo flow → Signup (~90s)
 *   Cautious: Hero → Proof → Problem → Solution → Demo Gate → Demo → Signup (~2-3min)
 *   Skeptic:  Full scroll → Testimonials → Final CTA (~3-4min)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useForceDarkMode } from '../lib/hooks/useForceDarkMode';
import { useDemoResearch } from '../demo/useDemoResearch';
import { AgentResearch } from '../demo-v2/AgentResearch';
import { ProductShowcase } from '../demo-v2/ProductShowcase';
import { WeekRecap } from '../demo-v2/WeekRecap';
import { DemoSignup } from '../demo-v2/DemoSignup';

// V5 Sections
import { NavbarV5 } from '../components/landing-v5/NavbarV5';
import { HeroV5 } from '../components/landing-v5/HeroV5';
import { ProofBarV5 } from '../components/landing-v5/ProofBarV5';
import { ProblemV5 } from '../components/landing-v5/ProblemV5';
import { SolutionV5 } from '../components/landing-v5/SolutionV5';
import { DemoGateV5 } from '../components/landing-v5/DemoGateV5';
import { HowItWorksV5 } from '../components/landing-v5/HowItWorksV5';
import { FeaturesV5 } from '../components/landing-v5/FeaturesV5';
import { TestimonialsV5 } from '../components/landing-v5/TestimonialsV5';
import { FinalCTAV5 } from '../components/landing-v5/FinalCTAV5';
import { FooterV5 } from '../components/landing-v5/FooterV5';

type DemoPhase = 'idle' | 'research' | 'showcase' | 'recap' | 'signup';

export function LandingPageV5() {
  useForceDarkMode();

  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle');
  const research = useDemoResearch();
  const heroInputRef = useRef<HTMLInputElement | null>(null);
  const demoRef = useRef<HTMLDivElement>(null);

  // Focus hero input when "Try Free" clicked
  const handleTryFree = useCallback(() => {
    if (demoPhase !== 'idle') return;
    heroInputRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [demoPhase]);

  // Start demo when URL submitted from hero or demo gate
  const handleUrlSubmit = useCallback((url: string) => {
    research.start(url);
    setDemoPhase('research');

    // Scroll to demo area
    setTimeout(() => {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [research]);

  // Demo phase transitions
  const handleResearchComplete = useCallback(() => setDemoPhase('showcase'), []);
  const handleShowcaseComplete = useCallback(() => setDemoPhase('recap'), []);
  const handleRecapContinue = useCallback(() => setDemoPhase('signup'), []);

  // Scroll to top on demo phase change
  useEffect(() => {
    if (demoPhase !== 'idle') {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [demoPhase]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-x-hidden">
      <NavbarV5 onTryFree={handleTryFree} />

      {/* Pre-demo sections — hidden once demo starts */}
      {demoPhase === 'idle' && (
        <>
          <HeroV5 onSubmit={handleUrlSubmit} inputRef={heroInputRef} />
          <ProofBarV5 />
          <ProblemV5 />
          <SolutionV5 />
          <DemoGateV5 onSubmit={handleUrlSubmit} />
          <HowItWorksV5 />
          <FeaturesV5 />
        </>
      )}

      {/* Demo area */}
      <div ref={demoRef}>
        <AnimatePresence mode="wait">
          {demoPhase === 'research' && (
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

          {demoPhase === 'showcase' && research.research && (
            <ProductShowcase
              key="showcase"
              data={research.research}
              onComplete={handleShowcaseComplete}
            />
          )}

          {demoPhase === 'recap' && research.research && (
            <WeekRecap
              key="recap"
              data={research.research}
              onContinue={handleRecapContinue}
            />
          )}

          {demoPhase === 'signup' && (
            <DemoSignup
              key="signup"
              companyName={research.research?.company.name ?? ''}
              stats={research.research?.stats ?? null}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Post-demo sections — visible when demo is idle */}
      {demoPhase === 'idle' && (
        <>
          <TestimonialsV5 />
          <FinalCTAV5 onTryFree={handleTryFree} />
          <FooterV5 />
        </>
      )}
    </div>
  );
}

export default LandingPageV5;
