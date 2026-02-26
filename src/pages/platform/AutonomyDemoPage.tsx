/**
 * AutonomyDemoPage (AP-030)
 *
 * Demo/marketing page for the Autopilot Engine autonomy progression feature.
 * Shows prospects an animated 90-day autonomy progression via AutonomySimulator.
 *
 * Route: /platform/demo/autonomy
 */

import { ChevronRight, TrendingUp, Zap } from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import AutonomySimulator from '@/components/platform/autopilot/AutonomySimulator';

// ============================================================================
// Component
// ============================================================================

export default function AutonomyDemoPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <BackToPlatform />

        {/* Page heading */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-3">
            <Zap className="h-3.5 w-3.5" />
            Autopilot Engine
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            From assistant to autonomous teammate
          </h1>
          <p className="text-base text-gray-400 max-w-lg mx-auto">
            Watch how use60 learns from every approval — progressively earning the right to
            act on your behalf, action by action, until it's handling the routine so you can
            focus on the deals that matter.
          </p>
        </div>

        {/* Simulator */}
        <AutonomySimulator showRealDataButton={true} className="mb-8" />

        {/* Feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <TrendingUp className="h-5 w-5 text-indigo-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-white mb-1">Earns trust gradually</p>
            <p className="text-xs text-gray-400">
              Starts in approve mode. Each repeated approval builds confidence before auto-upgrading.
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <Zap className="h-5 w-5 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-white mb-1">Action-level granularity</p>
            <p className="text-xs text-gray-400">
              Each action type has its own tier — meeting notes auto while deal amounts still need you.
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <ChevronRight className="h-5 w-5 text-amber-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-white mb-1">Always reversible</p>
            <p className="text-xs text-gray-400">
              Demote any action back to approve mode instantly. You stay in control at all times.
            </p>
          </div>
        </div>

        {/* CTA section */}
        <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/20 border border-indigo-500/20 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Ready to put it to work?</h2>
          <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
            Connect your calendar and CRM — use60 will start learning your patterns from your very first meeting.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/signup"
              className="inline-flex items-center justify-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Start free trial
              <ChevronRight className="h-4 w-4" />
            </a>
            <a
              href="/pipeline"
              className="inline-flex items-center justify-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors border border-gray-700"
            >
              See live dashboard
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
