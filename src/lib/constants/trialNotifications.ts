export type TrialNotificationType =
  | 'trial_day_10_warning'
  | 'trial_day_12_upgrade_modal'
  | 'trial_expired'
  | 'grace_day_12_final_warning';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface NotificationAction {
  label: string;
  route: string;
}

export interface TrialNotificationConfig {
  type: TrialNotificationType;
  title: string;
  message: string;
  action: NotificationAction;
  priority: NotificationPriority;
  dismissible: boolean;
}

export const TRIAL_NOTIFICATIONS: readonly TrialNotificationConfig[] = [
  {
    type: 'trial_day_10_warning',
    title: '4 days left on your trial',
    message: 'Your free trial ends in 4 days. Upgrade now to keep your pipeline, contacts, and meeting history.',
    action: {
      label: 'View plans',
      route: '/settings/billing',
    },
    priority: 'medium',
    dismissible: true,
  },
  {
    type: 'trial_day_12_upgrade_modal',
    title: '2 days left — upgrade to keep your data',
    message: 'Your trial ends in 2 days. Upgrade today and never miss another follow-up.',
    action: {
      label: 'Upgrade now',
      route: '/settings/billing',
    },
    priority: 'high',
    dismissible: false,
  },
  {
    type: 'trial_expired',
    title: 'Your trial has ended',
    message: 'Your 14-day trial is over. Your data is safe for 5 more days. Upgrade to restore full access.',
    action: {
      label: 'Reactivate account',
      route: '/settings/billing',
    },
    priority: 'critical',
    dismissible: false,
  },
  {
    type: 'grace_day_12_final_warning',
    title: 'Account deactivation in 2 days',
    message:
      'In 2 days your account will be deactivated and your meetings, contacts, and pipeline will be removed. Upgrade now to keep everything.',
    action: {
      label: 'Upgrade and save my data',
      route: '/settings/billing',
    },
    priority: 'critical',
    dismissible: false,
  },
] as const;

/**
 * Returns the notification config for a given type, or undefined if not found.
 */
export function getNotificationConfig(
  type: TrialNotificationType
): TrialNotificationConfig | undefined {
  return TRIAL_NOTIFICATIONS.find((n) => n.type === type);
}
