/**
 * Handler: email_signals
 * Delegates to supabase/functions/agent-email-signals/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleEmailSignals = createDelegatingHandler('agent-email-signals');
