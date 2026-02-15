/**
 * AgentMarketplacePage — Org-admin-accessible abilities marketplace
 *
 * Renders the full abilities marketplace without debug tabs.
 * Accessible to org admins at /agent/marketplace.
 */

import { AbilityMarketplace } from '@/components/agent/AbilityMarketplace';

export default function AgentMarketplacePage() {
  return <AbilityMarketplace />;
}
