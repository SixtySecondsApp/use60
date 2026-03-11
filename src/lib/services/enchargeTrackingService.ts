/**
 * Encharge.io Tracking Service
 * 
 * Provides TypeScript-safe methods for tracking events and identifying users
 * with Encharge.io analytics and automation platform.
 * 
 * The tracking script is loaded in index.html and exposes window.EncTracking
 */

// Extend Window interface for TypeScript
declare global {
  interface Window {
    EncTracking?: {
      track: (props: Record<string, any>) => void;
      identify: (props: Record<string, any>) => void;
      optIn: () => void;
      optOut: () => void;
      hasOptedIn: boolean;
      shouldGetConsent: boolean;
      queue: Array<{ type: string; props: Record<string, any> }>;
      started: boolean;
    };
  }
}

/**
 * Track a custom event in Encharge
 * Events can trigger automations in Encharge flows
 */
export function trackEvent(eventName: string, properties?: Record<string, any>): void {
  try {
    if (window.EncTracking) {
      window.EncTracking.track({
        event: eventName,
        ...properties,
      });
      console.debug('[Encharge] Tracked event:', eventName, properties);
    } else {
      console.warn('[Encharge] Tracking not initialized');
    }
  } catch (error) {
    console.error('[Encharge] Error tracking event:', error);
  }
}

/**
 * Identify a user in Encharge
 * This associates the current session with a user profile
 */
export function identifyUser(userData: {
  email: string;
  userId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  [key: string]: any;
}): void {
  try {
    if (window.EncTracking) {
      window.EncTracking.identify(userData);
      console.debug('[Encharge] Identified user:', userData.email);
    } else {
      console.warn('[Encharge] Tracking not initialized');
    }
  } catch (error) {
    console.error('[Encharge] Error identifying user:', error);
  }
}

/**
 * Opt the user into tracking
 */
export function optInToTracking(): void {
  try {
    if (window.EncTracking) {
      window.EncTracking.optIn();
      console.debug('[Encharge] User opted in to tracking');
    }
  } catch (error) {
    console.error('[Encharge] Error opting in:', error);
  }
}

/**
 * Opt the user out of tracking
 */
export function optOutOfTracking(): void {
  try {
    if (window.EncTracking) {
      window.EncTracking.optOut();
      console.debug('[Encharge] User opted out of tracking');
    }
  } catch (error) {
    console.error('[Encharge] Error opting out:', error);
  }
}

/**
 * Check if Encharge tracking is initialized
 */
export function isTrackingInitialized(): boolean {
  return !!window.EncTracking?.started;
}

// ============================================================================
// Pre-defined Event Tracking Functions
// These create consistent event names across the application
// ============================================================================

/**
 * Track when a user signs up for the waitlist
 */
export function trackWaitlistSignup(data: {
  email: string;
  company?: string;
  referralCode?: string;
  position?: number;
}): void {
  trackEvent('Waitlist Signup', {
    email: data.email,
    company: data.company,
    referral_code: data.referralCode,
    waitlist_position: data.position,
  });
}

/**
 * Track when a user's waitlist access is granted
 */
export function trackWaitlistAccessGranted(data: {
  email: string;
  userId?: string;
}): void {
  trackEvent('Waitlist Access Granted', {
    email: data.email,
    user_id: data.userId,
  });
}

/**
 * Track when a user creates an account
 */
export function trackAccountCreated(data: {
  email: string;
  userId: string;
  orgId?: string;
  orgName?: string;
  source?: string;
}): void {
  // First identify the user
  identifyUser({
    email: data.email,
    userId: data.userId,
  });
  
  // Then track the event
  trackEvent('Account Created', {
    user_id: data.userId,
    org_id: data.orgId,
    org_name: data.orgName,
    signup_source: data.source || 'direct',
    created_at: new Date().toISOString(),
  });
}

/**
 * Track when a user connects Fathom
 */
export function trackFathomConnected(data: {
  email: string;
  userId: string;
}): void {
  trackEvent('Fathom Connected', {
    user_id: data.userId,
    connected_at: new Date().toISOString(),
  });
}

/**
 * Track when first meeting is synced
 */
export function trackFirstMeetingSynced(data: {
  email: string;
  userId: string;
  meetingCount: number;
}): void {
  trackEvent('First Meeting Synced', {
    user_id: data.userId,
    meeting_count: data.meetingCount,
    synced_at: new Date().toISOString(),
  });
}

/**
 * Track when user views their first meeting summary (NORTH STAR!)
 */
export function trackFirstSummaryViewed(data: {
  email: string;
  userId: string;
  meetingId: string;
}): void {
  trackEvent('First Summary Viewed', {
    user_id: data.userId,
    meeting_id: data.meetingId,
    viewed_at: new Date().toISOString(),
  });
}

/**
 * Track when user completes their first action item
 */
export function trackFirstActionItemCompleted(data: {
  email: string;
  userId: string;
  taskId: string;
}): void {
  trackEvent('First Action Item Completed', {
    user_id: data.userId,
    task_id: data.taskId,
    completed_at: new Date().toISOString(),
  });
}

/**
 * Track when user generates their first proposal
 */
export function trackFirstProposalGenerated(data: {
  email: string;
  userId: string;
  proposalId: string;
}): void {
  trackEvent('First Proposal Generated', {
    user_id: data.userId,
    proposal_id: data.proposalId,
    generated_at: new Date().toISOString(),
  });
}

/**
 * Track when user upgrades to paid plan
 */
export function trackUpgradedToPaid(data: {
  email: string;
  userId: string;
  planName: string;
  planPrice: number;
  billingCycle: 'monthly' | 'yearly';
}): void {
  trackEvent('Upgraded to Paid', {
    user_id: data.userId,
    plan_name: data.planName,
    plan_price: data.planPrice,
    billing_cycle: data.billingCycle,
    upgraded_at: new Date().toISOString(),
  });
}

/**
 * Track when user approaches meeting limit (80%)
 */
export function trackUsageLimitWarning(data: {
  email: string;
  userId: string;
  meetingsUsed: number;
  meetingsLimit: number;
}): void {
  trackEvent('Usage Limit Warning', {
    user_id: data.userId,
    meetings_used: data.meetingsUsed,
    meetings_limit: data.meetingsLimit,
    percentage_used: Math.round((data.meetingsUsed / data.meetingsLimit) * 100),
  });
}

/**
 * Track when user reaches meeting limit (100%)
 */
export function trackUsageLimitReached(data: {
  email: string;
  userId: string;
  meetingsUsed: number;
  meetingsLimit: number;
}): void {
  trackEvent('Usage Limit Reached', {
    user_id: data.userId,
    meetings_used: data.meetingsUsed,
    meetings_limit: data.meetingsLimit,
  });
}

/**
 * Track when a user connects a notetaker integration
 */
export function trackNotetakerConnected(data: {
  email: string;
  userId: string;
}): void {
  trackEvent('Notetaker Connected', {
    user_id: data.userId,
    connected_at: new Date().toISOString(),
  });
}

/**
 * Track when a user completes an instant replay
 */
export function trackInstantReplayCompleted(data: {
  email: string;
  userId: string;
  meetingId: string;
}): void {
  trackEvent('Instant Replay Completed', {
    user_id: data.userId,
    meeting_id: data.meetingId,
    completed_at: new Date().toISOString(),
  });
}

/**
 * Track when a user tops up their credits
 */
export function trackCreditsToppedUp(data: {
  email: string;
  userId: string;
  creditsAdded: number;
}): void {
  trackEvent('Credits Topped Up', {
    user_id: data.userId,
    credits_added: data.creditsAdded,
    topped_up_at: new Date().toISOString(),
  });
}

/**
 * Track when a user completes the product tour
 */
export function trackTourCompleted(data: {
  email: string;
  userId: string;
  tourId?: string;
}): void {
  trackEvent('Tour Completed', {
    user_id: data.userId,
    tour_id: data.tourId,
    completed_at: new Date().toISOString(),
  });
}

/**
 * Track page views
 */
export function trackPageView(pageName: string, properties?: Record<string, any>): void {
  trackEvent('Page Viewed', {
    page: pageName,
    url: window.location.href,
    referrer: document.referrer,
    ...properties,
  });
}

/**
 * Track feature usage
 */
export function trackFeatureUsed(featureName: string, properties?: Record<string, any>): void {
  trackEvent('Feature Used', {
    feature: featureName,
    ...properties,
  });
}

// Default export for convenience
export default {
  trackEvent,
  identifyUser,
  optInToTracking,
  optOutOfTracking,
  isTrackingInitialized,
  // Pre-defined events
  trackWaitlistSignup,
  trackWaitlistAccessGranted,
  trackAccountCreated,
  trackFathomConnected,
  trackFirstMeetingSynced,
  trackFirstSummaryViewed,
  trackFirstActionItemCompleted,
  trackFirstProposalGenerated,
  trackUpgradedToPaid,
  trackUsageLimitWarning,
  trackUsageLimitReached,
  trackNotetakerConnected,
  trackInstantReplayCompleted,
  trackCreditsToppedUp,
  trackTourCompleted,
  trackPageView,
  trackFeatureUsed,
};
