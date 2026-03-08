/**
 * Handler: dead_letter_retry
 * Delegates to supabase/functions/agent-dead-letter-retry/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleDeadLetterRetry = createDelegatingHandler('agent-dead-letter-retry');
