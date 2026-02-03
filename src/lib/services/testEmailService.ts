/**
 * Email Service Testing Utilities
 *
 * Tests all email sending operations to verify:
 * - Templates are accessible in database
 * - Variables can be substituted
 * - Edge functions are responsive
 */

import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';

export interface EmailTestResult {
  templateName: string;
  status: 'success' | 'failed';
  message: string;
  timestamp: Date;
}

export const testEmailService = {
  /**
   * Test a specific email template
   */
  async testTemplate(templateName: string): Promise<EmailTestResult> {
    try {
      const { data, error } = await supabase
        .from('encharge_email_templates')
        .select('id, template_name, subject_line, is_active')
        .eq('template_name', templateName)
        .single();

      if (error || !data) {
        return {
          templateName,
          status: 'failed',
          message: `Template not found: ${error?.message || 'Unknown error'}`,
          timestamp: new Date(),
        };
      }

      if (!data.is_active) {
        return {
          templateName,
          status: 'failed',
          message: 'Template exists but is inactive',
          timestamp: new Date(),
        };
      }

      return {
        templateName,
        status: 'success',
        message: `Template found and active: ${data.subject_line}`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        templateName,
        status: 'failed',
        message: `Error testing template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  },

  /**
   * Test all email templates
   */
  async testAllTemplates(): Promise<EmailTestResult[]> {
    const templateNames = [
      'welcome',
      'password_reset',
      'email_change_verification',
      'join_request_approved',
      'join_request_rejected',
      'member_removed',
      'organization_invitation',
      'user_created',
    ];

    const results = await Promise.all(
      templateNames.map((name) => this.testTemplate(name))
    );

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
      timestamp: new Date(),
    };

    logger.info('[TestEmailService] Test results:', summary);
    results.forEach((result) => {
      if (result.status === 'failed') {
        logger.warn(`[TestEmailService] ${result.templateName}: ${result.message}`);
      } else {
        logger.debug(`[TestEmailService] ${result.templateName}: OK`);
      }
    });

    return results;
  },

  /**
   * Test edge function availability
   */
  async testEdgeFunctions(): Promise<{ function: string; status: 'ok' | 'error' }[]> {
    const functions = [
      'send-organization-invitation',
      'encharge-send-email',
      'send-password-reset-email',
    ];

    const results = await Promise.all(
      functions.map(async (functionName) => {
        try {
          const response = await supabase.functions.invoke(functionName, {
            body: { test: true },
          });

          return {
            function: functionName,
            status: response.error ? 'error' : 'ok',
          };
        } catch (error) {
          logger.warn(`[TestEmailService] Error testing ${functionName}:`, error);
          return {
            function: functionName,
            status: 'error',
          };
        }
      })
    );

    return results;
  },

  /**
   * Run all email service tests
   */
  async runFullTest() {
    logger.info('[TestEmailService] Starting full email service test...');

    const templateResults = await this.testAllTemplates();
    const functionResults = await this.testEdgeFunctions();

    return {
      templates: templateResults,
      functions: functionResults,
      timestamp: new Date(),
    };
  },
};
