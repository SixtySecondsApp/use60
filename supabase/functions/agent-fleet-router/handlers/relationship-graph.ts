/**
 * Handler: relationship_graph
 * Delegates to supabase/functions/agent-relationship-graph/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleRelationshipGraph = createDelegatingHandler('agent-relationship-graph');
