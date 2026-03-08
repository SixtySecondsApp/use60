/**
 * Handler: reengagement
 * Delegates to supabase/functions/agent-reengagement/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleReengagement = createDelegatingHandler('agent-reengagement');
