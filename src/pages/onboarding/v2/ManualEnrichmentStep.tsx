/**
 * ManualEnrichmentStep
 *
 * Q&A flow for users without a website.
 * Collects company information through a series of questions,
 * then uses AI to generate skill configurations based on answers.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronLeft,
  Building2,
  Users,
  Package,
  Target,
  Sparkles,
  Check,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnboardingV2Store, ManualEnrichmentData } from '@/lib/stores/onboardingV2Store';
import { toast } from 'sonner';

const MAX_CHAR_SINGLE = 200;
const MAX_CHAR_MULTI = 800;

interface ManualEnrichmentStepProps {
  organizationId: string;
}

interface Question {
  id: keyof ManualEnrichmentData;
  question: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
  multiline?: boolean;
  optional?: boolean;
  hint?: string;
}

const QUESTIONS: Question[] = [
  {
    id: 'company_name',
    question: "What's your company or product called?",
    placeholder: 'e.g., Acme Software',
    icon: Building2,
    hint: "This will be used throughout your assistant's responses",
  },
  {
    id: 'company_description',
    question: 'In a sentence or two, what does your company do?',
    placeholder: 'e.g., We help sales teams automate their outreach and track deal progress',
    icon: Sparkles,
    multiline: true,
    hint: 'This helps us understand your core value proposition',
  },
  {
    id: 'industry',
    question: 'What industry are you in?',
    placeholder: 'e.g., B2B SaaS, Healthcare, E-commerce, Financial Services',
    icon: Building2,
  },
  {
    id: 'target_customers',
    question: 'Who are your ideal customers?',
    placeholder: 'e.g., Mid-market companies with 50-500 employees, VPs of Sales',
    icon: Target,
    multiline: true,
    hint: "Describe the companies and people you're trying to reach",
  },
  {
    id: 'main_products',
    question: 'What are your main products or services?',
    placeholder: 'e.g., CRM software, Sales automation, Analytics dashboard',
    icon: Package,
    multiline: true,
  },
  {
    id: 'competitors',
    question: 'Who do you compete with?',
    placeholder: 'e.g., Salesforce, HubSpot, Pipedrive',
    icon: Users,
    hint: 'Knowing your competitors helps us craft better positioning',
  },
];

export function ManualEnrichmentStep({ organizationId: propOrgId }: ManualEnrichmentStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<ManualEnrichmentData>>({
    company_name: '',
    company_description: '',
    industry: '',
    target_customers: '',
    main_products: '',
    competitors: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { organizationId: storeOrgId, setManualData, submitManualEnrichment, setStep } = useOnboardingV2Store();

  // Use organizationId from store (which gets updated when new org is created)
  // Fall back to prop if store is empty
  const organizationId = storeOrgId || propOrgId;

  const currentQuestion = QUESTIONS[currentIndex];
  const isLastQuestion = currentIndex === QUESTIONS.length - 1;
  const progress = ((currentIndex + 1) / QUESTIONS.length) * 100;

  const handleNext = async () => {
    const currentAnswer = answers[currentQuestion.id]?.trim();

    // Validate required fields
    if (!currentQuestion.optional && !currentAnswer) {
      setError('Please answer this question to continue');
      return;
    }

    setError(null);

    if (isLastQuestion) {
      // Submit all answers
      const manualData: ManualEnrichmentData = {
        company_name: answers.company_name || '',
        company_description: answers.company_description || '',
        industry: answers.industry || '',
        target_customers: answers.target_customers || '',
        main_products: answers.main_products || '',
        competitors: answers.competitors || '',
      };

      setManualData(manualData);
      setIsSubmitting(true);
      try {
        await submitManualEnrichment(organizationId);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to submit. Please try again.';
        toast.error(errorMessage);
        console.error('Manual enrichment submission error:', err);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setError(null);
    } else {
      // Go back to website input
      setStep('website_input');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !currentQuestion.multiline) {
      e.preventDefault();
      handleNext();
    }
  };

  const Icon = currentQuestion.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full max-w-lg mx-auto px-4"
    >
      <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 overflow-hidden">
        {/* Progress Bar */}
        <div className="h-1 bg-gray-800">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-violet-600"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="p-8 sm:p-10">
          {/* Question Counter */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm text-gray-500">
              Question {currentIndex + 1} of {QUESTIONS.length}
            </span>
            <div className="flex gap-1">
              {QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i <= currentIndex ? 'bg-violet-500' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Question Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center">
                  <Icon className="w-8 h-8 text-violet-400" />
                </div>
              </div>

              {/* Question */}
              <h2 className="text-xl font-bold text-white text-center mb-2">
                {currentQuestion.question}
              </h2>

              {currentQuestion.hint && (
                <p className="text-sm text-gray-500 text-center mb-6">
                  {currentQuestion.hint}
                </p>
              )}

              {/* Input */}
              <div className="mt-6">
                {currentQuestion.multiline ? (
                  <>
                    <textarea
                      value={answers[currentQuestion.id] || ''}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_CHAR_MULTI) {
                          setAnswers({ ...answers, [currentQuestion.id]: e.target.value });
                          setError(null);
                        }
                      }}
                      maxLength={MAX_CHAR_MULTI}
                      placeholder={currentQuestion.placeholder}
                      rows={3}
                      className="w-full px-4 py-4 rounded-xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all resize-none"
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 text-right mt-1">
                      {(answers[currentQuestion.id] || '').length}/{MAX_CHAR_MULTI}
                    </p>
                  </>
                ) : (
                  <input
                    type="text"
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => {
                      if (e.target.value.length <= MAX_CHAR_SINGLE) {
                        setAnswers({ ...answers, [currentQuestion.id]: e.target.value });
                        setError(null);
                      }
                    }}
                    maxLength={MAX_CHAR_SINGLE}
                    onKeyDown={handleKeyDown}
                    placeholder={currentQuestion.placeholder}
                    className="w-full px-4 py-4 rounded-xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all"
                    autoFocus
                  />
                )}

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-sm mt-2"
                  >
                    {error}
                  </motion.p>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <Button
              onClick={handleBack}
              variant="ghost"
              className="text-gray-400 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            <Button
              onClick={handleNext}
              disabled={isSubmitting}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : isLastQuestion ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Complete
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Summary of Previous Answers */}
        {currentIndex > 0 && (
          <div className="px-8 pb-6">
            <div className="border-t border-gray-800 pt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">YOUR ANSWERS</p>
              <div className="flex flex-wrap gap-2">
                {QUESTIONS.slice(0, currentIndex).map((q) => {
                  const answer = answers[q.id];
                  if (!answer) return null;
                  return (
                    <span
                      key={q.id}
                      className="px-2 py-1 text-xs rounded-lg bg-gray-800 text-gray-400 truncate max-w-[150px]"
                      title={answer}
                    >
                      {answer.slice(0, 20)}{answer.length > 20 ? '...' : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
