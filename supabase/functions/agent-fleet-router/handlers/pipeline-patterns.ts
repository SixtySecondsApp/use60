/**
 * Handler: pipeline_patterns
 * Delegates to supabase/functions/agent-pipeline-patterns/index.ts
 */

import { createDelegatingHandler } from './_delegate.ts';

export const handlePipelinePatterns = createDelegatingHandler('agent-pipeline-patterns');
