/**
 * Google Email Service — stub
 * Full implementation pending Gmail integration.
 */

export async function syncEmails(_userId: string): Promise<void> {
  throw new Error('Google Email sync not yet configured');
}

export async function getEmailHistory(_contactEmail: string): Promise<any[]> {
  return [];
}

export async function getEmailSyncStatus(_userId: string): Promise<{ connected: boolean; lastSync: string | null }> {
  return { connected: false, lastSync: null };
}
