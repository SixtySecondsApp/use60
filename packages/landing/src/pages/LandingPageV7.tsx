/**
 * LandingPageV7 — Refined Depth
 *
 * Style: Ultra-dark (#0c0c0c) + stone palette + purple accent + amber AHA moment
 * Upgrades from V6:
 *   - Cleaner token system (no glow, no grid bg, no gradient text)
 *   - Feature grid with sub-items and skill badges
 *   - Full-day workflow case study with amber AHA accent
 *   - Tech credibility section with real architecture numbers
 *   - Deeper product showcase (4 tabbed panels)
 *   - Integration grid by category
 *
 * The interactive demo-v2 flow is UNCHANGED — proven conversion mechanism.
 *
 * Route: / (production) and /v7 (direct access)
 *
 * Visitor paths:
 *   Ideal:    Hero input -> Demo flow -> Signup (~90s)
 *   Cautious: Hero -> Proof -> Problem -> Solution -> Demo Gate -> Demo -> Signup (~2-3min)
 *   Skeptic:  Full scroll -> Testimonials -> Final CTA (~3-4min)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useForceDarkMode } from '../lib/hooks/useForceDarkMode';
import { useDemoResearch } from '../demo/useDemoResearch';
import { AgentResearch } from '../demo-v2/AgentResearch';
import { ProductShowcase as DemoShowcase } from '../demo-v2/ProductShowcase';
import { WeekRecap } from '../demo-v2/WeekRecap';
import { DemoSignup } from '../demo-v2/DemoSignup';

// V7 Sections
import { NavbarV7 } from '../components/landing-v7/NavbarV7';
import { HeroV7 } from '../components/landing-v7/HeroV7';
import { ProofBarV7 } from '../components/landing-v7/ProofBarV7';
import { ProductShowcaseV7 } from '../components/landing-v7/ProductShowcaseV7';
import { ProblemV7 } from '../components/landing-v7/ProblemV7';
import { ArchitectureV7 } from '../components/landing-v7/ArchitectureV7';
import { DeepDiveFollowupsV7 } from '../components/landing-v7/DeepDiveFollowupsV7';
import { DeepDiveMeetingPrepV7 } from '../components/landing-v7/DeepDiveMeetingPrepV7';
import { HowItWorksV7 } from '../components/landing-v7/HowItWorksV7';
import { FeatureGridV7 } from '../components/landing-v7/FeatureGridV7';
import { IntegrationGridV7 } from '../components/landing-v7/IntegrationGridV7';
import { WorkflowCaseStudyV7 } from '../components/landing-v7/WorkflowCaseStudyV7';
import { TestimonialsV7 } from '../components/landing-v7/TestimonialsV7';
import { TechCredibilityV7 } from '../components/landing-v7/TechCredibilityV7';
import { FinalCTAV7 } from '../components/landing-v7/FinalCTAV7';
import { FooterV7 } from '../components/landing-v7/FooterV7';

type DemoPhase = 'idle' | 'research' | 'showcase' | 'recap' | 'signup';

export function LandingPageV7() {
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

  const handleUrlSubmit = useCallback(
    (url: string) => {
      research.start(url);
      setDemoPhase('research');
      setTimeout(() => {
        demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    },
    [research],
  );

  const handleResearchComplete = useCallback(() => setDemoPhase('showcase'), []);
  const handleShowcaseComplete = useCallback(() => setDemoPhase('recap'), []);
  const handleRecapContinue = useCallback(() => setDemoPhase('signup'), []);

  useEffect(() => {
    if (demoPhase !== 'idle') {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [demoPhase]);

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-stone-100 overflow-x-hidden">
      <NavbarV7 onTryFree={handleTryFree} />

      {/* Pre-demo sections */}
      {demoPhase === 'idle' && (
        <>
          <HeroV7 onSubmit={handleUrlSubmit} inputRef={heroInputRef} />
          <ProofBarV7 />
          <ProductShowcaseV7 />
          <ProblemV7 />
          <ArchitectureV7 />
          <DeepDiveFollowupsV7 />
          <DeepDiveMeetingPrepV7 />
          <HowItWorksV7 />
          <FeatureGridV7 />
          <IntegrationGridV7 />
          <WorkflowCaseStudyV7 />
          <TestimonialsV7 />
          <TechCredibilityV7 />
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
            <DemoShowcase
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
          <FinalCTAV7 onTryFree={handleTryFree} />
          <FooterV7 />
        </>
      )}
    </div>
  );
}

export default LandingPageV7;
