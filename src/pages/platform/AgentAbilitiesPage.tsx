/**
 * AgentAbilitiesPage — Unified Agent Abilities showcase page
 *
 * Event-driven autonomous workflows organized by sales lifecycle stage.
 * Thin wrapper around AbilityMarketplace component with debug tabs enabled.
 */

import { AbilityMarketplace } from '@/components/agent/AbilityMarketplace';

export default function AgentAbilitiesPage() {
  return <AbilityMarketplace showDebugTabs />;
}
