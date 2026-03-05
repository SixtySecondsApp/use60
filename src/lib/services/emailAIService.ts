/**
 * Email AI Service — stub
 * AI-powered email composition and analysis.
 */

export async function generateEmailDraft(_context: {
  contactEmail: string;
  subject?: string;
  meetingId?: string;
}): Promise<{ subject: string; body: string }> {
  return { subject: '', body: '' };
}

export async function classifyEmailIntent(_body: string): Promise<string> {
  return 'unknown';
}
