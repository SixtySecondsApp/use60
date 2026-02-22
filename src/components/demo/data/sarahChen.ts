// Fictional rep: Sarah Chen — VP Sales at Meridian AI

export const sarahChen = {
  name: 'Sarah Chen',
  email: 'sarah@meridian-ai.com',
  title: 'VP Sales',
  avatar: 'SC',
  timezone: 'Europe/London',
  methodology: 'MEDDIC',
  quota: {
    period: 'Q1 2026',
    target: 120000,
    closed: 47200,
    weighted: 89400,
    coverageRatio: 2.1,
    coverageTarget: 3.0,
    weekOfQuarter: 8,
    totalWeeks: 13,
    closeRate: 0.34,
  },
  preferences: {
    briefingTime: '07:45',
    eodTime: '18:00',
    quietHoursStart: '20:00',
    quietHoursEnd: '07:00',
    briefingDetail: 'full',
    coachingFrequency: 'weekly',
    coachingDay: 'monday',
    notificationChannel: 'slack',
    tonePreference: 'adaptive',
    writingStyle: 'concise',
  },
  autonomy: {
    level: 'balanced',
    crmFieldUpdates: 'auto_approve',
    stageChanges: 'require_approval',
    emailDrafts: 'require_approval',
    meetingPrep: 'auto_send',
    riskAlerts: 'auto_send',
    reengagement: 'require_approval',
    promotions: [
      {
        action: 'CRM field updates',
        promotedAt: 'Day 18',
        approvals: 47,
        rejections: 0,
      },
      {
        action: 'Meeting prep auto-send',
        promotedAt: 'Day 22',
        approvals: 28,
        rejections: 1,
      },
    ],
  },
  coaching: {
    overallScore: 73,
    trend: 'improving' as const,
    talkRatio: 42,
    talkRatioTarget: 43,
    questionQuality: 68,
    objectionHandling: 71,
    discoveryDepth: 65,
    spin: { situation: 12, problem: 8, implication: 5, needPayoff: 3 },
  },
} as const;

export type SarahChen = typeof sarahChen;
