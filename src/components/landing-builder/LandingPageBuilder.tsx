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
import { useLandingBuilderWorkspace } from '@/lib/hooks/useLandingBuilderWorkspace';
import { CopyPicker, parseCopySections } from './CopyPicker';
import { HeroImageGenerator, parseVisualsForImage } from './HeroImageGenerator';
import { PHASE_AGENT_MAP } from './types';
import { STRATEGIST_SYSTEM_PROMPT } from './agents/strategistAgent';
import { COPYWRITER_SYSTEM_PROMPT } from './agents/copywriterAgent';
import { VISUAL_ARTIST_SYSTEM_PROMPT } from './agents/visualArtistAgent';
import { BUILDER_AGENT_SYSTEM_PROMPT } from './agents/builderAgent';
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
): string {
  if (!orgProfile?.research_data && (!products || products.length === 0)) return '';

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

  // Visuals — needed by build phase
  if (currentPhase >= 3 && workspace.visuals && Object.keys(workspace.visuals).length > 0) {
    const visStr = JSON.stringify(workspace.visuals);
    const truncated = visStr.length > 2500 ? visStr.slice(0, 2500) + '...' : visStr;
    parts.push(`--- VISUALS (approved) ---\n${truncated}`);
  }

  if (parts.length === 0) return '';
  return `\nPREVIOUS APPROVED OUTPUTS:\n${parts.join('\n\n')}\n`;
}

/** Maps 0-based phase index to workspace field key */
const PHASE_KEY_MAP: Record<number, WorkspacePhaseKey> = {
  0: 'brief',
  1: 'copy',
  2: 'visuals',
  3: 'visuals', // Build phase doesn't have its own key; code is stored separately
};

// 4 phases — each approval gate shows something visual, not text walls.
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
    approveNext: `The client approved the copy.

Now deliver the VISUAL DIRECTION with actual visual examples. Include ALL of these:

**1. Color Palette**
IMPORTANT: Wrap every hex code in backticks so they render as color swatches.
Show the exact palette using this format — each color on its own line:
- Primary: \`#0A0A0F\` — [what it's used for]
- Secondary: \`#1A1A2E\` — [what it's used for]
- Accent: \`#5B5BD6\` — [what it's used for]
- Background: \`#F5F5F5\`
- Text: \`#1A1A1A\`
(Replace the example hex values above with the actual colors for this brand.)

**2. Typography**
- Headings: [Google Font name], [weight] — [why this font]
- Body: [Google Font name], [weight]

**3. Hero Image Concept**
Describe the hero image in vivid detail (what it shows, the mood, the lighting, the composition). Be specific enough that an AI image generator could create it.

**4. SVG Animations**
Create 2-3 actual inline SVG animations. Output each one in a fenced code block with language "svg". They will render as live animations in the chat. Ideas:
- A subtle animated accent element (pulsing ring, flowing lines)
- A decorative section divider with motion
- An animated background pattern (floating dots, geometric shapes)

Each SVG should:
- Use the color palette hex codes from above
- Be self-contained (no external dependencies)
- Include \`<style>\` with CSS @keyframes animation inside the SVG
- Be 200-400px wide, under 30 lines of code
- Actually animate (use animation-duration, animation-iteration-count: infinite)

**5. Icon Style**
Recommend an icon set (Lucide, Phosphor, etc.) and list the specific icon names for each section.

Deliver actual visual assets where possible, not just descriptions.`,
  },
  {
    name: 'Visuals & Animation',
    approveNext: `The client approved the visual direction and animations.

Now BUILD the landing page. Write a single production-ready React + Tailwind component that includes:
- All sections from the approved layout with the EXACT approved copy (headlines, subheads, body, CTAs)
- The exact colors, fonts, and visual style from the approved direction
- The SVG animations from the approved visuals — embed them directly
- Responsive breakpoints (mobile-first)
- Working form with proper validation
- Icons from the approved icon set (lucide-react)
- Smooth scroll-triggered animations using CSS or framer-motion

IMPORTANT: Use the exact copy from the APPROVED COPY SELECTIONS above. Do not rewrite or paraphrase.

Output the complete code in a single code block. No explanation needed.`,
  },
  {
    name: 'Build',
    approveNext: '', // Final phase — no next
  },
];

export const LandingPageBuilder: React.FC = () => {
  const { messages, isLoading, sendMessage, startNewChat, setConversationId, conversationId } = useCopilot();
  const { userId } = useAuth();

  // Load business context from org profile + products
  const activeOrgId = useActiveOrgId();
  const { data: orgProfile } = useOrgProfile(activeOrgId ?? undefined);
  const { data: products } = useProductProfiles(activeOrgId ?? undefined);
  const businessContext = useMemo(
    () => buildBusinessContext(orgProfile, products),
    [orgProfile, products],
  );

  // Workspace — DB-backed state that persists across refreshes
  const {
    workspace,
    updatePhaseOutput,
    updateCode,
    advancePhase,
  } = useLandingBuilderWorkspace({
    conversationId,
    userId: userId ?? undefined,
    orgId: activeOrgId ?? undefined,
  });

  // Track current phase (0-based: 0=Strategy, 1=Copy, 2=Visuals, 3=Build)
  const [currentPhase, setCurrentPhase] = useState(workspace?.current_phase ?? 0);
  // Keep a ref of phase outputs for the right panel (also synced to workspace)
  const phaseOutputsRef = useRef<Record<number, string>>({});
  // Use a ref for messages to avoid stale closure in handleApprove
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Generated hero image URL from Nano Banana
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

  // Sync phase from workspace on load
  React.useEffect(() => {
    if (workspace && workspace.current_phase !== currentPhase && messages.length === 0) {
      setCurrentPhase(workspace.current_phase);
    }
  }, [workspace, currentPhase, messages.length]);

  // Derive phase state for the right panel timeline
  const builderState = useLandingBuilderState(currentPhase, phaseOutputsRef.current, messages.length > 0);

  const handleStart = useCallback((seedPrompt: string) => {
    // Extract brief from seed prompt for workspace storage
    const briefMatch = seedPrompt.match(/Here is the client's brief[\s\S]*?(?=Now move to)/);
    if (briefMatch && conversationId) {
      const briefText = briefMatch[0].trim();
      phaseOutputsRef.current[-1] = briefText; // -1 = raw brief for display
      updatePhaseOutput({ phase: 'brief', output: { raw: briefText } });
    }
    sendMessage('Build me a landing page', {
      apiContent: seedPrompt,
      silent: true,
    });
  }, [sendMessage, conversationId, updatePhaseOutput]);

  const handleNewProject = useCallback(() => {
    startNewChat();
    setConversationId(uuidv4());
    setCurrentPhase(0);
    phaseOutputsRef.current = {};
    setGeneratedImageUrl(null);
  }, [startNewChat, setConversationId]);

  // Agent system prompts by phase
  const agentSystemPrompts: Record<number, string> = useMemo(() => ({
    0: STRATEGIST_SYSTEM_PROMPT,
    1: COPYWRITER_SYSTEM_PROMPT,
    2: VISUAL_ARTIST_SYSTEM_PROMPT,
    3: BUILDER_AGENT_SYSTEM_PROMPT,
  }), []);

  // Build phase-aware context that gets injected into every message
  const builderApiTransform = useCallback((msg: string) => {
    const workspaceContext = buildWorkspaceContext(workspace, currentPhase);
    const agentRole = PHASE_AGENT_MAP[currentPhase];
    const agentLabel = agentRole ? `ACTIVE AGENT: ${agentRole}\n` : '';
    const agentPrompt = agentSystemPrompts[currentPhase] || '';
    const phaseContext = `CURRENT PHASE: ${PHASE_PROMPTS[currentPhase]?.name || 'Unknown'} (phase ${currentPhase + 1} of 4)\n${agentLabel}\n`;
    return BUILDER_CONTINUATION + agentPrompt + '\n\n' + businessContext + workspaceContext + phaseContext + msg;
  }, [currentPhase, businessContext, workspace, agentSystemPrompts]);

  // Handle approval — capture output, write to workspace, advance phase
  const handleApprove = useCallback(async (overrideContent?: string) => {
    const phase = PHASE_PROMPTS[currentPhase];
    if (!phase?.approveNext) return;

    // Capture phase output (use override or last assistant message)
    if (!overrideContent) {
      const lastAssistantMsg = [...messagesRef.current].reverse().find(m => m.role === 'assistant');
      overrideContent = lastAssistantMsg?.content || '';
    }
    phaseOutputsRef.current[currentPhase] = overrideContent;

    // Include generated hero image URL in visuals output
    if (generatedImageUrl && currentPhase === 2) {
      overrideContent += `\n\nGENERATED HERO IMAGE URL: ${generatedImageUrl}`;
      phaseOutputsRef.current[currentPhase] = overrideContent;
    }

    const nextPhase = currentPhase + 1;

    // Write to workspace (async, non-blocking for UI)
    if (conversationId) {
      const phaseKey = PHASE_KEY_MAP[currentPhase];
      if (phaseKey) {
        updatePhaseOutput({ phase: phaseKey, output: { raw: overrideContent } });
      }

      // If build phase, store as code
      if (currentPhase === 3) {
        updateCode(overrideContent);
      }

      // Advance phase in workspace
      const newStatus: Record<string, string> = { ...workspace?.phase_status };
      newStatus[String(currentPhase)] = 'complete';
      newStatus[String(nextPhase)] = 'active';
      advancePhase({ nextPhase, phaseStatus: newStatus });
    }

    setCurrentPhase(nextPhase);
    setGeneratedImageUrl(null);

    // Build context from workspace for next phase
    const workspaceContext = buildWorkspaceContext(workspace, nextPhase);
    const fullMessage = BUILDER_CONTINUATION + businessContext + workspaceContext + phase.approveNext;

    sendMessage('Approved. Moving to next phase.', {
      apiContent: fullMessage,
    });
  }, [currentPhase, sendMessage, businessContext, generatedImageUrl, conversationId, workspace, updatePhaseOutput, updateCode, advancePhase]);

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

    // Visuals phase: show HeroImageGenerator with style presets
    if (currentPhase === 2) {
      const { heroDescription, brandColors } = parseVisualsForImage(lastMsg.content);
      if (heroDescription) {
        return (
          <HeroImageGenerator
            description={heroDescription}
            brandColors={brandColors}
            onSelected={setGeneratedImageUrl}
          />
        );
      }
    }

    return undefined;
  }, [messages, isLoading, currentPhase, handleCopyConfirm]);

  // Phase-aware quick actions
  const phaseActions = useMemo<QuickAction[]>(() => {
    if (messages.length === 0) return [];
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== 'assistant' || !lastMsg?.content) return [];

    const phase = PHASE_PROMPTS[currentPhase];
    const isLastPhase = currentPhase >= PHASE_PROMPTS.length - 1;

    const actions: QuickAction[] = [];

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

    actions.push({
      label: 'Start over',
      prompt: 'Let\'s start over from the beginning with a different approach.',
      variant: 'ghost',
    });

    return actions;
  }, [messages, currentPhase, phaseComponent]);

  // Intercept phase action clicks
  const handlePhaseAction = useCallback((prompt: string): boolean => {
    if (prompt === '__APPROVE__') {
      handleApprove();
      return true;
    }
    return false;
  }, [handleApprove]);

  return (
    <CopilotLayout
      rightPanel={
        <LandingBuilderRightPanel
          phases={builderState.phases}
          currentPhase={builderState.currentPhase}
          deliverables={builderState.deliverables}
          onNewProject={handleNewProject}
          isProcessing={isLoading}
          phaseOutputs={phaseOutputsRef.current}
          activePhase={currentPhase}
          heroImageUrl={generatedImageUrl}
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
        />
      </div>
    </CopilotLayout>
  );
};
