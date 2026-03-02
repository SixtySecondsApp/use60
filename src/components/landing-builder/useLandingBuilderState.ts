/**
 * Hook that derives landing page builder phase state.
 *
 * Phase tracking is driven by the parent LandingPageBuilder component
 * which manually advances `currentPhase` on approval. This hook simply
 * converts that numeric phase index (0-based) into the BuilderPhase[]
 * array that the right panel timeline expects.
 *
 * We no longer try to pattern-match AI output — that was fragile and
 * never matched the actual messages. The parent is the source of truth.
 */

import { useMemo } from 'react';
import {
  createDefaultPhases,
  getDeliverableType,
  type LandingBuilderState,
  type PhaseDeliverable,
} from './types';

/**
 * Build landing builder state from the active phase index.
 *
 * @param activePhase 0-based phase index from LandingPageBuilder (0=Strategy, 1=Copy, 2=Visuals, 3=Build)
 * @param phaseOutputs Record of approved phase outputs keyed by 0-based index
 * @param hasMessages Whether the chat has any messages (to show first phase as active)
 */
export function useLandingBuilderState(
  activePhase: number,
  phaseOutputs: Record<number, string>,
  hasMessages: boolean,
): LandingBuilderState {
  return useMemo(() => {
    const phases = createDefaultPhases();
    const deliverables: Record<number, PhaseDeliverable> = {};

    for (let i = 0; i < phases.length; i++) {
      if (i < activePhase) {
        // Phases before the active one are complete
        phases[i].status = 'complete';
        if (phaseOutputs[i]) {
          phases[i].deliverable = {
            type: getDeliverableType(i + 1),
            summary: phaseOutputs[i].slice(0, 120),
          };
          deliverables[i + 1] = phases[i].deliverable as PhaseDeliverable;
        }
      } else if (i === activePhase && hasMessages) {
        // Current phase is active
        phases[i].status = 'active';
      }
      // Remaining phases stay 'pending'
    }

    // currentPhase is 1-based for the timeline display
    const currentPhase = Math.min(activePhase + 1, phases.length);

    return {
      phases,
      currentPhase,
      deliverables,
      isExpressMode: false,
      skippedPhases: [],
    };
  }, [activePhase, phaseOutputs, hasMessages]);
}
