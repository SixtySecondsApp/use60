/**
 * Handler: morning_briefing
 * Delegates to supabase/functions/agent-morning-briefing/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleMorningBriefing = createDelegatingHandler('agent-morning-briefing');
