import {
  LayoutDashboard,
  Users,
  Send,
  BarChart3,
  TrendingUp,
  Eye,
  Crosshair,
  Calendar,
  Network,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinkedInTab =
  | 'overview'
  | 'leads'
  | 'campaigns'
  | 'analytics'
  | 'revenue'
  | 'ad_library'
  | 'audiences'
  | 'events'
  | 'network';

interface LinkedInHubTabsProps {
  activeTab: LinkedInTab;
  onChange: (tab: LinkedInTab) => void;
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const tabs: Array<{
  id: LinkedInTab;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}> = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'leads', label: 'Leads', icon: <Users className="w-4 h-4" /> },
  { id: 'campaigns', label: 'Campaigns', icon: <Send className="w-4 h-4" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'revenue', label: 'Revenue', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'ad_library', label: 'Ad Library', icon: <Eye className="w-4 h-4" /> },
  { id: 'audiences', label: 'Audiences', icon: <Crosshair className="w-4 h-4" /> },
  { id: 'events', label: 'Events', icon: <Calendar className="w-4 h-4" /> },
  { id: 'network', label: 'Network', icon: <Network className="w-4 h-4" /> },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkedInHubTabs({ activeTab, onChange }: LinkedInHubTabsProps) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-zinc-800/60 border border-zinc-700/50 w-fit overflow-x-auto">
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
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-blue-500/30 text-blue-300'
                    : 'bg-zinc-600 text-zinc-400'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
