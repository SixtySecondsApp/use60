import React from 'react';
import { Building2, Users, Layers, Shuffle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProspectingTab = 'ai_ark' | 'apollo' | 'similar' | 'combined';

interface ProspectingTabsProps {
  activeTab: ProspectingTab;
  onChange: (tab: ProspectingTab) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProspectingTabs({ activeTab, onChange }: ProspectingTabsProps) {
  const tabs: Array<{
    id: ProspectingTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }> = [
    {
      id: 'ai_ark',
      label: 'AI Ark',
      icon: <Building2 className="w-4 h-4" />,
      badge: 'Premium',
    },
    {
      id: 'apollo',
      label: 'Apollo',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'similar',
      label: 'Similar Companies',
      icon: <Shuffle className="w-4 h-4" />,
      badge: 'New',
    },
    {
      id: 'combined',
      label: 'Combined',
      icon: <Layers className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex gap-1 p-1 rounded-xl bg-zinc-800/60 border border-zinc-700/50 w-fit">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                isActive
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'bg-zinc-600 text-zinc-400'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
