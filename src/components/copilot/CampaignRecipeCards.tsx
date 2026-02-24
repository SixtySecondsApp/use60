import React from 'react';
import { Target, RefreshCcw, Megaphone, CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CampaignRecipeCardsProps {
  onSelectRecipe: (prompt: string) => void;
}

const recipes = [
  {
    id: 'cold-outreach',
    icon: Target,
    title: 'Cold Outreach',
    desc: 'Find prospects, enrich, and send a 3-step email sequence',
    iconColor: 'text-emerald-400',
    prompt: 'Start a campaign to find and reach out to prospects',
  },
  {
    id: 're-engage',
    icon: RefreshCcw,
    title: 'Re-engage Leads',
    desc: 'Pull cold leads from CRM and send a re-engagement sequence',
    iconColor: 'text-blue-400',
    prompt: 'Start a campaign to re-engage cold leads from our CRM',
  },
  {
    id: 'content-promotion',
    icon: Megaphone,
    title: 'Content Promotion',
    desc: 'Promote a blog post, webinar, or offer to targeted prospects',
    iconColor: 'text-violet-400',
    prompt: 'Start a campaign to promote our latest content to prospects',
  },
  {
    id: 'event-follow-up',
    icon: CalendarCheck,
    title: 'Event Follow-Up',
    desc: 'Follow up with event attendees with a personalized sequence',
    iconColor: 'text-pink-400',
    prompt: 'Start a campaign to follow up with event attendees',
  },
];

export const CampaignRecipeCards: React.FC<CampaignRecipeCardsProps> = ({ onSelectRecipe }) => {
  return (
    <div className="w-full max-w-2xl">
      <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase mb-4 tracking-wider">
        Campaign Recipes
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {recipes.map((recipe) => (
          <button
            key={recipe.id}
            onClick={() => onSelectRecipe(recipe.prompt)}
            className={cn(
              'group relative p-5 rounded-2xl text-left transition-all',
              'bg-white dark:bg-white/[0.03] backdrop-blur-xl',
              'border border-gray-200 dark:border-white/10',
              'hover:bg-gray-50 dark:hover:bg-white/[0.06]',
              'hover:border-gray-300 dark:hover:border-white/20',
              'hover:scale-[1.02] hover:shadow-xl dark:hover:shadow-emerald-500/10',
              'focus:outline-none focus:ring-2 focus:ring-emerald-500'
            )}
          >
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center mb-3',
                'bg-white/5 dark:bg-white/[0.08] backdrop-blur-xl',
                'border border-gray-200/50 dark:border-white/10',
                'group-hover:scale-110 transition-all'
              )}
            >
              <recipe.icon className={cn('w-5 h-5', recipe.iconColor)} />
            </div>
            <p className="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
              {recipe.title}
            </p>
            <p className="text-sm text-gray-500 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-400 transition-colors">
              {recipe.desc}
            </p>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default CampaignRecipeCards;
