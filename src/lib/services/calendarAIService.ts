/**
 * Calendar AI Service — stub
 * AI-powered calendar analysis and scheduling suggestions.
 */

export async function suggestMeetingTimes(_participants: string[]): Promise<any[]> {
  return [];
}

export async function analyzeMeetingLoad(_userId: string): Promise<{ meetingsThisWeek: number; busyHours: number }> {
  return { meetingsThisWeek: 0, busyHours: 0 };
}
