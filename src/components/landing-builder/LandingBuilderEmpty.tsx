/**
 * Landing Page Builder Empty State
 * Welcome screen with 5 starter cards → discovery wizard → compiled brief
 */

import React, { useState } from 'react';
import { Layers, FileText, Palette, Code, Layout, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PIPELINE_PHASES } from './types';
import { DiscoveryWizard } from './DiscoveryWizard';
import { TemplateGallery } from './TemplateGallery';
import type { LandingTemplate } from './templates';

interface LandingBuilderEmptyProps {
  onStart: (seedPrompt: string, wizardAnswers?: Record<string, string>) => void;
  /** Callback when user selects a pre-built template */
  onSelectTemplate?: (template: LandingTemplate) => void;
  /** Pre-loaded company name from org profile */
  companyName?: string;
  /** Pre-loaded company description */
  companyDescription?: string;
  /** Pre-loaded product/service name */
  productName?: string;
  /** Pre-loaded value proposition */
  valueProp?: string;
}

/**
 * Continuation preamble — re-injected on every follow-up message so the AI
 * stays in "landing page strategist" mode. Shorter than the seed preamble
 * because the AI already knows the format from the first turn.
 *
 * The edge function currently sends only the current message to Claude
 * (no conversation history), so we need to re-inject context every turn.
 */
export const BUILDER_CONTINUATION = `[INSTRUCTIONS — follow these exactly]
You are a senior landing page strategist having a direct conversation with a client.
RULES:
- Never mention skills, tools, sequences, systems, or internal processes.
- Never say "let me check", "let me retrieve", "I found", or narrate your actions.
- Never search for documentation or use tools. Just continue the conversation.
- Never use emoji. No emoji anywhere.
- Be CONCISE. Use bullet points and structured formatting. No walls of text.
- Keep total responses under 400 words unless writing code.
- Use bold section headers. Use short bullet points, not paragraphs.
- Be specific to THIS business. Use real product names, real outcomes, real numbers from the business context.
- Never give generic marketing advice. Every word should reference this specific business.
- Be opinionated. Recommend what works, don't list options.
[END INSTRUCTIONS]

`;

const SKIP_PREAMBLE = `[INSTRUCTIONS — follow these exactly]
You are a senior landing page strategist having a direct conversation with a client.
RULES:
- Never mention skills, tools, sequences, systems, or internal processes.
- Never say "let me check", "let me retrieve", "I found", or narrate your actions.
- Never search for documentation or use tools. Just continue the conversation.
- Never show tables explaining the process.
- Never use emoji. No emoji anywhere.
- Talk like a human consultant: direct, confident, conversational.
- Be specific and opinionated.
[END INSTRUCTIONS]

`;

const starterCards = [
  {
    id: 'scratch',
    icon: Layers,
    label: 'Start from scratch',
    desc: 'Guided brief with your context',
    iconColor: 'text-violet-400',
    action: 'wizard' as const,
  },
  {
    id: 'brief',
    icon: FileText,
    label: 'I have a brief',
    desc: 'Skip to wireframing',
    iconColor: 'text-emerald-400',
    action: 'prompt' as const,
    prompt: SKIP_PREAMBLE + 'I have my landing page brief ready. Here it is:\n\n[Paste your brief here]',
  },
  {
    id: 'style-copy',
    icon: Palette,
    label: 'I have style + copy',
    desc: 'Skip to asset generation',
    iconColor: 'text-amber-400',
    action: 'prompt' as const,
    prompt: SKIP_PREAMBLE + 'I have my style direction and copy ready. Skip to asset generation.\n\n[Paste your style and copy here]',
  },
  {
    id: 'build',
    icon: Code,
    label: 'Just build it',
    desc: 'I have everything ready',
    iconColor: 'text-blue-400',
    action: 'prompt' as const,
    prompt: SKIP_PREAMBLE + 'Build this landing page with everything I\'m about to provide. Go straight to production code.\n\n[Paste your complete spec here]',
  },
  {
    id: 'template',
    icon: Layout,
    label: 'Start from Template',
    desc: 'Pre-built page you can customize',
    iconColor: 'text-pink-400',
    action: 'template' as const,
  },
];

export const LandingBuilderEmpty: React.FC<LandingBuilderEmptyProps> = ({
  onStart,
  onSelectTemplate,
  companyName,
  companyDescription,
  productName,
  valueProp,
}) => {
  const [showWizard, setShowWizard] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);

  const handleCardClick = (card: typeof starterCards[number]) => {
    if (card.action === 'wizard') {
      setShowWizard(true);
    } else if (card.action === 'template') {
      setShowTemplateGallery(true);
    } else if (card.prompt) {
      onStart(card.prompt);
    }
  };

  if (showWizard) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full px-3 sm:px-4 py-6 sm:py-8 overflow-y-auto">
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
          <div className="text-center mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
              Quick Brief
            </h1>
            <p className="text-gray-500 dark:text-slate-400 text-sm">
              7 quick questions to get started
            </p>
          </div>
          <DiscoveryWizard
            onComplete={(brief, answers) => onStart(brief, answers)}
            companyName={companyName}
            companyDescription={companyDescription}
            productName={productName}
            valueProp={valueProp}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full px-3 sm:px-4 py-6 sm:py-8 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
        {/* Welcome Section */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2 bg-gradient-to-r from-gray-900 dark:from-white via-gray-900 dark:via-white to-gray-500 dark:to-slate-400 bg-clip-text text-transparent">
            Build a Landing Page
          </h1>
          <p className="text-gray-600 dark:text-slate-400 text-sm sm:text-base">
            From strategy to production code in one conversation
          </p>
        </div>

        {/* Starter Cards Grid — top 4 in 2x2, template card full-width below */}
        <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
          {starterCards.slice(0, 4).map((card) => (
            <button
              key={card.id}
              onClick={() => handleCardClick(card)}
              className={cn(
                'group relative p-5 rounded-2xl text-left transition-all',
                'bg-white dark:bg-white/[0.03] backdrop-blur-xl',
                'border border-gray-200 dark:border-white/10',
                'hover:bg-gray-50 dark:hover:bg-white/[0.06]',
                'hover:border-gray-300 dark:hover:border-white/20',
                'hover:scale-[1.02] hover:shadow-xl dark:hover:shadow-violet-500/10',
                'focus:outline-none focus:ring-2 focus:ring-violet-500'
              )}
            >
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                  'bg-white/5 dark:bg-white/[0.08] backdrop-blur-xl',
                  'border border-gray-200/50 dark:border-white/10',
                  'group-hover:bg-white/10 dark:group-hover:bg-white/[0.12]',
                  'group-hover:border-gray-300/50 dark:group-hover:border-white/20',
                  'group-hover:scale-110 transition-all shadow-lg shadow-black/5'
                )}
              >
                <card.icon className={cn('w-6 h-6', card.iconColor)} />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                {card.label}
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-400 transition-colors">
                {card.desc}
              </p>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </button>
          ))}
        </div>

        {/* Template card — full width accent row */}
        {(() => {
          const templateCard = starterCards[4];
          if (!templateCard) return null;
          const TemplateIcon = templateCard.icon;
          return (
            <div className="w-full max-w-2xl mb-6">
              <button
                onClick={() => handleCardClick(templateCard)}
                className={cn(
                  'group relative w-full p-4 sm:p-5 rounded-2xl text-left transition-all flex items-center gap-4',
                  'bg-white dark:bg-white/[0.03] backdrop-blur-xl',
                  'border border-gray-200 dark:border-white/10',
                  'hover:bg-gray-50 dark:hover:bg-white/[0.06]',
                  'hover:border-gray-300 dark:hover:border-white/20',
                  'hover:scale-[1.01] hover:shadow-xl dark:hover:shadow-pink-500/10',
                  'focus:outline-none focus:ring-2 focus:ring-violet-500'
                )}
              >
                <div
                  className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                    'bg-white/5 dark:bg-white/[0.08] backdrop-blur-xl',
                    'border border-gray-200/50 dark:border-white/10',
                    'group-hover:bg-white/10 dark:group-hover:bg-white/[0.12]',
                    'group-hover:border-gray-300/50 dark:group-hover:border-white/20',
                    'group-hover:scale-110 transition-all shadow-lg shadow-black/5'
                  )}
                >
                  <TemplateIcon className={cn('w-6 h-6', templateCard.iconColor)} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white mb-0.5 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                    {templateCard.label}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-400 transition-colors">
                    {templateCard.desc}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 dark:text-slate-600 ml-auto flex-shrink-0 group-hover:text-gray-400 dark:group-hover:text-slate-500 transition-colors" />
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </button>
            </div>
          );
        })()}

        {/* Pipeline Overview */}
        <div className="w-full max-w-2xl">
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase mb-4 text-center tracking-wider">
            The Pipeline
          </p>
          <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
            {PIPELINE_PHASES.map((phase, idx) => (
              <React.Fragment key={phase.id}>
                <span
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium',
                    'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10',
                    'text-gray-600 dark:text-slate-400'
                  )}
                >
                  {phase.name}
                </span>
                {idx < PIPELINE_PHASES.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-gray-300 dark:text-slate-600 flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Template Gallery Modal */}
      {showTemplateGallery && onSelectTemplate && (
        <TemplateGallery
          onSelect={(template) => {
            setShowTemplateGallery(false);
            onSelectTemplate(template);
          }}
          onClose={() => setShowTemplateGallery(false)}
        />
      )}
    </div>
  );
};
