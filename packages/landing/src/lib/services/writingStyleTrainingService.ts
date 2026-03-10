/**
 * Writing Style Training Service
 *
 * Frontend service for training AI writing styles from sent Gmail emails.
 * Orchestrates the flow: fetch emails → select → analyze → save
 */

import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';
import type {
  EmailForTraining,
  ExtractedStyle,
  WritingStyleMetadata,
  FetchEmailsResponse,
  AnalyzeEmailsResponse,
  SaveStyleResponse,
} from '@/lib/types/writingStyle';

export class WritingStyleTrainingService {
  /**
   * Fetch sent emails from Gmail for training
   */
  static async fetchSentEmails(count: number = 20): Promise<FetchEmailsResponse> {
    try {
      logger.log(`📧 Fetching ${count} sent emails for training...`);

      const { data, error } = await supabase.functions.invoke('analyze-router', {
        body: {
          action: 'writing_style',
          sub_action: 'fetch-emails',
          count,
        },
      });

      if (error) {
        logger.error('Error fetching emails:', error);
        return { success: false, error: error.message };
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to fetch emails' };
      }

      logger.log(`✅ Fetched ${data.emails?.length || 0} emails`);
      return { success: true, emails: data.emails };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Exception fetching emails:', error);
      return { success: false, error: message };
    }
  }

  /**
   * Analyze emails with Claude to extract writing style
   */
  static async analyzeEmails(
    emails: Array<{ subject: string; body: string }>
  ): Promise<AnalyzeEmailsResponse> {
    try {
      logger.log(`🤖 Analyzing ${emails.length} emails for writing style...`);

      const { data, error } = await supabase.functions.invoke('analyze-router', {
        body: {
          action: 'writing_style',
          sub_action: 'analyze',
          emails,
        },
      });

      if (error) {
        logger.error('Error analyzing emails:', error);
        return { success: false, error: error.message };
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to analyze emails' };
      }

      logger.log(`✅ Style extracted: ${data.style?.name}`);
      return { success: true, style: data.style };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Exception analyzing emails:', error);
      return { success: false, error: message };
    }
  }

  /**
   * Save extracted style to database
   */
  static async saveStyle(
    name: string,
    toneDescription: string,
    examples: string[],
    styleMetadata: WritingStyleMetadata,
    options?: {
      isDefault?: boolean;
      sourceEmailCount?: number;
    }
  ): Promise<SaveStyleResponse> {
    try {
      logger.log(`💾 Saving writing style: ${name}`);

      const { data, error } = await supabase.functions.invoke('analyze-router', {
        body: {
          action: 'writing_style',
          sub_action: 'save',
          name,
          tone_description: toneDescription,
          examples,
          style_metadata: styleMetadata,
          is_default: options?.isDefault ?? false,
          source_email_count: options?.sourceEmailCount,
        },
      });

      if (error) {
        logger.error('Error saving style:', error);
        return { success: false, error: error.message };
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to save style' };
      }

      logger.log(`✅ Style saved with ID: ${data.style_id}`);
      return { success: true, style_id: data.style_id };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Exception saving style:', error);
      return { success: false, error: message };
    }
  }

  /**
   * Convert ExtractedStyle to WritingStyleMetadata format
   */
  static styleToMetadata(style: ExtractedStyle): WritingStyleMetadata {
    return {
      tone: style.tone,
      structure: style.structure,
      vocabulary: style.vocabulary,
      greetings_signoffs: style.greetings_signoffs,
      analysis_confidence: style.analysis_confidence,
      model_used: 'claude-sonnet-4-20250514',
    };
  }

  /**
   * Check if user has Gmail connected
   */
  static async checkGmailConnection(): Promise<{
    connected: boolean;
    email?: string;
    error?: string;
  }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { connected: false, error: 'Not authenticated' };
      }

      const { data, error } = await supabase
        .from('google_integrations')
        .select('email, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single<{ email: string; is_active: boolean }>();

      if (error || !data) {
        return { connected: false };
      }

      return { connected: true, email: data.email };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { connected: false, error: message };
    }
  }

  /**
   * Full training flow: fetch → analyze → return style
   * (Without saving - user confirms before save)
   */
  static async trainFromEmails(
    selectedEmails: EmailForTraining[]
  ): Promise<{
    success: boolean;
    style?: ExtractedStyle;
    error?: string;
  }> {
    try {
      if (selectedEmails.length < 5) {
        return {
          success: false,
          error: 'Please select at least 5 emails for accurate style extraction',
        };
      }

      // Prepare emails for analysis
      const emailsForAnalysis = selectedEmails.map(e => ({
        subject: e.subject,
        body: e.body,
      }));

      // Analyze with Claude
      const result = await this.analyzeEmails(emailsForAnalysis);

      return result;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Exception in trainFromEmails:', error);
      return { success: false, error: message };
    }
  }
}

export default WritingStyleTrainingService;
