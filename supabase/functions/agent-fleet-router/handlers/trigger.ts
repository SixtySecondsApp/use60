/**
 * Handler: trigger
 * Delegates to supabase/functions/agent-trigger/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleTrigger = createDelegatingHandler('agent-trigger');
