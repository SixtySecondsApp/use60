/**
 * EnrichmentResultStep
 *
 * Displays the discovered company information from AI enrichment.
 * Shows company name, industry, products, and competitors.
 * User then proceeds to verify/amend the AI-generated skills in the tabbed config step.
 */

import { motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import { useOnboardingV2Store } from '@/lib/stores/onboardingV2Store';

export function EnrichmentResultStep() {
  const { enrichment, setStep } = useOnboardingV2Store();

  const handleContinue = () => {
    // Go to skills_config where user can verify/amend AI-generated skill data
    setStep('skills_config');
  };

  if (!enrichment) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-2xl mx-auto px-4"
    >
      <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 overflow-hidden">
        {/* Header */}
        <div className="bg-violet-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">
                We found {enrichment.company_name || 'your company'}
              </h2>
              <p className="text-violet-100 text-sm">Here's what we learned</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="space-y-3">
              {enrichment.company_name && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide mb-0.5 text-gray-500">
                    Company
                  </p>
                  <p className="font-medium text-white">{enrichment.company_name}</p>
                </div>
              )}
              {enrichment.industry && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide mb-0.5 text-gray-500">
                    Industry
                  </p>
                  <p className="font-medium text-sm text-white">{enrichment.industry}</p>
                </div>
              )}
              {enrichment.company_size && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide mb-0.5 text-gray-500">
                    Company Size
                  </p>
                  <p className="font-medium text-sm text-white">{enrichment.company_size}</p>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {enrichment.products && enrichment.products.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide mb-0.5 text-gray-500">
                    Products
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {enrichment.products.map((product, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs rounded-md bg-violet-900/50 text-violet-300"
                      >
                        {typeof product === 'string' ? product : product.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {enrichment.competitors && enrichment.competitors.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide mb-0.5 text-gray-500">
                    Competitors
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {enrichment.competitors.map((comp, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs rounded-md bg-gray-800 text-gray-300"
                      >
                        {typeof comp === 'string' ? comp : comp.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {enrichment.target_market && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide mb-0.5 text-gray-500">
                    Target Market
                  </p>
                  <p className="font-medium text-sm text-white">{enrichment.target_market}</p>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleContinue}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 group"
          >
            Review AI Suggestions
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Start Over Link */}
          <div className="mt-4 pt-4 border-t border-gray-800/50 text-center">
            <button
              onClick={() => useOnboardingV2Store.getState().reset()}
              className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
