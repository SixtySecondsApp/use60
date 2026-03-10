/**
 * Handler: orchestrator
 * Delegates to supabase/functions/agent-orchestrator/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleOrchestrator = createDelegatingHandler('agent-orchestrator');
