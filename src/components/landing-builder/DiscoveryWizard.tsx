/**
 * Discovery Wizard
 *
 * Multi-step wizard that collects landing page brief info through 7 questions.
 * All questions are defined client-side — no AI round-trips needed.
 * On completion, sends a compiled brief as a single message to the AI.
 *
 * Auto-populates business context from the org profile when available,
 * and includes a free-text step for the specific offer/product.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ArrowLeft, ArrowRight, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUILDER_CONTINUATION } from './LandingBuilderEmpty';

interface WizardQuestion {
  id: string;
  question: string;
  /** Chip options — if empty, renders a free-text input instead */
  options: string[];
  /** Placeholder text for free-text input */
  placeholder?: string;
  /** If true, show a "skip" link below the input */
  skippable?: boolean;
}

interface DiscoveryWizardProps {
  onComplete: (compiledBrief: string) => void;
  /** Pre-loaded company name from org profile */
  companyName?: string;
  /** Pre-loaded company description */
  companyDescription?: string;
  /** Pre-loaded product/service name */
  productName?: string;
  /** Pre-loaded value proposition */
  valueProp?: string;
}

// Reduced to 5 questions — tone and sections are inferred by the Strategist agent
const DISCOVERY_QUESTIONS: WizardQuestion[] = [
  {
    id: 'page_type',
    question: "What kind of page are we making?",
    options: ['Landing page', 'Homepage', 'Feature page', 'Pricing page'],
  },
  {
    id: 'goal',
    question: "What's the main goal?",
    options: ['Generate leads', 'Sell a product', 'Promote an event', 'Drive app downloads', 'Build an email list'],
  },
  {
    id: 'offer',
    question: "What's the specific offer or product this page is for?",
    options: [],
    placeholder: 'e.g. "AI sales assistant that automates follow-ups" or "Free consultation for B2B SaaS companies"',
  },
  {
    id: 'audience',
    question: "Who is this for? Be specific.",
    options: [],
    placeholder: 'e.g. "B2B SaaS founders doing $1-10M ARR who don\'t have a sales team"',
  },
  {
    id: 'outcome',
    question: "What result does the visitor get?",
    options: [],
    placeholder: 'e.g. "Book more meetings without hiring SDRs" or "Cut proposal time from 3 hours to 10 minutes"',
  },
];

function compileBrief(answers: Record<string, string>): string {
  return `${BUILDER_CONTINUATION}Here is the client's brief from the discovery questions:
- Page type: ${answers.page_type}
- Primary goal: ${answers.goal}
- Specific offer/product: ${answers.offer}
- Target audience: ${answers.audience}
- Key outcome for visitor: ${answers.outcome}

Now move to the STRATEGY phase. First, check the brief for any gaps:
- Are competitors mentioned? If not, ask.
- Is the audience specific enough? If vague, ask.
- Is there social proof available? If not mentioned, ask.

If you detect gaps, ask 2-3 targeted follow-up questions FIRST. Then, once answered, deliver the strategy.

If the brief is strong enough, skip the follow-ups and deliver STRATEGY & LAYOUT directly:

**PART 1 — PAGE STRATEGY** (3 sentences max — the conversion thesis)

**PART 2 — SECTION LAYOUT**
For each section, use this exact format:

**[Section Name]** — [purpose in 5 words]
Layout: [full-width / two-column / centered / asymmetric]
Elements: [headline, subhead, image, form, button, stats, logos, etc.]
CTA: [button text] (if applicable)
Conversion lever: [social proof / urgency / authority / specificity]

Keep each section to 4 lines max. Be specific to this business — use real product names and outcomes. No generic marketing advice. No paragraphs.`;
}

export const DiscoveryWizard: React.FC<DiscoveryWizardProps> = ({
  onComplete,
  companyName,
  companyDescription,
  productName,
  valueProp,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [textInput, setTextInput] = useState('');
  const [direction, setDirection] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const total = DISCOVERY_QUESTIONS.length;
  const current = DISCOVERY_QUESTIONS[currentStep];
  const isLastStep = currentStep === total - 1;
  const isFreeText = current?.options.length === 0;

  // Pre-populate free-text fields from org data
  useEffect(() => {
    if (!current) return;
    const existing = answers[current.id];
    if (existing) {
      setTextInput(existing);
      return;
    }
    // Auto-fill from org profile
    if (current.id === 'offer' && productName) {
      setTextInput(productName + (companyDescription ? ` — ${companyDescription}` : ''));
    } else if (current.id === 'outcome' && valueProp) {
      setTextInput(valueProp);
    } else {
      setTextInput('');
    }
  }, [currentStep, current, answers, productName, companyDescription, valueProp]);

  // Focus textarea on free-text steps
  useEffect(() => {
    if (isFreeText && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [currentStep, isFreeText]);

  const advance = useCallback((newAnswers: Record<string, string>) => {
    if (isLastStep) {
      setTimeout(() => onComplete(compileBrief(newAnswers)), 400);
    } else {
      setTimeout(() => {
        setDirection(1);
        setCurrentStep((s) => s + 1);
      }, 300);
    }
  }, [isLastStep, onComplete]);

  const handleSelect = useCallback((option: string) => {
    const newAnswers = { ...answers, [current.id]: option };
    setAnswers(newAnswers);
    advance(newAnswers);
  }, [answers, current, advance]);

  const handleTextSubmit = useCallback(() => {
    const val = textInput.trim();
    if (!val) return;
    const newAnswers = { ...answers, [current.id]: val };
    setAnswers(newAnswers);
    setTextInput('');
    advance(newAnswers);
  }, [textInput, answers, current, advance]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const selectedForCurrent = answers[current?.id];

  // Get display label for completed answers (truncate long text)
  const chipLabel = (qId: string) => {
    const val = answers[qId];
    if (!val) return '';
    return val.length > 30 ? val.slice(0, 27) + '...' : val;
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Business context banner if org data is loaded */}
      {companyName && currentStep === 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'mb-3 px-4 py-2.5 rounded-xl flex items-center gap-2.5',
            'bg-emerald-500/10 border border-emerald-500/20',
            'text-emerald-700 dark:text-emerald-400 text-sm'
          )}
        >
          <Building2 className="w-4 h-4 flex-shrink-0" />
          <span>Building for <strong>{companyName}</strong> — we&apos;ll use your profile to personalize everything.</span>
        </motion.div>
      )}

      <div className={cn(
        'rounded-2xl overflow-hidden',
        'bg-white dark:bg-white/[0.03] backdrop-blur-xl',
        'border border-gray-200 dark:border-white/10',
        'shadow-lg dark:shadow-none',
      )}>
        {/* Header with progress */}
        <div className="px-6 pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Quick Brief
              </span>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {currentStep + 1} of {total}
            </span>
          </div>

          {/* Progress bar */}
          <div className="flex gap-1">
            {Array.from({ length: total }, (_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-all duration-500',
                  i < currentStep
                    ? 'bg-emerald-500'
                    : i === currentStep
                      ? 'bg-violet-500'
                      : 'bg-gray-200 dark:bg-gray-700/50'
                )}
              />
            ))}
          </div>
        </div>

        {/* Question + Options or Text Input */}
        <div className="px-6 pb-6 min-h-[200px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <p className="text-base font-semibold text-gray-900 dark:text-white mb-4 mt-2">
                {current.question}
              </p>

              {isFreeText ? (
                /* Free-text input for specific business context */
                <div className="space-y-3">
                  <textarea
                    ref={textareaRef}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleTextSubmit();
                      }
                    }}
                    placeholder={current.placeholder}
                    rows={3}
                    className={cn(
                      'w-full px-4 py-3 rounded-xl text-sm resize-none',
                      'bg-gray-50 dark:bg-white/[0.04]',
                      'border border-gray-200 dark:border-white/10',
                      'text-gray-900 dark:text-gray-100',
                      'placeholder:text-gray-400 dark:placeholder:text-gray-600',
                      'focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400',
                    )}
                  />
                  <button
                    type="button"
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim()}
                    className={cn(
                      'w-full px-4 py-2.5 rounded-xl text-sm font-medium',
                      'flex items-center justify-center gap-2 transition-all',
                      textInput.trim()
                        ? 'bg-violet-500 text-white hover:bg-violet-600 cursor-pointer'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed',
                    )}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* Chip selection */
                <div className="grid grid-cols-2 gap-2">
                  {current.options.map((option, index) => {
                    const isSelected = selectedForCurrent === option;
                    return (
                      <motion.button
                        key={option}
                        type="button"
                        onClick={() => handleSelect(option)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: index * 0.04 }}
                        className={cn(
                          'px-4 py-3 rounded-xl text-sm font-medium text-left transition-all duration-150',
                          'border focus:outline-none focus:ring-2 focus:ring-violet-500/40',
                          isSelected
                            ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/50 shadow-sm'
                            : 'bg-gray-50 dark:bg-white/[0.04] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50/50 dark:hover:bg-violet-500/5 cursor-pointer'
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span>{option}</span>
                          {isSelected && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                            >
                              <CheckCircle2 className="w-4 h-4 text-violet-500 flex-shrink-0" />
                            </motion.span>
                          )}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Answer summary chips (completed questions) */}
        {currentStep > 0 && (
          <div className="px-6 pb-4 flex flex-wrap gap-1.5">
            {DISCOVERY_QUESTIONS.slice(0, currentStep).map((q) => (
              <span
                key={q.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
              >
                <CheckCircle2 className="w-3 h-3" />
                {chipLabel(q.id)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
