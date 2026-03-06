export type EmailSegment = 'all' | 'activated' | 'not_activated';

export interface TrialEmailTemplate {
  day: number;
  slug: string;
  subject: string;
  purpose: string;
  segment: EmailSegment;
  enchargeEventName: string;
}

export const TRIAL_EMAIL_TEMPLATES: readonly TrialEmailTemplate[] = [
  {
    day: 0,
    slug: 'trial-welcome',
    subject: 'Your 60 trial starts now — do this first',
    purpose: 'Welcome + first action: connect calendar, singular CTA',
    segment: 'all',
    enchargeEventName: 'trial_started',
  },
  {
    day: 3,
    slug: 'trial-value-reinforcement',
    subject: 'How [Customer] closed 3 deals in their first week',
    purpose: 'Value reinforcement via social proof and use case story',
    segment: 'all',
    enchargeEventName: 'trial_day_3',
  },
  {
    day: 7,
    slug: 'trial-midpoint-activated',
    subject: "You're halfway through — here's what to do next",
    purpose: 'Mid-trial check for activated users: next action to deepen usage',
    segment: 'activated',
    enchargeEventName: 'trial_day_7_activated',
  },
  {
    day: 7,
    slug: 'trial-midpoint-not-activated',
    subject: '7 days in — have you tried 60 yet?',
    purpose: 'Mid-trial check for inactive users: re-engagement with low-friction CTA',
    segment: 'not_activated',
    enchargeEventName: 'trial_day_7_not_activated',
  },
  {
    day: 10,
    slug: 'trial-urgency',
    subject: '4 days left on your 60 trial',
    purpose: 'Urgency introduction: countdown with clear pricing',
    segment: 'all',
    enchargeEventName: 'trial_day_10',
  },
  {
    day: 12,
    slug: 'trial-final-push',
    subject: '2 days left — lock in your rate',
    purpose: 'Final push: 2 days left with limited offer',
    segment: 'all',
    enchargeEventName: 'trial_day_12',
  },
  {
    day: 14,
    slug: 'trial-expiry',
    subject: 'Your 60 trial has ended — your data is safe',
    purpose: 'Expiry day: reassure data safety and explain grace period',
    segment: 'all',
    enchargeEventName: 'trial_expired',
  },
  {
    day: 19,
    slug: 'trial-grace-winback',
    subject: '2 days until your 60 account is deactivated',
    purpose: 'Grace day 5 win-back: specific data they will lose, final CTA',
    segment: 'all',
    enchargeEventName: 'trial_grace_day_5',
  },
] as const;

/**
 * Returns all email templates scheduled for a given trial day.
 * Day 7 has two templates (activated vs not_activated segment).
 */
export function getEmailsForDay(day: number): TrialEmailTemplate[] {
  return TRIAL_EMAIL_TEMPLATES.filter((t) => t.day === day);
}

/**
 * Returns all email templates that are upcoming from the current trial day (inclusive).
 * Useful for previewing what emails will fire from a given point in the sequence.
 */
export function getUpcomingEmails(currentTrialDay: number): TrialEmailTemplate[] {
  return TRIAL_EMAIL_TEMPLATES.filter((t) => t.day >= currentTrialDay);
}
