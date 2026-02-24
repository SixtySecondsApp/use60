/**
 * Sales Copilot Persona Compiler
 *
 * Compiles organization enrichment data into a specialized internal sales co-pilot persona
 * that helps reps be more successful. The persona is framed as a TEAM MEMBER, not a generic AI.
 *
 * Used by:
 * - api-copilot (loads persona into system prompt)
 * - deep-enrich-organization (generates persona after enrichment)
 *
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md for full vision
 * @see docs/project-requirements/PRD_ACTION_CENTRE.md for memory integration
 */

import { buildMemoryContextSection } from './conversationMemory.ts';

// ============================================================================
// Types
// ============================================================================

export interface EnrichmentContext {
  company_name?: string;
  tagline?: string;
  description?: string;
  industry?: string;
  employee_count?: string;
  products?: Array<{ name: string; description: string; pricing_tier?: string }>;
  value_propositions?: string[];
  competitors?: Array<{ name: string; domain?: string }>;
  target_market?: string;
  customer_types?: string[];
  key_features?: string[];
  pain_points?: string[];
  buying_signals?: string[];
  tech_stack?: string[];
}

export interface SkillContext {
  brand_voice?: {
    tone?: string;
    avoid?: string[];
  };
  icp?: {
    companyProfile?: string;
    buyerPersona?: string;
    buyingSignals?: string[];
  };
  objection_handling?: {
    objections?: Array<{ trigger: string; response: string }>;
  };
  copilot_personality?: {
    greeting?: string;
    personality?: string;
    focus_areas?: string[];
  };
}

export interface UserContext {
  user_id: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  bio?: string;
  working_hours_start?: string;
  working_hours_end?: string;
  timezone?: string;
}

export interface EngagementContext {
  // Engagement metrics from last 30 days
  avg_response_time_ms?: number;
  action_rate?: number; // 0-1, percentage of messages that led to action
  preferred_channel?: 'copilot' | 'slack' | 'email';
  proactive_engagement_rate?: number; // 0-1
  most_used_sequences?: string[];
  peak_engagement_hours?: number[]; // Hours of day (0-23) with highest engagement
}

export interface CompiledPersona {
  persona: string;
  version: string;
  compiledAt: string;
  dataHash: string;
  hasEnrichment: boolean;
  hasSkillContext: boolean;
  hasMemoryContext: boolean;
}

// ============================================================================
// Persona Template
// ============================================================================

const PERSONA_TEMPLATE = `You are {rep_name}'s dedicated sales analyst at {company_name}. Think of yourself as their brilliant junior colleague who has superpowers — you've memorized everything about the company, you can research in seconds, and you draft emails in the perfect voice.

YOU ARE A TEAM MEMBER, NOT A GENERIC AI.
- Call them by name ({rep_first_name})
- Reference their specific deals and contacts
- Be proactive with suggestions
- Speak like a knowledgeable colleague, not a chatbot
- Never start responses with "I" — be conversational

YOUR SUPERPOWERS (Sequences):
- Meeting prep in 30 seconds
- Pipeline health check with actionable insights
- Follow-up emails in the company voice
- Deal rescue plans when things stall
- Research & competitive intel

{company_knowledge}

{writing_voice}

{objection_coaching}

HITL (always get confirmation for external actions):
- Preview emails → wait for 'Confirm' → then send
- Preview tasks → wait for 'Confirm' → then create
- Preview Slack posts → wait for 'Confirm' → then post
- NEVER send, create, or post without explicit confirmation

{user_preferences}

{engagement_insights}

{recent_memory}`;

// ============================================================================
// Compile Persona
// ============================================================================

/**
 * Compiles a specialized sales copilot persona from organization enrichment data.
 *
 * @param enrichment - Company enrichment data from organization_enrichment table
 * @param skills - Skill configurations from organization_skills table
 * @param user - User context (name, role, preferences)
 * @param engagement - Optional engagement metrics for personalization
 * @param memoryContext - Optional 7-day conversation memory context (CM-003)
 * @returns Compiled persona ready for injection into system prompt
 */
export function compileSalesCopilotPersona(
  enrichment: EnrichmentContext | null,
  skills: SkillContext | null,
  user: UserContext,
  engagement?: EngagementContext | null,
  memoryContext?: string | null
): CompiledPersona {
  const repName = user.first_name && user.last_name
    ? `${user.first_name} ${user.last_name}`
    : user.first_name || 'your';

  const repFirstName = user.first_name || 'there';
  const companyName = enrichment?.company_name || 'your company';

  // Build company knowledge section
  const companyKnowledge = buildCompanyKnowledgeSection(enrichment);

  // Build writing voice section
  const writingVoice = buildWritingVoiceSection(skills);

  // Build objection coaching section
  const objectionCoaching = buildObjectionCoachingSection(skills);

  // Build user preferences section
  const userPreferences = buildUserPreferencesSection(user);

  // Build engagement insights section (ENG-002)
  const engagementInsights = buildEngagementInsightsSection(engagement);

  // CM-003: Recent memory context (7-day conversation history)
  const recentMemory = memoryContext || '';

  // Interpolate template
  let persona = PERSONA_TEMPLATE
    .replace(/{rep_name}/g, repName)
    .replace(/{rep_first_name}/g, repFirstName)
    .replace(/{company_name}/g, companyName)
    .replace(/{company_knowledge}/g, companyKnowledge)
    .replace(/{writing_voice}/g, writingVoice)
    .replace(/{objection_coaching}/g, objectionCoaching)
    .replace(/{user_preferences}/g, userPreferences)
    .replace(/{engagement_insights}/g, engagementInsights)
    .replace(/{recent_memory}/g, recentMemory);

  // Clean up empty sections
  persona = persona.replace(/\n{3,}/g, '\n\n').trim();

  // Generate data hash for cache invalidation
  const dataHash = generateDataHash(enrichment, skills, user);

  return {
    persona,
    version: '1.1.0', // Bumped for memory context support
    compiledAt: new Date().toISOString(),
    dataHash,
    hasEnrichment: !!enrichment?.company_name,
    hasSkillContext: !!skills?.brand_voice || !!skills?.icp,
    hasMemoryContext: !!memoryContext,
  };
}

// ============================================================================
// Section Builders
// ============================================================================

function buildCompanyKnowledgeSection(enrichment: EnrichmentContext | null): string {
  if (!enrichment || !enrichment.company_name) {
    return `COMPANY KNOWLEDGE:
(No company enrichment data available. Ask the user about their company to provide better assistance.)`;
  }
  
  const parts: string[] = ['COMPANY KNOWLEDGE (you\'ve memorized this):'];
  
  // Products
  if (enrichment.products && enrichment.products.length > 0) {
    const productList = enrichment.products
      .slice(0, 5)
      .map(p => p.name + (p.description ? ` - ${p.description}` : ''))
      .join('\n  • ');
    parts.push(`- Products:\n  • ${productList}`);
  }
  
  // Competitors with positioning
  if (enrichment.competitors && enrichment.competitors.length > 0) {
    const competitorNames = enrichment.competitors.slice(0, 5).map(c => c.name).join(', ');
    parts.push(`- Competitors: ${competitorNames}`);
    
    // Add differentiators if we have value props
    if (enrichment.value_propositions && enrichment.value_propositions.length > 0) {
      const differentiators = enrichment.value_propositions.slice(0, 3).join('; ');
      parts.push(`- How we're different: ${differentiators}`);
    }
  }
  
  // Pain points
  if (enrichment.pain_points && enrichment.pain_points.length > 0) {
    const painPoints = enrichment.pain_points.slice(0, 5).join(', ');
    parts.push(`- Customer pain points we solve: ${painPoints}`);
  }
  
  // Target market / ICP
  if (enrichment.target_market) {
    parts.push(`- Target market: ${enrichment.target_market}`);
  }
  if (enrichment.customer_types && enrichment.customer_types.length > 0) {
    parts.push(`- Ideal customers: ${enrichment.customer_types.slice(0, 3).join(', ')}`);
  }
  
  // Buying signals
  if (enrichment.buying_signals && enrichment.buying_signals.length > 0) {
    const signals = enrichment.buying_signals.slice(0, 5).join(', ');
    parts.push(`- Buying signals to watch for: ${signals}`);
  }
  
  // Industry context
  if (enrichment.industry) {
    parts.push(`- Industry: ${enrichment.industry}`);
  }
  
  return parts.join('\n');
}

function buildWritingVoiceSection(skills: SkillContext | null): string {
  if (!skills?.brand_voice) {
    return '';
  }
  
  const parts: string[] = ['WRITING IN THE COMPANY VOICE:'];
  
  if (skills.brand_voice.tone) {
    parts.push(`- Tone: ${skills.brand_voice.tone}`);
  }
  
  if (skills.brand_voice.avoid && skills.brand_voice.avoid.length > 0) {
    parts.push(`- NEVER use these words/phrases: ${skills.brand_voice.avoid.join(', ')}`);
  }
  
  // Add ICP context for more targeted writing
  if (skills.icp?.buyerPersona) {
    parts.push(`- Remember the buyer persona: ${skills.icp.buyerPersona}`);
  }
  
  return parts.join('\n');
}

function buildObjectionCoachingSection(skills: SkillContext | null): string {
  if (!skills?.objection_handling?.objections || skills.objection_handling.objections.length === 0) {
    return '';
  }
  
  const parts: string[] = ['OBJECTION COACHING (when the rep asks for help with objections):'];
  
  for (const obj of skills.objection_handling.objections.slice(0, 5)) {
    parts.push(`- "${obj.trigger}" → ${obj.response}`);
  }
  
  return parts.join('\n');
}

function buildUserPreferencesSection(user: UserContext): string {
  const parts: string[] = [];

  // Working hours awareness
  if (user.working_hours_start && user.working_hours_end) {
    parts.push(`USER PREFERENCES:`);
    parts.push(`- Working hours: ${user.working_hours_start} - ${user.working_hours_end}${user.timezone ? ` (${user.timezone})` : ''}`);
    parts.push(`- If outside working hours, suggest scheduling actions for the next work day`);
  }

  // Role context
  if (user.role) {
    parts.push(`- Role: ${user.role}`);
  }

  return parts.join('\n');
}

/**
 * ENG-002: Build engagement insights section from user engagement data.
 * This helps the copilot personalize its approach based on user behavior.
 */
function buildEngagementInsightsSection(engagement: EngagementContext | null | undefined): string {
  if (!engagement) {
    return '';
  }

  const parts: string[] = ['ENGAGEMENT INSIGHTS (personalize based on this):'];

  // Action rate insight
  if (engagement.action_rate !== undefined) {
    const actionPct = Math.round(engagement.action_rate * 100);
    if (actionPct >= 60) {
      parts.push(`- High action rate (${actionPct}%) — keep suggestions concise, they usually act quickly`);
    } else if (actionPct >= 30) {
      parts.push(`- Moderate action rate (${actionPct}%) — provide context but don't overwhelm`);
    } else {
      parts.push(`- Lower action rate (${actionPct}%) — they may need more convincing context before acting`);
    }
  }

  // Preferred channel insight
  if (engagement.preferred_channel) {
    const channelName = engagement.preferred_channel === 'slack' ? 'Slack' :
      engagement.preferred_channel === 'copilot' ? 'in-app copilot' : 'email';
    parts.push(`- Prefers ${channelName} — suggest actions through that channel when possible`);
  }

  // Proactive engagement insight
  if (engagement.proactive_engagement_rate !== undefined) {
    const proactivePct = Math.round(engagement.proactive_engagement_rate * 100);
    if (proactivePct >= 50) {
      parts.push(`- Responds well to proactive suggestions (${proactivePct}% engagement)`);
    } else {
      parts.push(`- May prefer to initiate requests (${proactivePct}% proactive engagement)`);
    }
  }

  // Peak hours insight
  if (engagement.peak_engagement_hours && engagement.peak_engagement_hours.length > 0) {
    const peakHours = engagement.peak_engagement_hours
      .slice(0, 3)
      .map(h => `${h}:00`)
      .join(', ');
    parts.push(`- Most active around: ${peakHours}`);
  }

  // Most used sequences insight
  if (engagement.most_used_sequences && engagement.most_used_sequences.length > 0) {
    const seqNames = engagement.most_used_sequences
      .slice(0, 3)
      .map(s => s.replace('seq-', '').replace(/-/g, ' '))
      .join(', ');
    parts.push(`- Favorite workflows: ${seqNames}`);
  }

  return parts.length > 1 ? parts.join('\n') : '';
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a hash of the input data for cache invalidation.
 * When the hash changes, the persona should be regenerated.
 */
function generateDataHash(
  enrichment: EnrichmentContext | null,
  skills: SkillContext | null,
  user: UserContext
): string {
  const data = {
    e: enrichment ? {
      name: enrichment.company_name,
      products: enrichment.products?.length,
      competitors: enrichment.competitors?.length,
      painPoints: enrichment.pain_points?.length,
    } : null,
    s: skills ? {
      hasBrandVoice: !!skills.brand_voice,
      hasIcp: !!skills.icp,
      hasObjections: !!skills.objection_handling?.objections?.length,
    } : null,
    u: {
      id: user.user_id,
      name: user.first_name,
    },
  };
  
  // Simple hash function - in production you might use a proper hash
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Load enrichment context from organization_enrichment table
 */
export async function loadEnrichmentContext(
  supabase: any,
  organizationId: string
): Promise<EnrichmentContext | null> {
  const { data, error } = await supabase
    .from('organization_enrichment')
    .select(`
      company_name,
      tagline,
      description,
      industry,
      employee_count,
      products,
      value_propositions,
      competitors,
      target_market,
      pain_points,
      buying_signals,
      tech_stack
    `)
    .eq('organization_id', organizationId)
    .eq('status', 'completed')
    .maybeSingle();
  
  if (error || !data) {
    return null;
  }
  
  return {
    company_name: data.company_name,
    tagline: data.tagline,
    description: data.description,
    industry: data.industry,
    employee_count: data.employee_count,
    products: data.products,
    value_propositions: data.value_propositions,
    competitors: data.competitors,
    target_market: data.target_market,
    pain_points: data.pain_points,
    buying_signals: data.buying_signals,
    tech_stack: data.tech_stack,
  };
}

/**
 * Load skill context from organization_skills table
 */
export async function loadSkillContext(
  supabase: any,
  organizationId: string
): Promise<SkillContext | null> {
  const { data, error } = await supabase
    .from('organization_skills')
    .select('skill_id, config')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .in('skill_id', ['brand_voice', 'icp', 'objection_handling', 'copilot_personality']);
  
  if (error || !data || data.length === 0) {
    return null;
  }
  
  const context: SkillContext = {};
  
  for (const skill of data) {
    switch (skill.skill_id) {
      case 'brand_voice':
        context.brand_voice = skill.config;
        break;
      case 'icp':
        context.icp = skill.config;
        break;
      case 'objection_handling':
        context.objection_handling = skill.config;
        break;
      case 'copilot_personality':
        context.copilot_personality = skill.config;
        break;
    }
  }
  
  return context;
}

/**
 * Load user context from profiles table
 */
export async function loadUserContext(
  supabase: any,
  userId: string
): Promise<UserContext> {
  const { data, error } = await supabase
    .from('profiles')
    .select('first_name, last_name, role, bio, working_hours_start, working_hours_end, timezone')
    .eq('id', userId)
    .maybeSingle();

  const context: UserContext = {
    user_id: userId,
  };

  if (data) {
    context.first_name = data.first_name;
    context.last_name = data.last_name;
    context.role = data.role;
    context.bio = data.bio;
    context.working_hours_start = data.working_hours_start;
    context.working_hours_end = data.working_hours_end;
    context.timezone = data.timezone;
  }

  return context;
}

/**
 * ENG-002: Load engagement context from copilot_engagement_summary view
 * This provides metrics to personalize copilot behavior.
 */
export async function loadEngagementContext(
  supabase: any,
  organizationId: string,
  userId: string
): Promise<EngagementContext | null> {
  try {
    // Query the engagement summary view for user-level metrics
    const { data: summaryData, error: summaryError } = await supabase
      .from('copilot_engagement_summary')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (summaryError) {
      console.error('[salesCopilotPersona] Error loading engagement summary:', summaryError);
      return null;
    }

    // Query recent engagement events for more detailed insights
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: eventData, error: eventError } = await supabase
      .from('copilot_engagement_events')
      .select('event_type, event_channel, sequence_key, created_at')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);

    if (eventError) {
      console.error('[salesCopilotPersona] Error loading engagement events:', eventError);
      // Continue with summary data only
    }

    const context: EngagementContext = {};

    // Extract metrics from summary view
    if (summaryData) {
      if (summaryData.avg_response_time_ms !== undefined) {
        context.avg_response_time_ms = summaryData.avg_response_time_ms;
      }
      if (summaryData.action_rate !== undefined) {
        context.action_rate = summaryData.action_rate;
      }
      if (summaryData.proactive_engagement_rate !== undefined) {
        context.proactive_engagement_rate = summaryData.proactive_engagement_rate;
      }
    }

    // Derive insights from event data
    if (eventData && eventData.length > 0) {
      // Calculate preferred channel
      const channelCounts: Record<string, number> = {};
      eventData.forEach((event: any) => {
        const channel = event.event_channel || 'copilot';
        channelCounts[channel] = (channelCounts[channel] || 0) + 1;
      });

      const sortedChannels = Object.entries(channelCounts)
        .sort(([, a], [, b]) => b - a);

      if (sortedChannels.length > 0) {
        const topChannel = sortedChannels[0][0];
        if (['copilot', 'slack', 'email'].includes(topChannel)) {
          context.preferred_channel = topChannel as 'copilot' | 'slack' | 'email';
        }
      }

      // Find most used sequences
      const sequenceCounts: Record<string, number> = {};
      eventData.forEach((event: any) => {
        if (event.sequence_key) {
          sequenceCounts[event.sequence_key] = (sequenceCounts[event.sequence_key] || 0) + 1;
        }
      });

      const sortedSequences = Object.entries(sequenceCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([key]) => key);

      if (sortedSequences.length > 0) {
        context.most_used_sequences = sortedSequences;
      }

      // Calculate peak engagement hours
      const hourCounts: Record<number, number> = {};
      eventData.forEach((event: any) => {
        if (event.created_at) {
          const hour = new Date(event.created_at).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }
      });

      const sortedHours = Object.entries(hourCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([hour]) => parseInt(hour, 10));

      if (sortedHours.length > 0) {
        context.peak_engagement_hours = sortedHours;
      }
    }

    // Only return if we have meaningful data
    const hasData = Object.keys(context).length > 0;
    if (!hasData) {
      console.log('[salesCopilotPersona] No engagement data found for user');
      return null;
    }

    console.log('[salesCopilotPersona] Loaded engagement context:', {
      userId,
      hasActionRate: context.action_rate !== undefined,
      preferredChannel: context.preferred_channel,
      sequenceCount: context.most_used_sequences?.length || 0,
    });

    return context;
  } catch (error) {
    console.error('[salesCopilotPersona] Failed to load engagement context:', error);
    return null;
  }
}

/**
 * Save compiled persona to organization_context for caching
 */
export async function saveCompiledPersona(
  supabase: any,
  organizationId: string,
  userId: string,
  compiledPersona: CompiledPersona
): Promise<void> {
  try {
    await supabase.rpc('upsert_organization_context', {
      p_org_id: organizationId,
      p_key: `agent_persona_${userId}`,
      p_value: JSON.stringify(compiledPersona),
      p_source: 'persona_compiler',
      p_confidence: 1.0,
    });
    
    console.log(`[salesCopilotPersona] Saved persona for user ${userId} in org ${organizationId}`);
  } catch (error) {
    console.error('[salesCopilotPersona] Failed to save persona:', error);
  }
}

/**
 * Load cached persona from organization_context
 */
export async function loadCachedPersona(
  supabase: any,
  organizationId: string,
  userId: string
): Promise<CompiledPersona | null> {
  try {
    const { data, error } = await supabase
      .from('organization_context')
      .select('value, updated_at')
      .eq('organization_id', organizationId)
      .eq('key', `agent_persona_${userId}`)
      .maybeSingle();
    
    if (error || !data) {
      return null;
    }
    
    const persona = JSON.parse(data.value) as CompiledPersona;
    
    // Check if persona is stale (older than 24 hours)
    const compiledAt = new Date(persona.compiledAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - compiledAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursDiff > 24) {
      console.log('[salesCopilotPersona] Cached persona is stale (>24h), will recompile');
      return null;
    }
    
    return persona;
  } catch (error) {
    console.error('[salesCopilotPersona] Failed to load cached persona:', error);
    return null;
  }
}

/**
 * Get or compile persona with caching
 * This is the main entry point for api-copilot
 *
 * Note: Memory context is NOT cached (it's dynamic per-request)
 * but the base persona IS cached for performance.
 */
export async function getOrCompilePersona(
  supabase: any,
  organizationId: string,
  userId: string,
  supabaseUrl?: string,
  serviceRoleKey?: string
): Promise<CompiledPersona> {
  // Try to load cached persona (base persona without memory)
  const cached = await loadCachedPersona(supabase, organizationId, userId);

  // CM-003: Always load fresh memory context (it changes every request)
  let memoryContext: string | null = null;
  if (supabaseUrl && serviceRoleKey) {
    try {
      memoryContext = await buildMemoryContextSection(supabaseUrl, serviceRoleKey, userId);
      if (memoryContext) {
        console.log('[salesCopilotPersona] Loaded memory context (~' + Math.ceil(memoryContext.length / 4) + ' tokens)');
      }
    } catch (memoryError) {
      console.error('[salesCopilotPersona] Failed to load memory context:', memoryError);
      // Continue without memory - fail open
    }
  }

  if (cached) {
    console.log('[salesCopilotPersona] Using cached base persona');

    // If we have memory, inject it into the cached persona
    if (memoryContext) {
      const personaWithMemory = cached.persona.replace(/{recent_memory}/g, memoryContext);
      return {
        ...cached,
        persona: personaWithMemory,
        hasMemoryContext: true,
      };
    }

    // Clean up placeholder if no memory
    const personaCleaned = cached.persona.replace(/{recent_memory}/g, '');
    return {
      ...cached,
      persona: personaCleaned,
      hasMemoryContext: false,
    };
  }

  // Load fresh data and compile
  console.log('[salesCopilotPersona] Compiling fresh persona');

  // Load all context in parallel (ENG-002: now includes engagement)
  const [enrichment, skills, user, engagement] = await Promise.all([
    loadEnrichmentContext(supabase, organizationId),
    loadSkillContext(supabase, organizationId),
    loadUserContext(supabase, userId),
    loadEngagementContext(supabase, organizationId, userId),
  ]);

  const compiled = compileSalesCopilotPersona(enrichment, skills, user, engagement, memoryContext);

  // Cache the compiled persona (without memory - memory is per-request)
  // We save the version with {recent_memory} placeholder for future memory injection
  const personaForCache = compiled.persona.replace(memoryContext || '', '{recent_memory}');
  await saveCompiledPersona(supabase, organizationId, userId, {
    ...compiled,
    persona: personaForCache,
    hasMemoryContext: false, // Cache doesn't include memory
  });

  return compiled;
}

/**
 * Invalidate cached persona (call when enrichment or skills change)
 */
export async function invalidatePersonaCache(
  supabase: any,
  organizationId: string,
  userId?: string
): Promise<void> {
  try {
    if (userId) {
      // Invalidate specific user's persona
      await supabase
        .from('organization_context')
        .delete()
        .eq('organization_id', organizationId)
        .eq('key', `agent_persona_${userId}`);
    } else {
      // Invalidate all user personas for the org
      await supabase
        .from('organization_context')
        .delete()
        .eq('organization_id', organizationId)
        .like('key', 'agent_persona_%');
    }
    
    console.log('[salesCopilotPersona] Invalidated persona cache');
  } catch (error) {
    console.error('[salesCopilotPersona] Failed to invalidate cache:', error);
  }
}
