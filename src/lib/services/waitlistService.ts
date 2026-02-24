/**
 * Waitlist Service
 * Handles all operations for the meetings product waitlist system
 */

import { supabase } from '@/lib/supabase/clientV2';
import type {
  WaitlistEntry,
  WaitlistSignupData,
  WaitlistPosition,
  WaitlistStats,
  ToolAnalytics,
  WaitlistFilters
} from '../types/waitlist';

/**
 * PUBLIC API - No authentication required
 */

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on client errors (4xx) except 429 (rate limit)
      const status = error?.status || error?.code;
      if (status >= 400 && status < 500 && status !== 429) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        break;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Normalize registration URL to path-only format
 * Strips domain, protocol, and query parameters
 * Examples:
 *   https://www.use60.com/waitlist?ref=MEET-ABC → /waitlist
 *   /intro?param=value → /intro
 *   /waitlist → /waitlist
 *   null → null
 */
function normalizeRegistrationUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    // If it's already a path (starts with /), extract just the pathname part
    if (url.startsWith('/')) {
      const pathOnly = url.split('?')[0]; // Remove query params
      return pathOnly || null;
    }

    // If it's a full URL, parse it
    const parsed = new URL(url);
    return parsed.pathname; // Only return pathname, no search params
  } catch {
    // If parsing fails, assume it's already a path or invalid
    // Return null for invalid URLs
    return null;
  }
}

/**
 * Format connection errors into user-friendly messages
 */
function formatConnectionError(error: any): string {
  const message = error?.message || '';
  const status = error?.status || error?.code;
  
  // Connection refused / upstream errors
  if (
    message.includes('upstream connect error') ||
    message.includes('connection failure') ||
    message.includes('connect error: 111') ||
    status === 503 ||
    status === 502
  ) {
    return 'Unable to connect to our servers. This may be a temporary issue. Please check your internet connection and try again in a moment.';
  }
  
  // Network errors
  if (
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('Network request failed')
  ) {
    return 'Network error. Please check your internet connection and try again.';
  }
  
  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'Request timed out. Please try again.';
  }
  
  // Rate limiting
  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  
  return error?.message || 'Failed to join waitlist. Please try again.';
}

/**
 * Sign up for the waitlist
 * Public API - no authentication required
 */
export async function signupForWaitlist(
  data: WaitlistSignupData
): Promise<WaitlistEntry> {
  // Validate referral code if provided
  if (data.referred_by_code) {
    const isValid = await validateReferralCode(data.referred_by_code);
    if (!isValid) {
      throw new Error('Invalid referral code. Please check the link or sign up without a referral.');
    }
  }

  // Clean and validate data before sending
  const cleanData = {
    email: (data.email || '').trim(),
    full_name: (data.full_name || '').trim(),
    company_name: (data.company_name || '').trim(),
    dialer_tool: data.dialer_tool || null,
    dialer_other: data.dialer_other?.trim() || null,
    meeting_recorder_tool: data.meeting_recorder_tool || null,
    meeting_recorder_other: data.meeting_recorder_other?.trim() || null,
    crm_tool: data.crm_tool || null,
    crm_other: data.crm_other?.trim() || null,
    referred_by_code: data.referred_by_code?.trim() || null,
    utm_source: data.utm_source || null,
    utm_campaign: data.utm_campaign || null,
    utm_medium: data.utm_medium || null,
    registration_url: normalizeRegistrationUrl(data.registration_url),
  };

  // Validate required fields are not empty after trimming
  if (!cleanData.email || !cleanData.full_name || !cleanData.company_name) {
    throw new Error('Please fill in all required fields');
  }

  if (!cleanData.dialer_tool || !cleanData.meeting_recorder_tool || !cleanData.crm_tool) {
    throw new Error('Please select all integration options');
  }

  const { data: entry, error } = await retryWithBackoff(async () => {
    const result = await supabase
      .from('meetings_waitlist')
      .insert([cleanData])
      .select()
      .single();
    
    if (result.error) {
      // Wrap Supabase errors to include status code for retry logic
      const wrappedError: any = new Error(result.error.message);
      wrappedError.status = result.error.status || result.error.code;
      wrappedError.code = result.error.code;
      wrappedError.originalError = result.error;
      throw wrappedError;
    }
    
    return result;
  });

  if (error) {
    if (error.code === '23505') { // Unique violation
      throw new Error('This email is already on the waitlist');
    }
    if (error.code === '23503') { // Foreign key violation
      throw new Error('Invalid referral code. Please check the link or sign up without a referral.');
    }
    console.error('Error signing up for waitlist:', error);
    throw new Error(formatConnectionError(error));
  }

  return entry!;
}

/**
 * Get waitlist position by email
 * Public API - no authentication required
 */
export async function getWaitlistPosition(email: string): Promise<WaitlistPosition | null> {
  const { data, error } = await supabase
    .from('meetings_waitlist')
    .select('signup_position, effective_position, referral_count, referral_code, email, full_name, total_points')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') { // Not found
      return null;
    }
    console.error('Error getting waitlist position:', error);
    throw new Error('Failed to get waitlist position');
  }

  return data;
}

/**
 * Validate if a referral code exists
 * Public API - no authentication required
 */
export async function validateReferralCode(code: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('meetings_waitlist')
    .select('id')
    .eq('referral_code', code)
    .maybeSingle();

  if (error) {
    return false;
  }

  return !!data;
}

/**
 * ADMIN API - Requires platform admin authentication
 */

/**
 * Fetch all rows from a table using pagination to bypass Supabase's 1000 row limit
 */
async function fetchAllRows<T>(
  tableName: string,
  orderColumn: string,
  buildQuery: (query: any) => any
): Promise<T[]> {
  const pageSize = 1000;
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(tableName)
      .select('*')
      .order(orderColumn, { ascending: true });

    // Apply any additional filters
    query = buildQuery(query);

    // Fetch this page
    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allData = allData.concat(data as T[]);
      from += pageSize;
      // If we got less than pageSize, we've reached the end
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return allData;
}

/**
 * Get all waitlist entries with optional filters
 * Admin only
 */
export async function getWaitlistEntries(
  filters?: WaitlistFilters
): Promise<WaitlistEntry[]> {
  // Build filter function to apply to queries
  const applyFilters = (query: any) => {
    if (filters) {
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.dialer_tool) {
        query = query.eq('dialer_tool', filters.dialer_tool);
      }
      if (filters.meeting_recorder_tool) {
        query = query.eq('meeting_recorder_tool', filters.meeting_recorder_tool);
      }
      if (filters.crm_tool) {
        query = query.eq('crm_tool', filters.crm_tool);
      }
      if (filters.task_manager_tool) {
        query = query.eq('task_manager_tool', filters.task_manager_tool);
      }
      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }
      if (filters.search) {
        query = query.or(
          `email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%,company_name.ilike.%${filters.search}%`
        );
      }
    }
    return query;
  };

  // Try to use the waitlist_with_rank view first (with display_rank for proper tie-breaking)
  try {
    const data = await fetchAllRows<WaitlistEntry>(
      'waitlist_with_rank',
      'display_rank',
      applyFilters
    );
    return data;
  } catch (error: any) {
    // If the view doesn't exist (42P01 = relation doesn't exist, PGRST205 = not in schema cache),
    // fall back to the raw table
    if (error.code === '42P01' || error.code === 'PGRST205') {
      console.warn('waitlist_with_rank view not found, falling back to meetings_waitlist table.');

      const data = await fetchAllRows<WaitlistEntry>(
        'meetings_waitlist',
        'effective_position',
        applyFilters
      );
      return data;
    }

    console.error('Error getting waitlist entries:', error);
    throw new Error('Failed to get waitlist entries');
  }
}

/**
 * Get waitlist statistics
 * Admin only
 */
export async function getWaitlistStats(): Promise<WaitlistStats> {
  // Use pagination to fetch all entries for accurate stats
  const pageSize = 1000;
  let allEntries: { status: string; referral_count: number; created_at: string }[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('meetings_waitlist')
      .select('status, referral_count, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Error getting waitlist stats:', error);
      throw new Error('Failed to get waitlist statistics');
    }

    if (data && data.length > 0) {
      allEntries = allEntries.concat(data);
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const stats = allEntries.reduce(
    (acc, entry) => {
      // Count by status
      acc.total_signups++;
      if (entry.status === 'pending') acc.pending_count++;
      if (entry.status === 'released') acc.released_count++;
      if (entry.status === 'declined') acc.declined_count++;
      if (entry.status === 'converted') acc.converted_count++;

      // Sum referrals
      acc.total_referrals += entry.referral_count;

      // Count recent signups
      const createdAt = new Date(entry.created_at);
      if (createdAt >= sevenDaysAgo) acc.signups_last_7_days++;
      if (createdAt >= thirtyDaysAgo) acc.signups_last_30_days++;

      return acc;
    },
    {
      total_signups: 0,
      pending_count: 0,
      released_count: 0,
      declined_count: 0,
      converted_count: 0,
      total_referrals: 0,
      signups_last_7_days: 0,
      signups_last_30_days: 0
    }
  );

  return {
    total_signups: stats.total_signups,
    pending_count: stats.pending_count,
    released_count: stats.released_count,
    declined_count: stats.declined_count,
    converted_count: stats.converted_count,
    avg_referrals: stats.total_signups > 0
      ? Math.round((stats.total_referrals / stats.total_signups) * 10) / 10
      : 0,
    signups_last_7_days: stats.signups_last_7_days,
    signups_last_30_days: stats.signups_last_30_days
  };
}

/**
 * Get tool usage analytics
 * Admin only
 */
export async function getToolAnalytics(): Promise<ToolAnalytics> {
  // Use pagination to fetch all entries for accurate analytics
  const pageSize = 1000;
  let allData: { dialer_tool: string | null; meeting_recorder_tool: string | null; crm_tool: string | null; task_manager_tool: string | null }[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('meetings_waitlist')
      .select('dialer_tool, meeting_recorder_tool, crm_tool, task_manager_tool')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Error getting tool analytics:', error);
      throw new Error('Failed to get tool analytics');
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  const analytics = allData.reduce(
    (acc, entry) => {
      if (entry.dialer_tool) {
        acc.dialers[entry.dialer_tool] = (acc.dialers[entry.dialer_tool] || 0) + 1;
      }
      if (entry.meeting_recorder_tool) {
        acc.meeting_recorders[entry.meeting_recorder_tool] =
          (acc.meeting_recorders[entry.meeting_recorder_tool] || 0) + 1;
      }
      if (entry.crm_tool) {
        acc.crms[entry.crm_tool] = (acc.crms[entry.crm_tool] || 0) + 1;
      }
      if (entry.task_manager_tool) {
        acc.task_managers[entry.task_manager_tool] = (acc.task_managers[entry.task_manager_tool] || 0) + 1;
      }
      return acc;
    },
    {
      dialers: {} as Record<string, number>,
      meeting_recorders: {} as Record<string, number>,
      crms: {} as Record<string, number>,
      task_managers: {} as Record<string, number>
    }
  );

  return analytics;
}

/**
 * Release a user from the waitlist (grant access)
 * Admin only
 */
export async function releaseWaitlistUser(
  id: string,
  notes?: string
): Promise<void> {
  const { error } = await supabase
    .from('meetings_waitlist')
    .update({
      status: 'released',
      released_at: new Date().toISOString(),
      admin_notes: notes || null
    })
    .eq('id', id);

  if (error) {
    console.error('Error releasing waitlist user:', error);
    throw new Error(`Failed to release user from waitlist: ${error.message}`);
  }
}

/**
 * Put a user back on the waitlist (revoke access)
 * Admin only
 */
export async function unreleaseWaitlistUser(
  id: string,
  notes?: string
): Promise<void> {
  const { error } = await supabase
    .from('meetings_waitlist')
    .update({
      status: 'pending',
      released_at: null,
      admin_notes: notes || null
    })
    .eq('id', id);

  if (error) {
    console.error('Error putting user back on waitlist:', error);
    throw new Error(`Failed to put user back on waitlist: ${error.message}`);
  }
}

/**
 * Update a waitlist entry
 * Admin only
 */
export async function updateWaitlistEntry(
  id: string,
  updates: Partial<WaitlistEntry>
): Promise<void> {
  const { error } = await supabase
    .from('meetings_waitlist')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating waitlist entry:', error);
    throw new Error(`Failed to update waitlist entry: ${error.message}`);
  }
}

/**
 * Export waitlist data as CSV
 * Admin only
 */
export async function exportWaitlistCSV(filters?: WaitlistFilters): Promise<Blob> {
  const entries = await getWaitlistEntries(filters);

  // Create CSV header
  const headers = [
    'Position',
    'Email',
    'Name',
    'Company',
    'Dialer',
    'Meeting Recorder',
    'CRM',
    'Referrals',
    'Registration URL',
    'Status',
    'Referral Code',
    'Referred By',
    'Created At'
  ];

  // Create CSV rows
  const rows = entries.map(entry => [
    entry.effective_position || '',
    entry.email,
    entry.full_name,
    entry.company_name,
    entry.dialer_tool || '',
    entry.meeting_recorder_tool || '',
    entry.crm_tool || '',
    entry.referral_count,
    entry.registration_url || '',
    entry.status,
    entry.referral_code,
    entry.referred_by_code || '',
    new Date(entry.created_at).toLocaleDateString()
  ]);

  // Combine header and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  // Create blob
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Delete a waitlist entry (use with caution)
 * Admin only
 */
export async function deleteWaitlistEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('meetings_waitlist')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting waitlist entry:', error);
    throw new Error('Failed to delete waitlist entry');
  }
}
