/**
 * OnboardingSimulator Page
 * Platform admin tool to simulate and preview the onboarding experience
 */

import React from 'react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { OnboardingSimulatorWrapper } from '@/components/platform/simulator/OnboardingSimulatorWrapper';
import { OnboardingVersionControl } from '@/components/platform/simulator/OnboardingVersionControl';

export default function OnboardingSimulator() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Wrapper with max-width to prevent layout shift */}
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <BackToPlatform />
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Onboarding Simulator
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Preview and test the onboarding experience for new users
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Walkthrough */}
        <div className="space-y-6">
          <OnboardingSimulatorWrapper />

          {/* Admin Version Control */}
          <OnboardingVersionControl />
        </div>
      </div>
    </div>
  );
}
