/**
 * LandingPageV6 — Electric Depth Redesign
 *
 * Style: High-contrast dark (Clash Display + zinc-950 + violet accent)
 * Upgrades from V5:
 *   - Distinctive display font (Clash Display 700)
 *   - Asymmetric layouts (3:2 grids instead of 1:1)
 *   - Bento feature grid (large + small cards)
 *   - Gradient border CTA
 *   - Dot grid + grid line atmosphere effects
 *   - Richer hover micro-interactions on cards
 *
 * The interactive demo-v2 flow is UNCHANGED — proven conversion mechanism.
 *
 * Route: /v6 (A/B testable against /v5 and /)
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

// V6 Sections
import { NavbarV6 } from '../components/landing-v6/NavbarV6';
import { HeroV6 } from '../components/landing-v6/HeroV6';
import { ProofBarV6 } from '../components/landing-v6/ProofBarV6';
import { ProblemV6 } from '../components/landing-v6/ProblemV6';
import { SolutionV6 } from '../components/landing-v6/SolutionV6';
import { DemoGateV6 } from '../components/landing-v6/DemoGateV6';
import { HowItWorksV6 } from '../components/landing-v6/HowItWorksV6';
import { FeaturesV6 } from '../components/landing-v6/FeaturesV6';
import { TestimonialsV6 } from '../components/landing-v6/TestimonialsV6';
import { FinalCTAV6 } from '../components/landing-v6/FinalCTAV6';
import { FooterV6 } from '../components/landing-v6/FooterV6';

type DemoPhase = 'idle' | 'research' | 'showcase' | 'recap' | 'signup';

export function LandingPageV6() {
  useForceDarkMode();

  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle');
  const research = useDemoResearch();
  const heroInputRef = useRef<HTMLInputElement | null>(null);
  const demoRef = useRef<HTMLDivElement>(null);

  const handleTryFree = useCallback(() => {
    if (demoPhase !== 'idle') return;
    heroInputRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [demoPhase]);

  const handleUrlSubmit = useCallback((url: string) => {
    research.start(url);
    setDemoPhase('research');
    setTimeout(() => {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [research]);

  const handleResearchComplete = useCallback(() => setDemoPhase('showcase'), []);
  const handleShowcaseComplete = useCallback(() => setDemoPhase('recap'), []);
  const handleRecapContinue = useCallback(() => setDemoPhase('signup'), []);

  useEffect(() => {
    if (demoPhase !== 'idle') {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [demoPhase]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-x-hidden">
      <NavbarV6 onTryFree={handleTryFree} />

      {/* Pre-demo sections */}
      {demoPhase === 'idle' && (
        <>
          <HeroV6 onSubmit={handleUrlSubmit} inputRef={heroInputRef} />
          <ProofBarV6 />
          <ProblemV6 />
          <SolutionV6 />
          <DemoGateV6 onSubmit={handleUrlSubmit} />
          <HowItWorksV6 />
          <FeaturesV6 />
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

      {/* Post-demo sections */}
      {demoPhase === 'idle' && (
        <>
          <TestimonialsV6 />
          <FinalCTAV6 onTryFree={handleTryFree} />
          <FooterV6 />
        </>
      )}
    </div>
  );
}

export default LandingPageV6;
