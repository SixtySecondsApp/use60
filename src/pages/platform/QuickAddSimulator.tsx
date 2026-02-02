/**
 * QuickAddSimulator Page
 * Platform admin tool to preview and control the Quick Add experience.
 */
import React from 'react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { QuickAddSimulatorWrapper } from '@/components/platform/simulator/QuickAddSimulatorWrapper';
import { QuickAddVersionControl } from '@/components/platform/simulator/QuickAddVersionControl';

export default function QuickAddSimulator() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <BackToPlatform />
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Quick Add Simulator</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Preview Quick Add versions and control which experience is live for internal vs external users
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <QuickAddSimulatorWrapper />
          <QuickAddVersionControl />
        </div>
      </div>
    </div>
  );
}

