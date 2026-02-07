import React from 'react';
import {
  Search,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Target,
  Users,
  Briefcase,
  Building2,
  TrendingUp,
  Rocket,
  Crown,
  Layers,
  type LucideIcon,
} from 'lucide-react';
import type { ICPProfile } from '@/lib/hooks/useICPProfiles';

// Map ICP profile characteristics to Lucide icons instead of emoji
const PROFILE_ICONS: LucideIcon[] = [Target, Briefcase, Building2, TrendingUp, Rocket, Crown, Layers, Users];

function getProfileIcon(index: number): LucideIcon {
  return PROFILE_ICONS[index % PROFILE_ICONS.length];
}

interface ICPProfileSelectorProps {
  profiles: ICPProfile[];
  isLoading: boolean;
  onSelectProfile: (profile: ICPProfile) => void;
  onSelectCustom: () => void;
  onRegenerate?: () => void;
}

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4 animate-pulse">
      <div className="mb-3 h-10 w-10 rounded-lg bg-zinc-700/50" />
      <div className="mb-2 h-4 w-3/4 rounded bg-zinc-700/50" />
      <div className="mb-1 h-3 w-full rounded bg-zinc-700/30" />
      <div className="h-3 w-2/3 rounded bg-zinc-700/30" />
    </div>
  );
}

export function ICPProfileSelector({
  profiles,
  isLoading,
  onSelectProfile,
  onSelectCustom,
  onRegenerate,
}: ICPProfileSelectorProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
          Analyzing your company context to suggest target profiles...
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          {/* Custom Search card always visible */}
          <button
            onClick={onSelectCustom}
            className="flex flex-col items-start rounded-xl border border-zinc-700/50 p-4 text-left transition-all hover:border-zinc-600 hover:bg-zinc-800/50"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-700/30 text-zinc-400">
              <Search className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-zinc-300">Custom Search</h3>
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
              Start with blank filters
            </p>
          </button>
        </div>
      </div>
    );
  }

  const hasProfiles = profiles.length > 0;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Sparkles className="w-4 h-4 text-blue-400" />
          {hasProfiles
            ? 'Suggested target profiles based on your company context'
            : 'No company context available yet — start with a custom search'}
        </div>
        {hasProfiles && onRegenerate && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {profiles.map((profile, idx) => {
          const Icon = getProfileIcon(idx);
          return (
          <button
            key={profile.id}
            onClick={() => onSelectProfile(profile)}
            className="group flex flex-col items-start rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-left transition-all hover:border-blue-500/50 hover:bg-blue-500/10"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Icon className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-sm font-medium text-white group-hover:text-blue-200 transition-colors">
              {profile.name}
            </h3>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed line-clamp-2">
              {profile.description}
            </p>
            <div className="mt-3 flex items-center gap-2 w-full">
              <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300 border border-blue-500/20">
                {profile.filter_count} filters
              </span>
              <ArrowRight className="w-3 h-3 text-zinc-600 group-hover:text-blue-400 ml-auto transition-colors" />
            </div>
          </button>
          );
        })}

        {/* Custom Search card */}
        <button
          onClick={onSelectCustom}
          className="flex flex-col items-start rounded-xl border border-zinc-700/50 p-4 text-left transition-all hover:border-zinc-600 hover:bg-zinc-800/50"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-700/30 text-zinc-400">
            <Search className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-medium text-zinc-300">Custom Search</h3>
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
            Start with blank filters and build your own search
          </p>
        </button>
      </div>
    </div>
  );
}
