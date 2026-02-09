import { useState } from 'react';
import { GraduationCap, Zap, Flame, ChevronDown } from 'lucide-react';

type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

interface SkillLevelBlockProps {
  level: SkillLevel;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const config: Record<SkillLevel, {
  label: string;
  icon: typeof GraduationCap;
  border: string;
  bg: string;
  badge: string;
  text: string;
}> = {
  beginner: {
    label: 'Beginner',
    icon: GraduationCap,
    border: 'border-emerald-300 dark:border-emerald-500/30',
    bg: 'bg-emerald-50/50 dark:bg-emerald-500/5',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  intermediate: {
    label: 'Intermediate',
    icon: Zap,
    border: 'border-blue-300 dark:border-blue-500/30',
    bg: 'bg-blue-50/50 dark:bg-blue-500/5',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    text: 'text-blue-600 dark:text-blue-400',
  },
  advanced: {
    label: 'Advanced',
    icon: Flame,
    border: 'border-violet-300 dark:border-violet-500/30',
    bg: 'bg-violet-50/50 dark:bg-violet-500/5',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
    text: 'text-violet-600 dark:text-violet-400',
  },
};

export function SkillLevelBlock({ level, children, defaultOpen }: SkillLevelBlockProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? level === 'beginner');
  const c = config[level];
  const Icon = c.icon;

  return (
    <div className={`my-4 rounded-xl border ${c.border} ${c.bg} overflow-hidden transition-all`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Icon className={`w-4 h-4 ${c.text}`} />
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${c.badge}`}>
            {c.label}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 prose prose-sm dark:prose-invert max-w-none
          prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-relaxed prose-p:my-2
          prose-li:text-gray-700 dark:prose-li:text-gray-300
          prose-code:text-gray-800 dark:prose-code:text-gray-200
          prose-code:bg-gray-100 dark:prose-code:bg-gray-800/50
          prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs
          prose-code:before:content-none prose-code:after:content-none">
          {children}
        </div>
      )}
    </div>
  );
}
