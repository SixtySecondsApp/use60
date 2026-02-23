import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsPageWrapperProps {
  title: string;
  description: string;
  children: React.ReactNode;
  /** When provided, renders an icon-style header (like MeetingAnalyticsPage) */
  icon?: React.ElementType;
  /** Tailwind classes for the icon itself, e.g. "h-7 w-7 text-blue-500" */
  iconClassName?: string;
  /** Tailwind classes for the icon container box, e.g. "bg-blue-500/10 border-blue-500/20" */
  iconContainerClassName?: string;
  /** First word of the title rendered in gray gradient (defaults to first word of title) */
  titleFirst?: string;
  /** Second part rendered in accent gradient (defaults to remainder of title) */
  titleAccent?: string;
  /** Color of the pulsing dot, e.g. "bg-blue-500" */
  dotClassName?: string;
  /** Gradient for the accent word, e.g. "from-blue-600 via-violet-500 to-indigo-500" */
  accentGradient?: string;
}

export default function SettingsPageWrapper({
  title,
  description,
  children,
  icon: Icon,
  iconClassName = 'h-7 w-7 text-blue-500 dark:text-blue-400',
  iconContainerClassName = 'bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/20 dark:border-blue-500/30',
  titleFirst,
  titleAccent,
  dotClassName = 'bg-blue-500',
  accentGradient = 'from-blue-600 via-violet-500 to-indigo-500',
}: SettingsPageWrapperProps) {
  const navigate = useNavigate();

  // Auto-split title into first word + rest when not explicitly provided
  const words = title.trim().split(' ');
  const resolvedFirst = titleFirst ?? (words.length > 1 ? words[0] : '');
  const resolvedAccent = titleAccent ?? (words.length > 1 ? words.slice(1).join(' ') : title);

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Back Button */}
          <Button
            variant="ghost"
            onClick={() => navigate('/settings')}
            className="group -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Settings
          </Button>

          {/* Page Header */}
          {Icon ? (
            <div className="flex items-center gap-4">
              <div className={cn(
                'w-14 h-14 rounded-2xl border flex items-center justify-center shrink-0',
                iconContainerClassName
              )}>
                <Icon className={iconClassName} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">
                  {resolvedFirst && (
                    <>
                      <span className="bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent">
                        {resolvedFirst}
                      </span>
                      {' '}
                    </>
                  )}
                  <span className={cn('bg-gradient-to-r bg-clip-text text-transparent', accentGradient)}>
                    {resolvedAccent}
                  </span>
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse', dotClassName)} />
                  <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
                {title}
              </h1>
              <p className="text-[#64748B] dark:text-gray-400 mt-2">
                {description}
              </p>
            </div>
          )}

          {/* Content */}
          <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800/50 rounded-xl p-6 sm:p-8 backdrop-blur-xl">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
