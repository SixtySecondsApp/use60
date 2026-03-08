/**
 * Understanding Engine
 *
 * Implements the "consult" pattern - asking clarifying questions
 * until we have enough context to accomplish the user's goal.
 *
 * Uses AI to:
 * 1. Parse the user's intent
 * 2. Identify what context is missing
 * 3. Generate targeted questions
 * 4. Extract context from responses
 */

import type { Skill } from '@/lib/mcp/skillsProvider';
import type { SkillContext } from '@/lib/mcp/skillsTools';
import type {
  AgentGoal,
  AgentMessage,
  QuestionOption,
  UnderstandingRequest,
  UnderstandingResponse,
} from './types';
import { supabase } from '@/lib/supabase/clientV2';

// =============================================================================
// Understanding Prompts
// =============================================================================

/**
 * System prompt for the understanding AI
 */
const UNDERSTAND_SYSTEM_PROMPT = `You are an AI assistant helping a sales professional accomplish their goal.

Your job is to:
1. Understand what they're trying to accomplish
2. Ask clarifying questions if anything is unclear
3. Extract key context for execution

RULES:
- Ask ONE focused question at a time (can have multiple choice options)
- Wait for their answer before asking the next question
- Don't ask what you can infer from context
- Stop asking when you have sufficient context (typically 2-5 questions)
- Be conversational, not bureaucratic
- Focus on the "what" and "who" - specific details that affect execution

Available context from the user's CRM:
- Contacts, deals, meetings, emails
- Organization settings: company info, ICP, team

You will be provided with the available skills so you understand what's possible.`;

/**
 * Build the user prompt for understanding
 */
function buildUnderstandingPrompt(request: UnderstandingRequest): string {
  const { message, context, history, availableSkills } = request;

  // Summarize available skills
  const skillsSummary = availableSkills
    .map((s) => `- ${s.name} (${s.category}): ${s.description}`)
    .join('\n');

  // Summarize conversation history
  const historySummary = history
    .slice(-6) // Last 6 messages
    .map((m) => {
      if (m.type === 'question') {
        return `Assistant: [Question] ${m.content}`;
      }
      return `User: ${m.content}`;
    })
    .join('\n');

  // Build context summary
  const contextKeys = Object.keys(context).filter(
    (k) => context[k] !== undefined && context[k] !== null
  );
  const contextSummary =
    contextKeys.length > 0
      ? `Known context: ${contextKeys.join(', ')}`
      : 'No additional context available';

  return `Available skills I can use:
${skillsSummary}

${contextSummary}

Conversation so far:
${historySummary || '(New conversation)'}

User's latest message: "${message}"

Analyze this and respond with JSON:
{
  "understood": boolean, // true if you have enough info to create an action plan
  "goal": "string - clear goal statement",
  "intentCategory": "outreach" | "research" | "email" | "meeting" | "task" | "analysis" | "general",
  "question": "string - next question to ask (if not understood)",
  "options": [{ "label": "display text", "value": "value", "description": "optional" }],
  "extractedContext": { "key": "value" }, // any context extracted from this message
  "confidence": number // 0-1 confidence in understanding
}

IMPORTANT: Only set "understood" to true when you have enough specific details to execute.
For example, "Help me outreach to leads" needs: target criteria, value prop, existing list or not.`;
}

// =============================================================================
// Understanding Engine Class
// =============================================================================

/**
 * UnderstandingEngine - Consultation pattern implementation
 *
 * Usage:
 * ```typescript
 * const engine = new UnderstandingEngine();
 *
 * // Check understanding
 * const result = await engine.assess({
 *   message: "Help me outreach to SaaS companies",
 *   context: {},
 *   history: [],
 *   availableSkills: skills
 * });
 *
 * if (!result.understood) {
 *   // Show result.question to user with result.options
 * } else {
 *   // Proceed with result.goal
 * }
 * ```
 */
export class UnderstandingEngine {
  private questionsAsked = 0;
  private maxQuestions: number;
  private confidenceThreshold: number;

  constructor(maxQuestions = 5, confidenceThreshold = 0.8) {
    this.maxQuestions = maxQuestions;
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Assess whether we understand the user's goal
   */
  async assess(request: UnderstandingRequest): Promise<UnderstandingResponse> {
    const prompt = buildUnderstandingPrompt(request);

    try {
      // Call the AI service
      const response = await this.callAI(UNDERSTAND_SYSTEM_PROMPT, prompt);

      // Parse the response
      const parsed = this.parseAIResponse(response);

      // Apply thresholds
      if (parsed.confidence >= this.confidenceThreshold) {
        parsed.understood = true;
      }

      // If we've asked too many questions, proceed anyway
      if (this.questionsAsked >= this.maxQuestions && !parsed.understood) {
        parsed.understood = true;
        parsed.goal = parsed.goal || `Help with: ${request.message}`;
      }

      // Track questions
      if (!parsed.understood && parsed.question) {
        this.questionsAsked++;
      }

      return parsed;
    } catch (error) {
      console.error('[UnderstandingEngine.assess] Error:', error);

      // Fallback: try to proceed with what we have
      return {
        understood: true,
        goal: request.message,
        extractedContext: {},
        confidence: 0.5,
        intentCategory: this.detectIntentFromKeywords(request.message),
      };
    }
  }

  /**
   * Extract context from a user's response to a question
   */
  async extractFromResponse(
    originalQuestion: AgentMessage,
    userResponse: string,
    currentContext: SkillContext
  ): Promise<Record<string, unknown>> {
    const prompt = `The user was asked: "${originalQuestion.content}"
${originalQuestion.options ? `Options were: ${originalQuestion.options.map((o) => o.label).join(', ')}` : ''}

The user responded: "${userResponse}"

Extract any useful context from this response.
Return JSON with key-value pairs of extracted information.
Focus on: target audience, criteria, preferences, specific names/companies, timeframes.

Example: { "target_role": "VP Sales", "industry": "SaaS", "company_size": "50-200" }`;

    try {
      const response = await this.callAI(
        'Extract context from user response. Return only valid JSON.',
        prompt
      );

      return JSON.parse(response);
    } catch {
      // Simple extraction fallback
      return { user_response: userResponse };
    }
  }

  /**
   * Build an AgentGoal from understanding results
   */
  buildGoal(
    rawMessage: string,
    assessments: UnderstandingResponse[],
    accumulatedContext: SkillContext
  ): AgentGoal {
    // Use the latest assessment
    const latest = assessments[assessments.length - 1];

    // Merge all extracted context
    const requirements = assessments.reduce((acc, a) => {
      return { ...acc, ...a.extractedContext };
    }, {} as Record<string, unknown>);

    return {
      rawMessage,
      goalStatement: latest?.goal || rawMessage,
      intentCategory: latest?.intentCategory,
      requirements,
      confidence: latest?.confidence || 0.5,
    };
  }

  /**
   * Create a question message
   */
  createQuestionMessage(response: UnderstandingResponse): AgentMessage {
    return {
      id: `question-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'question',
      content: response.question || 'Can you tell me more about what you need?',
      timestamp: new Date(),
      options: response.options,
      multiSelect: false,
    };
  }

  /**
   * Reset the question counter (for new conversations)
   */
  reset(): void {
    this.questionsAsked = 0;
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  /**
   * Call the AI service
   */
  private async callAI(systemPrompt: string, userPrompt: string): Promise<string> {
    // Call the copilot edge function with a special "understand" action
    const { data, error } = await supabase.functions.invoke('api-services-router', {
      body: {
        action: 'copilot',
        sub_action: 'understand',
        systemPrompt,
        userPrompt,
      },
    });

    if (error) {
      throw new Error(`AI service error: ${error.message}`);
    }

    return data?.response || data?.content || '';
  }

  /**
   * Parse AI response into UnderstandingResponse
   */
  private parseAIResponse(response: string): UnderstandingResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          understood: parsed.understood === true,
          goal: parsed.goal || '',
          question: parsed.question,
          options: this.normalizeOptions(parsed.options),
          extractedContext: parsed.extractedContext || {},
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
          intentCategory: parsed.intentCategory,
        };
      }

      // Fallback: treat as not understood
      return {
        understood: false,
        goal: '',
        question: 'Could you tell me more about what you\'re trying to accomplish?',
        extractedContext: {},
        confidence: 0,
      };
    } catch {
      return {
        understood: false,
        goal: '',
        question: 'I want to help, but could you give me more details?',
        extractedContext: {},
        confidence: 0,
      };
    }
  }

  /**
   * Normalize options array
   */
  private normalizeOptions(options: unknown): QuestionOption[] | undefined {
    if (!Array.isArray(options)) return undefined;

    return options
      .filter((o): o is { label: string; value?: string; description?: string } => {
        return typeof o === 'object' && o !== null && typeof (o as any).label === 'string';
      })
      .map((o) => ({
        label: o.label,
        value: o.value || o.label,
        description: o.description,
      }));
  }

  /**
   * Simple keyword-based intent detection fallback
   */
  private detectIntentFromKeywords(
    message: string
  ): AgentGoal['intentCategory'] | undefined {
    const lower = message.toLowerCase();

    if (
      lower.includes('outreach') ||
      lower.includes('prospect') ||
      lower.includes('leads') ||
      lower.includes('campaign')
    ) {
      return 'outreach';
    }
    if (
      lower.includes('research') ||
      lower.includes('find out') ||
      lower.includes('look up') ||
      lower.includes('information')
    ) {
      return 'research';
    }
    if (
      lower.includes('email') ||
      lower.includes('draft') ||
      lower.includes('write') ||
      lower.includes('message')
    ) {
      return 'email';
    }
    if (
      lower.includes('meeting') ||
      lower.includes('call') ||
      lower.includes('schedule') ||
      lower.includes('prep')
    ) {
      return 'meeting';
    }
    if (
      lower.includes('task') ||
      lower.includes('todo') ||
      lower.includes('reminder') ||
      lower.includes('follow up')
    ) {
      return 'task';
    }
    if (
      lower.includes('analyze') ||
      lower.includes('report') ||
      lower.includes('performance') ||
      lower.includes('metrics')
    ) {
      return 'analysis';
    }

    return 'general';
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new UnderstandingEngine
 */
export function createUnderstandingEngine(
  maxQuestions = 5,
  confidenceThreshold = 0.8
): UnderstandingEngine {
  return new UnderstandingEngine(maxQuestions, confidenceThreshold);
}
