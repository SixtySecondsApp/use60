import { Lightbulb, AlertTriangle, Info, StickyNote } from 'lucide-react';

type CalloutType = 'tip' | 'warning' | 'info' | 'note';

interface CalloutBlockProps {
  type: CalloutType;
  children: React.ReactNode;
}

const config: Record<CalloutType, {
  label: string;
  icon: typeof Info;
  border: string;
  bg: string;
  iconColor: string;
  titleColor: string;
}> = {
  tip: {
    label: 'Tip',
    icon: Lightbulb,
    border: 'border-l-emerald-500 dark:border-l-emerald-400',
    bg: 'bg-emerald-50/50 dark:bg-emerald-500/5',
    iconColor: 'text-emerald-500 dark:text-emerald-400',
    titleColor: 'text-emerald-700 dark:text-emerald-400',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    border: 'border-l-amber-500 dark:border-l-amber-400',
    bg: 'bg-amber-50/50 dark:bg-amber-500/5',
    iconColor: 'text-amber-500 dark:text-amber-400',
    titleColor: 'text-amber-700 dark:text-amber-400',
  },
  info: {
    label: 'Info',
    icon: Info,
    border: 'border-l-blue-500 dark:border-l-blue-400',
    bg: 'bg-blue-50/50 dark:bg-blue-500/5',
    iconColor: 'text-blue-500 dark:text-blue-400',
    titleColor: 'text-blue-700 dark:text-blue-400',
  },
  note: {
    label: 'Note',
    icon: StickyNote,
    border: 'border-l-gray-400 dark:border-l-gray-500',
    bg: 'bg-gray-50/50 dark:bg-gray-500/5',
    iconColor: 'text-gray-500 dark:text-gray-400',
    titleColor: 'text-gray-700 dark:text-gray-400',
  },
};

export function CalloutBlock({ type, children }: CalloutBlockProps) {
  const c = config[type];
  const Icon = c.icon;

  return (
    <div className={`my-4 rounded-r-xl border border-l-4 ${c.border} border-gray-200 dark:border-gray-700/50 ${c.bg} px-4 py-3`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-4 h-4 ${c.iconColor}`} />
        <span className={`text-sm font-semibold ${c.titleColor}`}>{c.label}</span>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none
        prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:my-1 prose-p:leading-relaxed
        prose-li:text-gray-700 dark:prose-li:text-gray-300
        prose-code:text-gray-800 dark:prose-code:text-gray-200
        prose-code:bg-gray-100 dark:prose-code:bg-gray-800/50
        prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs
        prose-code:before:content-none prose-code:after:content-none">
        {children}
      </div>
    </div>
  );
}
