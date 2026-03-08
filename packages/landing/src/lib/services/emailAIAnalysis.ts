/**
 * Email AI Analysis Service
 *
 * Calls the analyze-email edge function to analyze sales emails with Claude.
 * Extracts sentiment, topics, action items, urgency, and response requirements.
 */

import { supabase } from '@/lib/supabase/clientV2';

export interface EmailAnalysis {
  sentiment_score: number; // -1 to 1
  key_topics: string[];
  action_items: string[];
  urgency: 'low' | 'medium' | 'high';
  response_required: boolean;
}

/**
 * Analyze email with Claude via edge function
 *
 * @param emailSubject - Email subject line
 * @param emailBody - Email body content
 * @returns Analysis results including sentiment, topics, action items, urgency, and response requirement
 */
export async function analyzeEmailWithClaude(
  emailSubject: string,
  emailBody: string
): Promise<EmailAnalysis> {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-router', {
      body: {
        action: 'email',
        subject: emailSubject,
        body: emailBody,
      },
    });

    if (error) {
      console.error('Edge function error:', error);
      throw new Error(error.message || 'Failed to analyze email');
    }

    // Check if we got a fallback response due to error
    if (data?.fallback) {
      console.warn('Email analysis returned fallback:', data.error);
      return data.fallback;
    }

    // Validate and normalize response
    return {
      sentiment_score: Math.max(-1, Math.min(1, data.sentiment_score || 0)),
      key_topics: Array.isArray(data.key_topics)
        ? data.key_topics.slice(0, 5).filter((t: any) => typeof t === 'string')
        : [],
      action_items: Array.isArray(data.action_items)
        ? data.action_items.filter((a: any) => typeof a === 'string')
        : [],
      urgency: ['low', 'medium', 'high'].includes(data.urgency)
        ? data.urgency
        : 'low',
      response_required: Boolean(data.response_required),
    };
  } catch (error) {
    console.error('Error analyzing email:', error);
    // Return default analysis on error
    return {
      sentiment_score: 0,
      key_topics: [],
      action_items: [],
      urgency: 'low',
      response_required: false,
    };
  }
}











