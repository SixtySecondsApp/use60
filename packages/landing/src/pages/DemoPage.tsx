/**
 * DemoPage — /demo
 *
 * Standalone demo flow: DemoHero (URL input) → AgentResearch → SandboxExperience.
 * Same core experience as the landing page but without marketing sections.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { DemoHero } from '../demo/DemoHero';
import { useDemoResearch } from '../demo/useDemoResearch';
import { AgentResearch } from '../demo-v2/AgentResearch';
import { SandboxExperience } from '../sandbox/SandboxExperience';

type DemoPhase = 'idle' | 'research' | 'sandbox';

export default function DemoPage() {
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle');
  const research = useDemoResearch();
  const demoRef = useRef<HTMLDivElement>(null);

  const handleUrlSubmit = useCallback((url: string) => {
    research.start(url);
    setDemoPhase('research');
    setTimeout(() => {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [research]);

  const handleResearchComplete = useCallback(() => setDemoPhase('sandbox'), []);

  useEffect(() => {
    if (demoPhase !== 'idle') {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [demoPhase]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-x-hidden">
      {demoPhase === 'idle' && <DemoHero onSubmit={handleUrlSubmit} />}

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

          {demoPhase === 'sandbox' && research.research && (
            <SandboxExperience
              key="sandbox"
              research={research.research}
              onSignup={() => {}}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
