/**
 * Handler: deal_risk_batch
 * Delegates to supabase/functions/agent-deal-risk-batch/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleDealRiskBatch = createDelegatingHandler('agent-deal-risk-batch');
