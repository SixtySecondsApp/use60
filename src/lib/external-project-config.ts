/**
 * External Supabase Project Configuration
 *
 * Architecture: Two Supabase projects with shared Clerk authentication
 * - Internal: dzypskjhoupsdwfsrkeo (CRM, deals, activities, workflows) - STAGING BRANCH
 * - External: cregubixyglvfzvtlgit (Customer-facing: meetings, intelligence, settings)
 *
 * Edge Functions remain on the internal project and can query either database.
 */

// External project credentials
// Support both VITE_ prefixed (development) and non-prefixed (Vercel) variable names
export const EXTERNAL_PROJECT_CONFIG = {
  projectRef: 'cregubixyglvfzvtlgit',
  url: import.meta.env.VITE_EXTERNAL_SUPABASE_URL || import.meta.env.EXTERNAL_SUPABASE_URL || 'https://cregubixyglvfzvtlgit.supabase.co',
  anonKey: import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY || import.meta.env.EXTERNAL_SUPABASE_ANON_KEY || '',
} as const;

// Internal project credentials (STAGING BRANCH)
// Support both VITE_ prefixed (development) and non-prefixed (Vercel) variable names
export const INTERNAL_PROJECT_CONFIG = {
  projectRef: 'caerqjzvuerejfrdtygb',
  url: import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || 'https://caerqjzvuerejfrdtygb.supabase.co',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || '',
} as const;

/**
 * Edge Functions that are accessible to external/customer-facing users
 * These functions are hosted on the internal project but serve external users
 */
export const EXTERNAL_ACCESSIBLE_FUNCTIONS = [
  // Meeting Intelligence
  'meeting-intelligence-search',
  'meeting-intelligence-index',
  'meeting-intelligence-process-queue',
  'ask-meeting-ai',

  // Meeting Data
  'api-v1',
  'fetch-transcript',
  'fetch-summary',
  'condense-meeting-summary',
  'extract-action-items',
  'analyze-action-item',
  'generate-more-actions',

  // Fathom Integration
  'fathom-sync',
  'oauth-initiate',
  'fathom-oauth-callback',
  'proxy-fathom-video',

  // User/Profile
  'health',
] as const;

/**
 * Edge Functions that are internal-only (CRM, admin, etc.)
 * These should NOT be accessible from the external/customer-facing app
 */
export const INTERNAL_ONLY_FUNCTIONS = [
  // CRM
  'deals',
  'deal-splits',
  'deal-activities',
  'contacts',
  'companies',
  'clients',

  // Activities & Tasks
  'add-activity',
  'add-sale',
  'bulk-import-activities',
  'process-single-activity',
  'create-task-unified',
  'create-task-from-action-item',

  // Leads & Pipeline
  'process-lead-prep',
  'reprocess-lead-prep',
  'webhook-leads',
  'import-leads-generic',

  // Admin
  'impersonate-user',
  'restore-user',
  'create-api-key',

  // Workflows
  'workflow-webhook',

  // Analytics (internal)
  'analytics-web-vitals',
  'calculate-deal-health',
] as const;

export type ExternalAccessibleFunction = typeof EXTERNAL_ACCESSIBLE_FUNCTIONS[number];
export type InternalOnlyFunction = typeof INTERNAL_ONLY_FUNCTIONS[number];

/**
 * Check if a function is accessible to external users
 */
export function isExternalAccessible(functionName: string): boolean {
  return EXTERNAL_ACCESSIBLE_FUNCTIONS.includes(functionName as ExternalAccessibleFunction);
}

/**
 * Get the Edge Function URL for a given function name
 * All Edge Functions are hosted on the internal project
 */
export function getEdgeFunctionUrl(functionName: string): string {
  return `${INTERNAL_PROJECT_CONFIG.url}/functions/v1/${functionName}`;
}

/**
 * Database target for Edge Functions
 * Some functions may need to query the external database
 */
export type DatabaseTarget = 'internal' | 'external';

/**
 * Mapping of Edge Functions to their primary database target
 * Functions not listed default to 'internal'
 */
export const FUNCTION_DATABASE_TARGET: Record<string, DatabaseTarget> = {
  // Meeting functions query external DB (customer data)
  'meeting-intelligence-search': 'external',
  'meeting-intelligence-index': 'external',
  'meeting-intelligence-process-queue': 'external',
  'ask-meeting-ai': 'external',
  'api-v1': 'external',
  'fetch-transcript': 'external',
  'fetch-summary': 'external',

  // These still query internal (integration state, etc.)
  'fathom-sync': 'internal', // Syncs TO external, but reads config from internal
  'oauth-initiate': 'internal',
  'fathom-oauth-callback': 'internal',
};

/**
 * Get the database target for a function
 */
export function getFunctionDatabaseTarget(functionName: string): DatabaseTarget {
  return FUNCTION_DATABASE_TARGET[functionName] || 'internal';
}
