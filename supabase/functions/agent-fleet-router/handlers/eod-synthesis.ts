/**
 * Handler: eod_synthesis
 * Delegates to supabase/functions/agent-eod-synthesis/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleEodSynthesis = createDelegatingHandler('agent-eod-synthesis');
