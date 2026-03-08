/**
 * Handler: scheduler
 * Delegates to supabase/functions/agent-scheduler/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleScheduler = createDelegatingHandler('agent-scheduler');
