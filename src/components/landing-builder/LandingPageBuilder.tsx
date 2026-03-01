/**
 * Landing Page Builder - Main Wrapper
 * Mirrors Copilot.tsx but uses custom right panel and empty state.
 *
 * v2: Uses workspace service (DB-backed) instead of in-memory refs.
 * Each agent reads only the workspace fields it needs — token efficient.
 *
 * Auto-loads org profile + products to give the AI real business context.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { CopilotLayout } from '@/components/copilot/CopilotLayout';
import { LandingBuilderRightPanel } from './LandingBuilderRightPanel';
import { LandingBuilderEmpty, BUILDER_CONTINUATION } from './LandingBuilderEmpty';
import { AssistantShell, type QuickAction } from '@/components/assistant/AssistantShell';
import { useLandingBuilderState } from './useLandingBuilderState';
import { useOrgProfile } from '@/lib/hooks/useFactProfiles';
import { useProductProfiles } from '@/lib/hooks/useProductProfiles';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useLandingBuilderWorkspace } from '@/lib/hooks/useLandingBuilderWorkspace';
import { CopyPicker, parseCopySections } from './CopyPicker';
import { PHASE_AGENT_MAP, AGENT_BADGES, type LandingResearchData, type LandingSection, type BrandConfig } from './types';
import { useLandingResearch } from '@/lib/hooks/useLandingResearch';
import { STRATEGIST_SYSTEM_PROMPT } from './agents/strategistAgent';
import { COPYWRITER_SYSTEM_PROMPT } from './agents/copywriterAgent';
import { SECTION_EDIT_AGENT_SYSTEM_PROMPT, buildSectionEditContext, parseSectionEditResponse } from './agents/sectionEditAgent';
import { parseWorkspaceToSections } from './assemblyOrchestrator';
import { AssetGenerationQueue } from './assetQueue';
import { AssemblyPreview } from './AssemblyPreview';
import { LandingEditorPanel } from './LandingEditorPanel';
import { FloatingChatBar, type ChatOverlayState } from './FloatingChatBar';
import type { ModelTier } from './IntelligenceToggle';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { WorkspacePhaseKey } from '@/lib/services/landingBuilderWorkspaceService';
import type { FactProfile } from '@/lib/types/factProfile';
import type { ProductProfile } from '@/lib/types/productProfile';


/**
 * Compile org profile + products into a concise context block
 * that gets injected into every AI message.
 */
function buildBusinessContext(
  orgProfile: FactProfile | null | undefined,
  products: ProductProfile[] | undefined,
  brandGuidelines?: Record<string, unknown> | null,
): string {
  if (!orgProfile?.research_data && (!products || products.length === 0) && !brandGuidelines) return '';

  const parts: string[] = [];
  const rd = orgProfile?.research_data;

  if (rd?.company_overview) {
    const co = rd.company_overview;
    parts.push(`COMPANY: ${co.name || orgProfile?.company_name || 'Unknown'}`);
    if (co.tagline) parts.push(`TAGLINE: ${co.tagline}`);
    if (co.description) parts.push(`DESCRIPTION: ${co.description}`);
    if (co.website) parts.push(`WEBSITE: ${co.website}`);
  }

  if (rd?.market_position) {
    const mp = rd.market_position;
    if (mp.industry) parts.push(`INDUSTRY: ${mp.industry}`);
    if (mp.target_market) parts.push(`TARGET MARKET: ${mp.target_market}`);
    if (mp.differentiators?.length) parts.push(`DIFFERENTIATORS: ${mp.differentiators.join(', ')}`);
    if (mp.competitors?.length) parts.push(`COMPETITORS: ${mp.competitors.join(', ')}`);
  }

  if (rd?.products_services) {
    const ps = rd.products_services;
    if (ps.products?.length) parts.push(`PRODUCTS: ${ps.products.join(', ')}`);
    if (ps.use_cases?.length) parts.push(`USE CASES: ${ps.use_cases.join(', ')}`);
    if (ps.key_features?.length) parts.push(`KEY FEATURES: ${ps.key_features.join(', ')}`);
    if (ps.pricing_model) parts.push(`PRICING MODEL: ${ps.pricing_model}`);
  }

  if (rd?.ideal_customer_indicators) {
    const ic = rd.ideal_customer_indicators;
    if (ic.pain_points?.length) parts.push(`CUSTOMER PAIN POINTS: ${ic.pain_points.join(', ')}`);
    if (ic.value_propositions?.length) parts.push(`VALUE PROPOSITIONS: ${ic.value_propositions.join(', ')}`);
    if (ic.target_roles?.length) parts.push(`TARGET ROLES: ${ic.target_roles.join(', ')}`);
  }

  if (products && products.length > 0) {
    const primary = products.find(p => p.is_primary) || products[0];
    const prd = primary.research_data;
    if (prd?.overview?.description) parts.push(`PRIMARY PRODUCT: ${primary.name} — ${prd.overview.description}`);
    if (prd?.value_propositions?.primary_value_prop) parts.push(`VALUE PROP: ${prd.value_propositions.primary_value_prop}`);
    if (prd?.pain_points_solved?.pain_points?.length) {
      const pains = prd.pain_points_solved.pain_points.slice(0, 3).map(p => `${p.pain} → ${p.solution}`);
      parts.push(`SOLVES: ${pains.join('; ')}`);
    }
    if (prd?.differentiators?.key_differentiators?.length) {
      parts.push(`PRODUCT DIFFERENTIATORS: ${prd.differentiators.key_differentiators.join(', ')}`);
    }
  }

  // Brand guidelines — from org settings or research
  if (brandGuidelines && Object.keys(brandGuidelines).length > 0) {
    const bg = brandGuidelines as Record<string, any>;
    const brandParts: string[] = [];
    if (bg.colors?.length) {
      const colorList = bg.colors.map((c: { hex: string; role: string }) => `${c.role}: ${c.hex}`).join(', ');
      brandParts.push(`Colors: ${colorList}`);
    }
    if (bg.heading_font) brandParts.push(`Heading Font: ${bg.heading_font}`);
    if (bg.body_font) brandParts.push(`Body Font: ${bg.body_font}`);
    if (bg.tone) brandParts.push(`Tone: ${bg.tone}`);
    if (bg.typography?.length) {
      const typo = bg.typography.map((t: { family: string; usage: string }) => `${t.usage}: ${t.family}`).join(', ');
      brandParts.push(`Typography: ${typo}`);
    }
    if (bg.visual_style) brandParts.push(`Visual Style: ${bg.visual_style}`);
    if (bg.logo_url) brandParts.push(`Logo: ${bg.logo_url}`);
    if (brandParts.length > 0) {
      parts.push(`\nBRAND GUIDELINES (use these exact colors, fonts, and tone — do not invent new ones):\n${brandParts.join('\n')}`);
    }
  }

  if (parts.length === 0) return '';
  return `\nBUSINESS CONTEXT (use this to make all content specific to this business):\n${parts.join('\n')}\n`;
}

/**
 * Build context from workspace fields that each phase needs.
 * Unlike v1 which re-injected everything, agents only get relevant data.
 */
function buildWorkspaceContext(
  workspace: { brief: Record<string, unknown>; strategy: Record<string, unknown>; copy: Record<string, unknown>; visuals: Record<string, unknown> } | null | undefined,
  currentPhase: number,
): string {
  if (!workspace) return '';

  const parts: string[] = [];

  // Brief — all agents need this
  if (workspace.brief && Object.keys(workspace.brief).length > 0) {
    const briefStr = JSON.stringify(workspace.brief);
    const truncated = briefStr.length > 2000 ? briefStr.slice(0, 2000) + '...' : briefStr;
    parts.push(`--- BRIEF (approved) ---\n${truncated}`);
  }

  // Strategy — needed by copy, visuals, build phases
  if (currentPhase >= 1 && workspace.strategy && Object.keys(workspace.strategy).length > 0) {
    const stratStr = JSON.stringify(workspace.strategy);
    const truncated = stratStr.length > 2500 ? stratStr.slice(0, 2500) + '...' : stratStr;
    parts.push(`--- STRATEGY (approved) ---\n${truncated}`);
  }

  // Copy — needed by visuals and build phases
  if (currentPhase >= 2 && workspace.copy && Object.keys(workspace.copy).length > 0) {
    const copyStr = JSON.stringify(workspace.copy);
    const truncated = copyStr.length > 2500 ? copyStr.slice(0, 2500) + '...' : copyStr;
    parts.push(`--- COPY (approved) ---\n${truncated}`);
  }

  // Visuals/brand config — injected during assembly phase if available
  if (currentPhase >= 2 && workspace.visuals && Object.keys(workspace.visuals).length > 0) {
    const vis = workspace.visuals as Record<string, unknown>;
    const raw = vis.raw as string | undefined;
    if (raw) {
      const truncated = raw.length > 1500 ? raw.slice(0, 1500) + '...' : raw;
      parts.push(`--- BRAND CONFIG ---\n${truncated}`);
    }
  }

  if (parts.length === 0) return '';
  return `\nPREVIOUS APPROVED OUTPUTS:\n${parts.join('\n\n')}\n`;
}

/**
 * Build research context block for injection into AI messages.
 * Only included in Phase 0 (Strategy) — capped at ~600 tokens.
 */
function buildResearchContext(research: LandingResearchData | null): string {
  if (!research || research.status !== 'complete') return '';

  const parts: string[] = ['\nMARKET RESEARCH (use this data — do not ask the user for info already covered here):'];

  if (research.company) {
    const c = research.company;
    if (c.description) parts.push(`COMPANY: ${c.name} — ${c.description}`);
    if (c.industry) parts.push(`INDUSTRY: ${c.industry}`);
    if (c.differentiators?.length) parts.push(`DIFFERENTIATORS: ${c.differentiators.slice(0, 4).join(', ')}`);
    if (c.pricing_approach) parts.push(`PRICING: ${c.pricing_approach}`);
  }

  if (research.competitors.length > 0) {
    const compLines = research.competitors.slice(0, 5).map(
      (c) => `  - ${c.name}${c.website ? ` (${c.website})` : ''}${c.tagline ? `: ${c.tagline}` : ''}${c.landing_page_patterns?.length ? ` [${c.landing_page_patterns.join(', ')}]` : ''}`,
    );
    parts.push(`COMPETITORS:\n${compLines.join('\n')}`);
  }

  const mc = research.market_context;
  if (mc.social_proof_examples?.length) parts.push(`SOCIAL PROOF: ${mc.social_proof_examples.slice(0, 4).join('; ')}`);
  if (mc.review_ratings?.length) parts.push(`REVIEWS: ${mc.review_ratings.slice(0, 3).join('; ')}`);
  if (mc.notable_customers?.length) parts.push(`NOTABLE CUSTOMERS: ${mc.notable_customers.slice(0, 5).join(', ')}`);
  if (mc.audience_language?.length) parts.push(`AUDIENCE LANGUAGE: ${mc.audience_language.slice(0, 4).join('; ')}`);
  if (mc.buying_triggers?.length) parts.push(`BUYING TRIGGERS: ${mc.buying_triggers.slice(0, 3).join('; ')}`);
  if (mc.pricing_signals?.length) parts.push(`PRICING BENCHMARKS: ${mc.pricing_signals.slice(0, 3).join('; ')}`);
  if (mc.market_trends?.length) parts.push(`MARKET TRENDS: ${mc.market_trends.slice(0, 3).join('; ')}`);

  // Include brand guidelines from research
  if (research.brand_guidelines) {
    const bg = research.brand_guidelines;
    const brandParts: string[] = [];
    if (bg.colors?.length) {
      const colorList = bg.colors.map(c => `${c.role}: ${c.hex}`).join(', ');
      brandParts.push(`Colors: ${colorList}`);
    }
    if (bg.typography?.length) {
      const typo = bg.typography.map(t => `${t.usage}: ${t.family}`).join(', ');
      brandParts.push(`Typography: ${typo}`);
    }
    if (bg.tone) brandParts.push(`Tone: ${bg.tone}`);
    if (bg.visual_style) brandParts.push(`Visual Style: ${bg.visual_style}`);
    if (bg.logo_url) brandParts.push(`Logo: ${bg.logo_url}`);
    if (brandParts.length > 0) {
      parts.push(`BRAND GUIDELINES (extracted from website — use these exact colors and fonts):\n${brandParts.join('\n')}`);
    }
  }

  if (parts.length <= 1) return ''; // Only header, no data
  return parts.join('\n') + '\n';
}

/** Maps 0-based phase index to workspace field key */
const PHASE_KEY_MAP: Record<number, WorkspacePhaseKey> = {
  0: 'brief',
  1: 'copy',
  2: 'visuals', // Assembly stores code via updateCode; visuals key holds brand config
};

// 3 phases — Strategy → Copy → Assembly (progressive build)
const PHASE_PROMPTS = [
  {
    name: 'Strategy & Layout',
    approveNext: `The client approved the strategy and layout.

Now write the COPY for every section. For each section, deliver TWO copy options (A and B) so the client can pick.

Use this exact format for each section:

---

### [Section Name]

**Option A**
> **[Headline]**
> [Subhead — one line]
>
> [Body — 1-2 sentences max]
>
> **CTA:** [button text]

**Option B**
> **[Headline]**
> [Subhead — one line]
>
> [Body — 1-2 sentences max]
>
> **CTA:** [button text]

**Micro-copy:** [form labels, trust line, etc.]

---

Write the actual words. Be specific to this business — use real product names, real outcomes, real numbers. No placeholder text. No explanation paragraphs between sections.`,
  },
  {
    name: 'Copy',
    approveNext: '', // Copy approval triggers assembly mode — handled in handleApprove
  },
  {
    name: 'Assembly',
    approveNext: '', // Final phase — no next
  },
];

interface LandingPageBuilderProps {
  /** Resume at a specific phase (from session recovery) */
  initialPhase?: number;
  /** Resume a specific conversation (from session recovery) */
  initialConversationId?: string;
}

export const LandingPageBuilder: React.FC<LandingPageBuilderProps> = ({
  initialPhase,
  initialConversationId,
}) => {
  const { messages, isLoading, sendMessage, startNewChat, setConversationId, conversationId } = useCopilot();
  const { userId } = useAuth();

  // Load business context from org profile + products
  const activeOrgId = useActiveOrgId();
  const { activeOrg } = useOrg();
  const { data: orgProfile } = useOrgProfile(activeOrgId ?? undefined);
  const { data: products } = useProductProfiles(activeOrgId ?? undefined);

  // Brand guidelines from org settings (or research will supply them)
  const orgBrandGuidelines = (activeOrg as any)?.brand_guidelines ?? null;

  const businessContext = useMemo(
    () => buildBusinessContext(orgProfile, products, orgBrandGuidelines),
    [orgProfile, products, orgBrandGuidelines],
  );

  // Auto-research — runs in parallel with Strategist, never blocks
  const {
    research,
    isResearching,
    startResearch,
    reset: resetResearch,
  } = useLandingResearch({ conversationId });

  // Workspace — DB-backed state that persists across refreshes
  const {
    workspace,
    updatePhaseOutput,
    updateCode,
    advancePhase,
    updateSections,
  } = useLandingBuilderWorkspace({
    conversationId,
    userId: userId ?? undefined,
    orgId: activeOrgId ?? undefined,
  });

  // Track current phase (0-based: 0=Strategy, 1=Copy, 2=Visuals, 3=Build)
  const [currentPhase, setCurrentPhase] = useState(initialPhase ?? workspace?.current_phase ?? 0);
  // Keep a ref of phase outputs for the right panel (also synced to workspace)
  const phaseOutputsRef = useRef<Record<number, string>>({});
  // Use a ref for messages to avoid stale closure in handleApprove
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Assembly mode state — activated after copy approval
  const [isAssemblyMode, setIsAssemblyMode] = useState(false);
  const [assemblySections, setAssemblySections] = useState<LandingSection[]>([]);
  const [assemblyBrandConfig, setAssemblyBrandConfig] = useState<BrandConfig | null>(null);
  const [highlightSectionId, setHighlightSectionId] = useState<string | undefined>();
  const assetQueueRef = useRef<AssetGenerationQueue | null>(null);
  // Chat overlay state for the 3-state floating chat bar
  const [chatOverlayState, setChatOverlayState] = useState<ChatOverlayState>('collapsed');
  // Model tier for intelligence toggle
  const [modelTier, setModelTier] = useState<ModelTier>('balanced');

  // Sync phase from workspace on load
  React.useEffect(() => {
    if (workspace && workspace.current_phase !== currentPhase && messages.length === 0) {
      setCurrentPhase(workspace.current_phase);
    }
  }, [workspace, currentPhase, messages.length]);

  // Session recovery: restore assembly mode from persisted workspace sections
  const sessionRecoveredRef = useRef(false);
  React.useEffect(() => {
    if (sessionRecoveredRef.current || isAssemblyMode) return;
    if (!workspace) return;

    const savedSections = workspace.sections as LandingSection[] | undefined;
    if (!savedSections || savedSections.length === 0) return;
    if (workspace.current_phase < 2) return;

    sessionRecoveredRef.current = true;

    // Reset interrupted generation statuses to idle
    const recovered = savedSections.map(s => ({
      ...s,
      image_status: s.image_status === 'generating' ? 'idle' as const : s.image_status,
      svg_status: s.svg_status === 'generating' ? 'idle' as const : s.svg_status,
    }));

    // Extract brand config from workspace visuals or use defaults
    const vis = (workspace.visuals ?? {}) as Record<string, unknown>;
    const palette = (vis.palette ?? vis.color_palette ?? {}) as Record<string, unknown>;
    const brandConfig: BrandConfig = {
      primary_color: String(palette.primary ?? '#6366f1'),
      secondary_color: String(palette.secondary ?? '#8b5cf6'),
      accent_color: String(palette.accent ?? '#f59e0b'),
      bg_color: String(palette.background ?? palette.bg ?? '#0f172a'),
      text_color: String(palette.text ?? '#f8fafc'),
      font_heading: String((vis.typography as Record<string, unknown>)?.heading ?? 'Inter'),
      font_body: String((vis.typography as Record<string, unknown>)?.body ?? 'Inter'),
    };

    setAssemblySections(recovered);
    setAssemblyBrandConfig(brandConfig);
    setCurrentPhase(2);
    setIsAssemblyMode(true);
  }, [workspace, isAssemblyMode]);

  // Persist assembly sections to workspace (debounced) for session recovery
  React.useEffect(() => {
    if (!isAssemblyMode || assemblySections.length === 0) return;
    const timer = setTimeout(() => {
      updateSections(assemblySections);
    }, 2000);
    return () => clearTimeout(timer);
  }, [assemblySections, isAssemblyMode, updateSections]);

  // Use live research if available, fallback to persisted workspace research
  const effectiveResearch = research ?? (workspace?.research as LandingResearchData | null) ?? null;

  // Derive phase state for the right panel timeline
  const builderState = useLandingBuilderState(currentPhase, phaseOutputsRef.current, messages.length > 0);

  const handleStart = useCallback((seedPrompt: string, wizardAnswers?: Record<string, string>) => {
    // Extract brief from seed prompt for workspace storage
    const briefMatch = seedPrompt.match(/Here is the client's brief[\s\S]*?(?=Now move to)/);
    if (briefMatch && conversationId) {
      const briefText = briefMatch[0].trim();
      phaseOutputsRef.current[-1] = briefText; // -1 = raw brief for display
      updatePhaseOutput({ phase: 'brief', output: { raw: briefText } });
    }

    // Trigger auto-research in parallel (never blocks the user)
    const orgDomain = orgProfile?.research_data?.company_overview?.website
      || orgProfile?.company_domain
      || undefined;
    const orgName = orgProfile?.research_data?.company_overview?.name
      || orgProfile?.company_name
      || undefined;

    if (wizardAnswers) {
      // "Start from scratch" — use wizard answers as research seed
      startResearch({
        brief: wizardAnswers,
        company_domain: orgDomain,
        company_name: orgName,
        org_id: activeOrgId ?? undefined,
      });
    } else {
      // Other entry points — extract context from seed prompt + org profile
      const offerMatch = seedPrompt.match(/offer\/product:\s*(.+)/i);
      const audienceMatch = seedPrompt.match(/audience:\s*(.+)/i);
      const briefFromSeed: Record<string, string> = {};
      if (offerMatch) briefFromSeed.offer = offerMatch[1].trim();
      if (audienceMatch) briefFromSeed.audience = audienceMatch[1].trim();
      if (orgName) briefFromSeed.company = orgName;

      // Only research if we have enough context
      if (Object.keys(briefFromSeed).length > 0 || orgDomain) {
        startResearch({
          brief: briefFromSeed,
          company_domain: orgDomain,
          company_name: orgName,
          org_id: activeOrgId ?? undefined,
        });
      }
    }

    sendMessage('Build me a landing page', {
      apiContent: seedPrompt,
      silent: true,
    });
  }, [sendMessage, conversationId, updatePhaseOutput, orgProfile, activeOrgId, startResearch]);

  const handleNewProject = useCallback(() => {
    startNewChat();
    const newId = uuidv4();
    setConversationId(newId);
    try { localStorage.setItem('sixty_landing_builder_cid', newId); } catch { /* quota */ }
    setCurrentPhase(0);
    phaseOutputsRef.current = {};
    setIsAssemblyMode(false);
    setAssemblySections([]);
    setAssemblyBrandConfig(null);
    assetQueueRef.current?.cancelAll();
    assetQueueRef.current = null;
    resetResearch();
  }, [startNewChat, setConversationId, resetResearch]);

  // Agent system prompts by phase
  const agentSystemPrompts: Record<number, string> = useMemo(() => ({
    0: STRATEGIST_SYSTEM_PROMPT,
    1: COPYWRITER_SYSTEM_PROMPT,
    2: SECTION_EDIT_AGENT_SYSTEM_PROMPT,
  }), []);

  // Build phase-aware context that gets injected into every message
  const researchContext = useMemo(
    () => (currentPhase === 0 ? buildResearchContext(effectiveResearch) : ''),
    [effectiveResearch, currentPhase],
  );

  const builderApiTransform = useCallback((msg: string) => {
    const workspaceContext = buildWorkspaceContext(workspace, currentPhase);
    const agentRole = PHASE_AGENT_MAP[currentPhase];
    const agentLabel = agentRole ? `ACTIVE AGENT: ${agentRole}\n` : '';
    const agentPrompt = agentSystemPrompts[currentPhase] || '';
    const phaseContext = `CURRENT PHASE: ${PHASE_PROMPTS[currentPhase]?.name || 'Unknown'} (phase ${currentPhase + 1} of 3)\n${agentLabel}\n`;

    // During assembly, inject current section state so the editor agent can operate on them
    const sectionContext = isAssemblyMode && assemblySections.length > 0
      ? `\n${buildSectionEditContext(assemblySections)}\n`
      : '';

    // Inject recent conversation history so the agent sees its own questions and user answers.
    const recentHistory = messages
      .slice(-8) // last 8 messages (4 turns)
      .map(m => `[${m.role === 'user' ? 'USER' : 'ASSISTANT'}]: ${m.content.slice(0, 2000)}`)
      .join('\n\n');
    const historyBlock = recentHistory
      ? `\n[CONVERSATION HISTORY — DO NOT repeat questions already answered below]\n${recentHistory}\n[END CONVERSATION HISTORY]\n\n`
      : '';

    return BUILDER_CONTINUATION + agentPrompt + '\n\n' + businessContext + researchContext + workspaceContext + sectionContext + phaseContext + historyBlock + msg;
  }, [currentPhase, businessContext, researchContext, workspace, agentSystemPrompts, messages, isAssemblyMode, assemblySections]);

  // Handle approval — capture output, write to workspace, advance phase
  const handleApprove = useCallback(async (overrideContent?: string) => {
    const phase = PHASE_PROMPTS[currentPhase];

    // Capture phase output (use override or last assistant message)
    if (!overrideContent) {
      const lastAssistantMsg = [...messagesRef.current].reverse().find(m => m.role === 'assistant');
      overrideContent = lastAssistantMsg?.content || '';
    }
    phaseOutputsRef.current[currentPhase] = overrideContent;

    const nextPhase = currentPhase + 1;

    // Write to workspace (async, non-blocking for UI)
    if (conversationId) {
      const phaseKey = PHASE_KEY_MAP[currentPhase];
      if (phaseKey) {
        updatePhaseOutput({ phase: phaseKey, output: { raw: overrideContent } });
      }

      // Advance phase in workspace
      const newStatus: Record<string, string> = { ...workspace?.phase_status };
      newStatus[String(currentPhase)] = 'complete';
      newStatus[String(nextPhase)] = 'active';
      advancePhase({ nextPhase, phaseStatus: newStatus });
    }

    setCurrentPhase(nextPhase);

    // Copy phase approval (phase 1) → trigger assembly mode
    if (currentPhase === 1) {
      const ws = workspace;
      if (ws) {
        try {
          // Strategy output lives in ws.brief (phase 0 approval).
          // It may be raw text or structured JSON — the orchestrator handles both.
          const strategyRaw = (ws.brief ?? {}) as Record<string, unknown>;
          // If strategy was stored as { raw: "..." }, try to parse structured data from it
          const strategyData = typeof strategyRaw.raw === 'string'
            ? (() => { try { return JSON.parse(strategyRaw.raw); } catch { return strategyRaw; } })()
            : strategyRaw;

          const { sections, brandConfig } = parseWorkspaceToSections({
            strategy: strategyData as Record<string, unknown>,
            copy: { raw: overrideContent, ...(ws.copy ?? {}) } as Record<string, unknown>,
            research: (ws.research ?? null) as Record<string, unknown> | null,
            visuals: {},
          });

          setAssemblySections(sections);
          setAssemblyBrandConfig(brandConfig);
          setIsAssemblyMode(true);

          // Start asset generation queue
          const queue = new AssetGenerationQueue({
            onStart: (sectionId, assetType) => {
              setAssemblySections(prev => prev.map(s =>
                s.id === sectionId
                  ? { ...s, [assetType === 'image' ? 'image_status' : 'svg_status']: 'generating' as const }
                  : s
              ));
            },
            onComplete: (sectionId, assetType, result) => {
              setAssemblySections(prev => prev.map(s =>
                s.id === sectionId
                  ? {
                    ...s,
                    [assetType === 'image' ? 'image_url' : 'svg_code']: result,
                    [assetType === 'image' ? 'image_status' : 'svg_status']: 'complete' as const,
                  }
                  : s
              ));
            },
            onError: (sectionId, assetType, _error, willRetry) => {
              if (!willRetry) {
                setAssemblySections(prev => prev.map(s =>
                  s.id === sectionId
                    ? { ...s, [assetType === 'image' ? 'image_status' : 'svg_status']: 'failed' as const }
                    : s
                ));
              }
            },
            onQueueComplete: (stats) => {
              if (stats.failed > 0) {
                toast.warning(`${stats.completed} assets generated, ${stats.failed} failed (using placeholders).`);
              } else {
                toast.success(`All ${stats.completed} assets generated.`);
              }
            },
          });

          queue.populateFromSections(sections, brandConfig);
          assetQueueRef.current = queue;
          queue.process();

          // Send assembly intro message
          sendMessage('Copy approved — assembling your landing page.', {
            apiContent: BUILDER_CONTINUATION + SECTION_EDIT_AGENT_SYSTEM_PROMPT +
              '\n\nThe page is now being assembled with the approved strategy and copy. ' +
              'Assets (images and SVG animations) are generating in the background. ' +
              'The user can now chat to refine individual sections.\n\n' +
              buildSectionEditContext(sections),
            silent: true,
          });
        } catch (err) {
          toast.error('Failed to start assembly. Try approving again.');
          console.error('Assembly failed:', err);
        }
      }
      return;
    }

    // Other phases: send approval prompt to move to next phase
    if (phase?.approveNext) {
      const workspaceContext = buildWorkspaceContext(workspace, nextPhase);
      const fullMessage = BUILDER_CONTINUATION + businessContext + workspaceContext + phase.approveNext;
      sendMessage('Approved. Moving to next phase.', {
        apiContent: fullMessage,
      });
    }
  }, [currentPhase, sendMessage, businessContext, conversationId, workspace, updatePhaseOutput, updateCode, advancePhase]);

  // CopyPicker: user confirmed their A/B selections
  const handleCopyConfirm = useCallback((_selections: Record<string, 'A' | 'B'>, compiledCopy: string) => {
    handleApprove(compiledCopy);
  }, [handleApprove]);

  // Compute phase-specific interactive component
  const phaseComponent = useMemo(() => {
    if (isLoading || messages.length === 0) return undefined;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== 'assistant' || !lastMsg?.content) return undefined;

    // Copy phase: show interactive CopyPicker with A/B cards
    if (currentPhase === 1) {
      const sections = parseCopySections(lastMsg.content);
      if (sections.length > 0) {
        return <CopyPicker markdown={lastMsg.content} onConfirm={handleCopyConfirm} />;
      }
    }

    // Assembly phase: parse section edit responses from AI and apply ops
    if (currentPhase === 2 && isAssemblyMode) {
      try {
        const editResponse = parseSectionEditResponse(lastMsg.content);
        if (editResponse.ops.length > 0) {
          // Apply operations to sections
          setAssemblySections(prev => {
            const updated = [...prev];
            for (const op of editResponse.ops) {
              const idx = updated.findIndex(s => s.id === op.section_id);
              if (idx === -1) continue;
              if (op.field === 'copy.headline') updated[idx] = { ...updated[idx], copy: { ...updated[idx].copy, headline: op.value } };
              else if (op.field === 'copy.subhead') updated[idx] = { ...updated[idx], copy: { ...updated[idx].copy, subhead: op.value } };
              else if (op.field === 'copy.body') updated[idx] = { ...updated[idx], copy: { ...updated[idx].copy, body: op.value } };
              else if (op.field === 'copy.cta') updated[idx] = { ...updated[idx], copy: { ...updated[idx].copy, cta: op.value } };
              else if (op.field === 'style.bg_color') updated[idx] = { ...updated[idx], style: { ...updated[idx].style, bg_color: op.value } };
              else if (op.field === 'style.text_color') updated[idx] = { ...updated[idx], style: { ...updated[idx].style, text_color: op.value } };
              else if (op.field === 'style.accent_color') updated[idx] = { ...updated[idx], style: { ...updated[idx].style, accent_color: op.value } };
              else if (op.field === 'layout_variant') updated[idx] = { ...updated[idx], layout_variant: op.value as any };
            }
            return updated;
          });
          if (editResponse.highlight_section_id) {
            setHighlightSectionId(editResponse.highlight_section_id);
            setTimeout(() => setHighlightSectionId(undefined), 3000);
          }
        }
      } catch {
        // Not a structured edit response — just a chat message
      }
    }

    return undefined;
  }, [messages, isLoading, currentPhase, handleCopyConfirm, isAssemblyMode]);

  // Phase-aware quick actions
  const phaseActions = useMemo<QuickAction[]>(() => {
    if (messages.length === 0) return [];
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== 'assistant' || !lastMsg?.content) return [];

    const phase = PHASE_PROMPTS[currentPhase];
    const isLastPhase = currentPhase >= PHASE_PROMPTS.length - 1;

    const actions: QuickAction[] = [];

    // In assembly mode, show editor-specific actions
    if (isAssemblyMode) {
      actions.push({
        label: 'Change colours',
        prompt: 'I want to change the colour palette.',
        variant: 'secondary',
      });
      actions.push({
        label: 'Edit copy',
        prompt: 'I want to edit some of the copy.',
        variant: 'secondary',
      });
      actions.push({
        label: 'Rearrange sections',
        prompt: 'I want to reorder or remove some sections.',
        variant: 'secondary',
      });
      return actions;
    }

    // Hide Approve button when CopyPicker handles it (phase 1 with valid sections)
    const copyPickerActive = currentPhase === 1 && !!phaseComponent;
    if (!isLastPhase && !copyPickerActive) {
      actions.push({
        label: `Approve ${phase?.name || 'phase'}`,
        prompt: '__APPROVE__',
        variant: 'primary',
      });
    }

    actions.push({
      label: 'I have changes',
      prompt: 'I have some feedback on this before we move on:',
      variant: 'secondary',
    });

    // Edit previous phase button
    if (currentPhase > 0) {
      actions.push({
        label: `Edit ${PHASE_PROMPTS[currentPhase - 1]?.name || 'previous phase'}`,
        prompt: '__EDIT_PREV__',
        variant: 'ghost',
      });
    }

    actions.push({
      label: 'Start over',
      prompt: 'Let\'s start over from the beginning with a different approach.',
      variant: 'ghost',
    });

    return actions;
  }, [messages, currentPhase, phaseComponent, isAssemblyMode]);

  // Agent badge for assistant messages
  const agentBadge = useMemo(() => {
    const role = PHASE_AGENT_MAP[currentPhase];
    if (!role) return undefined;
    const badge = AGENT_BADGES[role];
    return (
      <div className="ml-11 mb-1">
        <span className={`text-xs font-medium ${badge.color}`}>{badge.label}</span>
      </div>
    );
  }, [currentPhase]);

  // Agent identity for the floating chat bar header
  const agentBadgeData = useMemo(() => {
    const role = PHASE_AGENT_MAP[currentPhase];
    if (!role) return { label: 'Assistant', color: 'text-gray-400' };
    return AGENT_BADGES[role];
  }, [currentPhase]);

  // Status text for the chat header
  const chatStatusText = useMemo(() => {
    if (isLoading) return 'is thinking\u2026';
    if (isAssemblyMode && assemblySections.length > 0) {
      return `Building ${assemblySections.length} sections\u2026`;
    }
    return 'Ready';
  }, [isLoading, isAssemblyMode, assemblySections.length]);

  // Last assistant message preview (truncated, stripped of markdown)
  const lastAssistantPreview = useMemo(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant?.content) return undefined;
    const text = lastAssistant.content.replace(/[#*_`>\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 55 ? text.slice(0, 55) + '\u2026' : text;
  }, [messages]);

  // Navigate back to a completed phase for editing
  const handleEditPhase = useCallback((phaseNum: number) => {
    if (phaseNum >= currentPhase) return;
    setCurrentPhase(phaseNum);
    toast.info(`Editing ${PHASE_PROMPTS[phaseNum]?.name || 'phase'}. Approve to continue — later phases will be regenerated.`);
  }, [currentPhase]);

  // Intercept phase action clicks
  const handlePhaseAction = useCallback((prompt: string): boolean => {
    if (prompt === '__APPROVE__') {
      handleApprove();
      return true;
    }
    if (prompt === '__EDIT_PREV__') {
      handleEditPhase(currentPhase - 1);
      return true;
    }
    return false;
  }, [handleApprove, handleEditPhase, currentPhase]);

  // Handle asset regeneration from editor panel
  const handleRegenerateAsset = useCallback((sectionId: string, assetType: 'image' | 'svg') => {
    if (!assetQueueRef.current) return;

    // Mark as generating
    setAssemblySections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, [assetType === 'image' ? 'image_status' : 'svg_status']: 'generating' as const }
        : s
    ));

    // Prioritise puts the item at the front of the queue and restarts processing
    assetQueueRef.current.prioritise(sectionId, assetType);
    assetQueueRef.current.process();
  }, []);

  // Dynamic preview padding based on chat overlay state
  const previewPadding = chatOverlayState === 'collapsed'
    ? 'pb-20'
    : chatOverlayState === 'expanded'
      ? 'pb-[68vh]'
      : 'pb-4';

  // Assembly mode: preview (flex-1) + right editor panel (w-80) + floating chat bar overlay
  if (isAssemblyMode && assemblyBrandConfig) {
    return (
      <div className="relative h-[calc(100dvh-var(--app-top-offset))] w-full flex">
        {/* Preview — fills remaining space */}
        <div className={cn('flex-1 min-w-0 relative', previewPadding)}>
          <AssemblyPreview
            sections={assemblySections}
            brandConfig={assemblyBrandConfig}
            highlightSectionId={highlightSectionId}
            onSectionClick={(id) => setHighlightSectionId(id)}
          />
        </div>

        {/* Right editor panel — section list + properties */}
        <div className="w-80 flex-shrink-0">
          <LandingEditorPanel
            sections={assemblySections}
            onSectionsChange={setAssemblySections}
            onRegenerateAsset={handleRegenerateAsset}
            selectedSectionId={highlightSectionId}
            onSelectSection={(id) => setHighlightSectionId(id)}
          />
        </div>

        {/* Floating chat bar — 3-state overlay */}
        <FloatingChatBar
          apiContentTransform={builderApiTransform}
          phaseActions={phaseActions}
          onPhaseAction={handlePhaseAction}
          phaseComponent={phaseComponent}
          agentLabel={agentBadgeData.label}
          agentColor={agentBadgeData.color}
          statusText={chatStatusText}
          sectionCount={assemblySections.length}
          isAgentWorking={isLoading}
          onChatStateChange={setChatOverlayState}
          lastMessagePreview={lastAssistantPreview}
          modelTier={modelTier}
          onModelTierChange={setModelTier}
        />
      </div>
    );
  }

  // Standard mode: CopilotLayout with right panel (Strategy + Copy phases)
  return (
    <CopilotLayout
      rightPanel={
        <LandingBuilderRightPanel
          phases={builderState.phases}
          currentPhase={builderState.currentPhase}
          deliverables={builderState.deliverables}
          onNewProject={handleNewProject}
          isProcessing={isLoading}
          research={effectiveResearch}
          isResearching={isResearching}
          onPhaseClick={(phaseId) => handleEditPhase(phaseId - 1)}
        />
      }
    >
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 flex flex-col min-h-0 overflow-hidden h-[calc(100dvh-var(--app-top-offset))]">
        <AssistantShell
          mode="page"
          emptyComponent={
            <LandingBuilderEmpty
              onStart={handleStart}
              companyName={orgProfile?.research_data?.company_overview?.name || orgProfile?.company_name || undefined}
              companyDescription={orgProfile?.research_data?.company_overview?.description || undefined}
              productName={products?.[0]?.name || orgProfile?.research_data?.products_services?.products?.[0] || undefined}
              valueProp={
                products?.[0]?.research_data?.value_propositions?.primary_value_prop
                || orgProfile?.research_data?.ideal_customer_indicators?.value_propositions?.[0]
                || undefined
              }
            />
          }
          apiContentTransform={builderApiTransform}
          phaseActions={phaseActions}
          onPhaseAction={handlePhaseAction}
          phaseComponent={phaseComponent}
          messageBadge={agentBadge}
        />
      </div>
    </CopilotLayout>
  );
};
