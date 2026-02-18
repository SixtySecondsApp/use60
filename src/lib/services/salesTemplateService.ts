/**
 * Sales Template Service
 *
 * Handles sales email template management, variable replacement,
 * and AI-powered personalization using the Copilot service.
 */

import { supabase } from '@/lib/supabase/clientV2';
import { CopilotService } from './copilotService';
import { LinkedInEnrichmentService, type LinkedInProfile } from './linkedinEnrichmentService';
import logger from '@/lib/utils/logger';
import type { CopilotContext } from '@/components/copilot/types';

// ============================================================================
// Types
// ============================================================================

export interface UserWritingStyle {
  id: string;
  user_id: string;
  name: string;
  examples: string[]; // Array of email bodies that represent the style
  tone_description: string;
  is_default?: boolean;
}

export interface SmartContext {
  pain_points: string[];
  value_propositions: string[];
  recent_news: string[];
  ice_breakers: string[];
}

export interface SalesTemplate {
  id: string;
  user_id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  category: TemplateCategory;
  subject_template: string;
  body_template: string;
  ai_instructions: string | null;
  tone: TemplateTone;
  required_variables: string[];
  optional_variables: string[];
  context_types: ContextType[];
  usage_count: number;
  last_used_at: string | null;
  avg_response_rate: number;
  avg_conversion_rate: number;
  is_active: boolean;
  is_shared: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type TemplateCategory =
  | 'meeting_followup'
  | 'initial_outreach'
  | 'nurture_sequence'
  | 'deal_progression'
  | 'reengagement'
  | 'thank_you'
  | 'custom';

export type TemplateTone = 'professional' | 'friendly' | 'concise' | 'urgent';

export type ContextType = 'calendar_event' | 'contact' | 'deal' | 'user_profile';

export interface TemplateVariable {
  name: string;
  value: string | number | null;
  required: boolean;
}

export interface TemplateContext {
  calendar_event?: CalendarEventContext;
  contact?: ContactContext;
  deal?: DealContext;
  user_profile?: UserProfileContext;
  linkedin_profile?: LinkedInProfile; // Added LinkedIn Profile
  smart_context?: SmartContext;     // Added Smart Context
}

export interface CalendarEventContext {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  attendees?: string[];
  location?: string;
  notes?: string;
}

export interface ContactContext {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string;
  company_name?: string | null;
  title?: string | null;
  phone?: string | null;
  linkedin_url?: string | null; // Added URL field
}

export interface DealContext {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number;
  close_date?: string | null;
  description?: string | null;
}

export interface UserProfileContext {
  id: string;
  name: string;
  email: string;
  title?: string | null;
  company?: string | null;
}

export interface PersonalizedEmail {
  subject: string;
  body: string;
  tone: TemplateTone;
  variables_used: Record<string, string | number>;
  ai_personalized: boolean;
  personalization_quality?: number;
  smart_context_used?: boolean;
}

export interface TemplateUsageLog {
  template_id: string;
  used_for: 'email' | 'calendar_followup' | 'deal_action' | 'contact_outreach';
  contact_id?: string | null;
  deal_id?: string | null;
  calendar_event_id?: string | null;
  email_sent: boolean;
  ai_personalized: boolean;
  personalization_quality?: number;
}

// ============================================================================
// Sales Template Service
// ============================================================================

export class SalesTemplateService {
  /**
   * Get all active templates for the current user
   */
  static async getTemplates(options?: {
    category?: TemplateCategory;
    includeShared?: boolean;
    includeDefault?: boolean;
  }): Promise<SalesTemplate[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      let query = supabase
        .from('sales_templates')
        .select('*')
        .eq('is_active', true);

      // Apply category filter
      if (options?.category) {
        query = query.eq('category', options.category);
      }

      // Build OR conditions for visibility
      const orConditions: string[] = [`user_id.eq.${user.id}`];

      if (options?.includeShared !== false) {
        // Get user's org_id from profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', user.id)
          .single();

        if (profile?.org_id) {
          orConditions.push(`and(is_shared.eq.true,org_id.eq.${profile.org_id})`);
        }
      }

      if (options?.includeDefault !== false) {
        orConditions.push('is_default.eq.true');
      }

      query = query.or(orConditions.join(','));

      // Order by usage and creation date
      query = query.order('usage_count', { ascending: false });
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching sales templates:', error);
        throw error;
      }

      logger.log(`✅ Fetched ${data?.length || 0} sales templates`);
      return (data as SalesTemplate[]) || [];
    } catch (error) {
      logger.error('Error in getTemplates:', error);
      throw error;
    }
  }

  /**
   * Get a single template by ID
   */
  static async getTemplateById(templateId: string): Promise<SalesTemplate | null> {
    try {
      const { data, error } = await supabase
        .from('sales_templates')
        .select('*')
        .eq('id', templateId)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw error;
      }

      return data as SalesTemplate;
    } catch (error) {
      logger.error('Error fetching template by ID:', error);
      throw error;
    }
  }

  /**
   * Create a new sales template
   */
  static async createTemplate(
    template: Omit<SalesTemplate, 'id' | 'created_at' | 'updated_at' | 'usage_count' | 'last_used_at' | 'avg_response_rate' | 'avg_conversion_rate'>
  ): Promise<SalesTemplate> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('sales_templates')
        .insert({
          ...template,
          user_id: user.id
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating template:', error);
        throw error;
      }

      logger.log('✅ Template created successfully:', data.id);
      return data as SalesTemplate;
    } catch (error) {
      logger.error('Error in createTemplate:', error);
      throw error;
    }
  }

  /**
   * Update an existing template
   */
  static async updateTemplate(
    templateId: string,
    updates: Partial<Omit<SalesTemplate, 'id' | 'created_at' | 'updated_at' | 'user_id'>>
  ): Promise<SalesTemplate> {
    try {
      const { data, error } = await supabase
        .from('sales_templates')
        .update(updates)
        .eq('id', templateId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating template:', error);
        throw error;
      }

      logger.log('✅ Template updated successfully:', templateId);
      return data as SalesTemplate;
    } catch (error) {
      logger.error('Error in updateTemplate:', error);
      throw error;
    }
  }

  /**
   * Delete a template (soft delete by setting is_active = false)
   */
  static async deleteTemplate(templateId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('sales_templates')
        .update({ is_active: false })
        .eq('id', templateId);

      if (error) {
        logger.error('Error deleting template:', error);
        throw error;
      }

      logger.log('✅ Template deleted successfully:', templateId);
    } catch (error) {
      logger.error('Error in deleteTemplate:', error);
      throw error;
    }
  }

  /**
   * Extract variables from template strings
   */
  private static extractVariables(template: string): string[] {
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = variablePattern.exec(template)) !== null) {
      const variableName = match[1].trim();
      if (!variables.includes(variableName)) {
        variables.push(variableName);
      }
    }

    return variables;
  }

  /**
   * Replace variables in template with actual values
   */
  private static replaceVariables(
    template: string,
    variables: Record<string, string | number | null>
  ): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(pattern, value !== null && value !== undefined ? String(value) : `[${key}]`);
    }

    return result;
  }

  /**
   * Build variable map from context
   */
  private static buildVariableMap(
    template: SalesTemplate,
    context: TemplateContext
  ): Record<string, string | number | null> {
    const variables: Record<string, string | number | null> = {};

    // Extract from calendar event
    if (context.calendar_event) {
      const event = context.calendar_event;
      variables.meeting_title = event.title;
      variables.meeting_date = new Date(event.start_time).toLocaleDateString();
      variables.meeting_time = new Date(event.start_time).toLocaleTimeString();
      variables.meeting_location = event.location || null;
    }

    // Extract from contact
    if (context.contact) {
      const contact = context.contact;
      variables.contact_name = contact.full_name;
      variables.contact_first_name = contact.first_name || null;
      variables.contact_last_name = contact.last_name || null;
      variables.contact_email = contact.email;
      variables.contact_title = contact.title || null;
      variables.company_name = contact.company_name || null;
      variables.contact_phone = contact.phone || null;
    }

    // Extract from deal
    if (context.deal) {
      const deal = context.deal;
      variables.deal_name = deal.name;
      variables.deal_value = deal.value;
      variables.deal_stage = deal.stage;
      variables.deal_probability = deal.probability;
      variables.close_date = deal.close_date ? new Date(deal.close_date).toLocaleDateString() : null;
    }

    // Extract from user profile
    if (context.user_profile) {
      const user = context.user_profile;
      variables.sender_name = user.name;
      variables.sender_email = user.email;
      variables.sender_title = user.title || null;
      variables.sender_company = user.company || null;
    }

    // Common computed variables
    variables.today = new Date().toLocaleDateString();
    variables.current_time = new Date().toLocaleTimeString();
    variables.current_year = new Date().getFullYear();

    return variables;
  }

  /**
   * Fetch user writing style examples
   */
  private static async getUserWritingStyle(userId: string): Promise<UserWritingStyle | undefined> {
    try {
      const { data, error } = await supabase
        .from('user_writing_styles')
        .select('*')
        .eq('user_id', userId)
        .eq('is_default', true)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // Not found code
          logger.error('Error fetching user writing style:', error);
        }
        // Fallback to mock if no DB entry yet (for smooth transition)
        return {
          id: 'default-style',
          user_id: userId,
          name: 'Professional Direct (Default)',
          tone_description: 'Direct, professional, value-focused, minimal fluff.',
          examples: [
            "Hi [Name], saw your post about [Topic]. It resonated because we're seeing similar trends at [Company].",
            "Are you open to a 5-min chat to see if we can help you achieve similar results?"
          ]
        };
      }

      return data as UserWritingStyle;
    } catch (error) {
      logger.error('Exception fetching user writing style:', error);
      return undefined;
    }
  }

  /**
   * Get all writing styles for a user
   */
  static async getWritingStyles(): Promise<UserWritingStyle[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('user_writing_styles')
        .select('id, user_id, name, tone_description, examples, is_default')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false });

      if (error) throw error;
      return (data as UserWritingStyle[]) || [];
    } catch (error) {
      logger.error('Error fetching writing styles:', error);
      return [];
    }
  }

  /**
   * Create a writing style
   */
  static async createWritingStyle(style: Omit<UserWritingStyle, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<UserWritingStyle> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('user_writing_styles')
        .insert({ ...style, user_id: user.id })
        .select('id, user_id, name, tone_description, examples, is_default')
        .single();

      if (error) throw error;
      return data as UserWritingStyle;
    } catch (error) {
      logger.error('Error creating writing style:', error);
      throw error;
    }
  }

  /**
   * Extract "Smart Context" using Gemini
   * Analyzes meeting notes, LinkedIn profile, and deal info to find pain points
   */
  private static async extractSmartContext(context: TemplateContext): Promise<SmartContext | undefined> {
    try {
      const inputData = {
        meeting_notes: context.calendar_event?.notes || '',
        deal_description: context.deal?.description || '',
        linkedin_summary: context.linkedin_profile?.summary || '',
        linkedin_posts: context.linkedin_profile?.recentPosts?.map(p => p.content).join('\n') || '',
        company: context.contact?.company_name || ''
      };

      if (!inputData.meeting_notes && !inputData.deal_description && !inputData.linkedin_summary) {
        return undefined;
      }

      const prompt = `
        Analyze the following prospect data and extract key insights for a sales email:
        
        Meeting Notes: ${inputData.meeting_notes}
        Deal Info: ${inputData.deal_description}
        LinkedIn Profile: ${inputData.linkedin_summary}
        Recent Posts: ${inputData.linkedin_posts}
        Company: ${inputData.company}

        Return a JSON object with:
        - pain_points: List of 3 potential business problems they have.
        - value_propositions: List of 3 ways our product could help (assume we sell a Sales CRM/AI tool).
        - recent_news: Any relevant news mentioned or implied.
        - ice_breakers: 2 personalized opening lines based on their LinkedIn activity or meeting notes.
      `;

      // We use CopilotService to interact with Gemini
      const response = await CopilotService.sendMessage(
        prompt,
        { userId: 'system', currentView: 'contact' }
      );

      // Parse the JSON response (simple regex extraction for safety)
      const jsonMatch = response.response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as SmartContext;
      }
      
      return undefined;

    } catch (error) {
      logger.warn('Failed to extract smart context:', error);
      return undefined;
    }
  }

  /**
   * Build AI personalization prompt with World Class Context
   */
  private static buildAIPrompt(
    template: SalesTemplate,
    context: TemplateContext,
    baseSubject: string,
    baseBody: string,
    writingStyle?: UserWritingStyle
  ): string {
    const contextSummary: string[] = [];

    // --- Standard Context ---
    if (context.calendar_event) {
      contextSummary.push(
        `Meeting Context: ${context.calendar_event.title} on ${new Date(context.calendar_event.start_time).toLocaleDateString()}`
      );
      if (context.calendar_event.notes) {
        contextSummary.push(`Meeting notes: ${context.calendar_event.notes}`);
      }
    }

    if (context.contact) {
      const c = context.contact;
      contextSummary.push(
        `Contact: ${c.full_name}${c.title ? ` (${c.title})` : ''}${c.company_name ? ` at ${c.company_name}` : ''}`
      );
    }

    if (context.deal) {
      const d = context.deal;
      contextSummary.push(
        `Deal: ${d.name} - $${d.value.toLocaleString()} at ${d.probability}% probability (Stage: ${d.stage})`
      );
      if (d.description) {
        contextSummary.push(`Deal notes: ${d.description}`);
      }
    }

    // --- World Class Additions ---

    // 1. LinkedIn Insights
    if (context.linkedin_profile) {
      contextSummary.push(`\n[External Intelligence - LinkedIn]`);
      contextSummary.push(`Headline: ${context.linkedin_profile.headline}`);
      contextSummary.push(`Summary: ${context.linkedin_profile.summary.substring(0, 300)}...`);
      if (context.linkedin_profile.recentPosts.length > 0) {
        contextSummary.push(`Recent Activity: Posted about "${context.linkedin_profile.recentPosts[0].content.substring(0, 100)}..."`);
      }
    }

    // 2. Smart Context (Pain Points & Value Props)
    if (context.smart_context) {
      contextSummary.push(`\n[AI Derived Insights]`);
      contextSummary.push(`Identified Pain Points: ${context.smart_context.pain_points.join(', ')}`);
      contextSummary.push(`Key Value Propositions: ${context.smart_context.value_propositions.join(', ')}`);
      contextSummary.push(`Suggested Ice Breakers: ${context.smart_context.ice_breakers.join(' OR ')}`);
    }

    // 3. Learning Loop - Writing Style
    let styleInstructions = '';
    if (writingStyle) {
      styleInstructions = `
        \n[User Writing Style - MIMIC THIS EXACTLY]
        Description: ${writingStyle.tone_description}
        Reference Examples (Write like this):
        ${writingStyle.examples.map(ex => `"${ex}"`).join('\n')}
      `;
    }

    const prompt = `
You are a top-tier sales copywriter. Your goal is to rewrite/enhance an email draft to maximize response rates.

Template Category: ${template.category.replace('_', ' ')}
Desired Tone: ${template.tone}

${template.ai_instructions ? `Special Instructions: ${template.ai_instructions}\n` : ''}

Context Information:
${contextSummary.join('\n')}
${styleInstructions}

Current Draft:
Subject: ${baseSubject}
Body:
${baseBody}

INSTRUCTIONS:
1. Use the "AI Derived Insights" to make the value proposition specific to their pain points.
2. Use the "LinkedIn Activity" to create a hyper-personalized opening hook (ice breaker) if appropriate.
3. Strictly follow the "User Writing Style" - match their sentence length, vocabulary, and closing style.
4. Keep the core call-to-action clear.
5. If the current draft is generic, completely rewrite it to be specific to the Company/Industry.

Return ONLY the enhanced email in this format:
SUBJECT: [enhanced subject line]

[enhanced email body]
`.trim();

    return prompt;
  }

  /**
   * Parse AI response into subject and body
   */
  private static parseAIResponse(response: string): { subject: string; body: string } {
    const lines = response.trim().split('\n');
    let subject = '';
    let body = '';
    let inBody = false;

    for (const line of lines) {
      if (line.startsWith('SUBJECT:')) {
        subject = line.replace('SUBJECT:', '').trim();
      } else if (subject && !inBody) {
        // First non-empty line after subject starts the body
        if (line.trim()) {
          inBody = true;
          body += line + '\n';
        }
      } else if (inBody) {
        body += line + '\n';
      }
    }

    return {
      subject: subject || 'Follow-up',
      body: body.trim()
    };
  }

  /**
   * Personalize template with AI (World Class Edition)
   */
  static async personalizeTemplate(
    templateId: string,
    context: TemplateContext,
    options?: {
      skipAI?: boolean;
      userId?: string;
      enrichContext?: boolean; // Flag to enable external enrichment
    }
  ): Promise<PersonalizedEmail> {
    try {
      logger.log('🎨 Personalizing template:', templateId);

      // Get the template
      const template = await this.getTemplateById(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      // --- Step 1: External Enrichment (LinkedIn) ---
      if (options?.enrichContext && context.contact) {
        logger.log('🌍 Starting external context enrichment...');
        
        // A. Find LinkedIn URL if missing
        let linkedInUrl = context.contact.linkedin_url;
        if (!linkedInUrl && context.contact.company_name) {
          linkedInUrl = await LinkedInEnrichmentService.findLinkedInUrl(
            context.contact.full_name, 
            context.contact.company_name
          );
        }

        // B. Scrape Profile
        if (linkedInUrl && linkedInUrl !== 'NOT_FOUND') {
          const profile = await LinkedInEnrichmentService.scrapeProfile(linkedInUrl);
          if (profile) {
            context.linkedin_profile = profile;
            logger.log('✅ LinkedIn profile enriched');
          }
        }
      }

      // --- Step 2: Smart Context Extraction ---
      // Analyzes the now-enriched data to find pain points
      if (options?.enrichContext && !options.skipAI) {
        logger.log('🧠 Extracting smart context...');
        const smartContext = await this.extractSmartContext(context);
        if (smartContext) {
          context.smart_context = smartContext;
          logger.log('✅ Smart context extracted');
        }
      }

      // Build variable map from context
      const variables = this.buildVariableMap(template, context);
      logger.log('📊 Extracted variables:', Object.keys(variables));

      // Replace variables in subject and body
      let subject = this.replaceVariables(template.subject_template, variables);
      let body = this.replaceVariables(template.body_template, variables);

      let aiPersonalized = false;
      let personalizationQuality: number | undefined;

      // AI Personalization (if not skipped)
      if (!options?.skipAI && template.ai_instructions) {
        try {
          logger.log('🤖 Requesting AI personalization...');

          // Get user writing style
          const writingStyle = options?.userId 
            ? await this.getUserWritingStyle(options.userId)
            : undefined;

          const aiPrompt = this.buildAIPrompt(template, context, subject, body, writingStyle);

          // Call Copilot for personalization
          const copilotContext: CopilotContext = {
            userId: options?.userId || '',
            currentView: 'contact',
            contactId: context.contact?.id
          };

          const aiResponse = await CopilotService.sendMessage(
            aiPrompt,
            copilotContext
          );

          if (aiResponse.response.content) {
            const parsed = this.parseAIResponse(aiResponse.response.content);
            subject = parsed.subject || subject;
            body = parsed.body || body;
            aiPersonalized = true;

            // Quality score boosted if we used smart context
            const baseQuality = Math.min(100, Math.round((parsed.body.length / body.length) * 50 + 50));
            personalizationQuality = (baseQuality / 100) + (context.smart_context ? 0.1 : 0);

            logger.log('✅ AI personalization complete');
          }
        } catch (aiError) {
          logger.warn('⚠️ AI personalization failed, using base template:', aiError);
          // Continue with base template if AI fails
        }
      }

      // Increment usage count
      await supabase.rpc('increment_template_usage', {
        template_id: templateId
      });

      return {
        subject,
        body,
        tone: template.tone,
        variables_used: variables as Record<string, string | number>,
        ai_personalized: aiPersonalized,
        personalization_quality: personalizationQuality,
        smart_context_used: !!context.smart_context
      };
    } catch (error) {
      logger.error('Error personalizing template:', error);
      throw error;
    }
  }

  /**
   * Log template usage for analytics
   */
  static async logUsage(
    logData: TemplateUsageLog & { user_id: string }
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('template_usage_logs')
        .insert({
          ...logData,
          used_at: new Date().toISOString()
        });

      if (error) {
        logger.error('Error logging template usage:', error);
        throw error;
      }

      logger.log('✅ Template usage logged');
    } catch (error) {
      logger.error('Error in logUsage:', error);
      // Don't throw - logging failures shouldn't break the flow
    }
  }

  /**
   * Update usage log with email tracking data
   */
  static async updateUsageLog(
    logId: string,
    updates: {
      email_sent?: boolean;
      email_opened?: boolean;
      email_replied?: boolean;
      reply_time_hours?: number;
      converted?: boolean;
      conversion_type?: string;
      conversion_value?: number;
    }
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('template_usage_logs')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', logId);

      if (error) {
        logger.error('Error updating usage log:', error);
        throw error;
      }

      logger.log('✅ Usage log updated:', logId);
    } catch (error) {
      logger.error('Error in updateUsageLog:', error);
      throw error;
    }
  }

  /**
   * Get template effectiveness metrics
   */
  static async getTemplateMetrics(
    templateId: string
  ): Promise<{
    usage_count: number;
    avg_response_rate: number;
    avg_conversion_rate: number;
    total_uses: number;
    emails_sent: number;
    emails_opened: number;
    emails_replied: number;
    conversions: number;
  }> {
    try {
      // Get template basic metrics
      const template = await this.getTemplateById(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      // Get detailed usage logs
      const { data: logs, error } = await supabase
        .from('template_usage_logs')
        .select('*')
        .eq('template_id', templateId);

      if (error) {
        throw error;
      }

      const metrics = {
        usage_count: template.usage_count,
        avg_response_rate: template.avg_response_rate,
        avg_conversion_rate: template.avg_conversion_rate,
        total_uses: logs?.length || 0,
        emails_sent: logs?.filter(l => l.email_sent).length || 0,
        emails_opened: logs?.filter(l => l.email_opened).length || 0,
        emails_replied: logs?.filter(l => l.email_replied).length || 0,
        conversions: logs?.filter(l => l.converted).length || 0
      };

      logger.log('📊 Template metrics:', metrics);
      return metrics;
    } catch (error) {
      logger.error('Error getting template metrics:', error);
      throw error;
    }
  }
}
