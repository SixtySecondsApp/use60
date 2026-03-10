/**
 * Handler: initial_scan
 * Delegates to supabase/functions/agent-initial-scan/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleInitialScan = createDelegatingHandler('agent-initial-scan');
