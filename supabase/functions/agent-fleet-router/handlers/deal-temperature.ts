/**
 * Handler: deal_temperature
 * Delegates to supabase/functions/agent-deal-temperature/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handleDealTemperature = createDelegatingHandler('agent-deal-temperature');
