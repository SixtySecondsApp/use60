/**
 * WaitlistSlackSettings Page
 * Configure Slack notifications for waitlist signups
 */

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { SlackNotificationSettings } from '@/components/admin/waitlist/SlackNotificationSettings';

export default function WaitlistSlackSettings() {
  return (
    <div className="p-4 sm:p-6 space-y-6 overflow-x-hidden w-full bg-white dark:bg-gray-950 min-h-screen">
      <BackToPlatform />
      {/* Header with back link */}
      <div className="space-y-4">
        <Link
          to="/platform/meetings-waitlist"
          className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Waitlist
        </Link>

        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Waitlist Slack Notifications
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Configure Slack alerts for new signups, milestones, and daily digests
          </p>
        </div>
      </div>

      {/* Slack Settings Component */}
      <SlackNotificationSettings />
    </div>
  );
}
