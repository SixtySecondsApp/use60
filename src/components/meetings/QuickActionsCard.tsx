import { motion } from 'framer-motion';
import { Mail, Phone, Share2, Zap } from 'lucide-react';
import { useQuickActionPriority, type QuickActionId } from '@/lib/hooks/useQuickActionPriority';
import { cn } from '@/lib/utils';

interface Meeting {
  id: string;
  meeting_type?: string | null;
  sentiment_score?: number | null;
  source_type?: string | null;
  voice_recording_id?: string | null;
}

interface QuickActionsCardProps {
  meeting: Meeting;
  onEmailClick: () => void;
  onBookCallClick: () => void;
  onShareClick: () => void;
  className?: string;
}

const actionConfig: Record<QuickActionId, {
  icon: typeof Mail;
  label: string;
  color: 'blue' | 'violet' | 'emerald';
}> = {
  follow_up_email: { icon: Mail, label: 'Send Follow-up', color: 'blue' },
  book_call: { icon: Phone, label: 'Book Next Call', color: 'violet' },
  share_recording: { icon: Share2, label: 'Share Meeting', color: 'emerald' },
};

const colorStyles = {
  blue: {
    button: 'bg-blue-50 dark:bg-blue-400/5 border-blue-200 dark:border-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20',
    iconBg: 'bg-blue-100 dark:bg-blue-400/5 ring-1 ring-blue-300 dark:ring-blue-500/50',
    icon: 'text-blue-600 dark:text-blue-500',
    badge: 'bg-blue-500',
  },
  violet: {
    button: 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20 hover:bg-violet-100 dark:hover:bg-violet-500/20',
    iconBg: 'bg-violet-100 dark:bg-violet-500/10 ring-1 ring-violet-300 dark:ring-violet-500/30',
    icon: 'text-violet-600 dark:text-violet-500',
    badge: 'bg-violet-500',
  },
  emerald: {
    button: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20',
    iconBg: 'bg-emerald-100 dark:bg-emerald-500/10 ring-1 ring-emerald-300 dark:ring-emerald-500/30',
    icon: 'text-emerald-600 dark:text-emerald-500',
    badge: 'bg-emerald-500',
  },
};

export function QuickActionsCard({
  meeting,
  onEmailClick,
  onBookCallClick,
  onShareClick,
  className,
}: QuickActionsCardProps) {
  const { orderedActions, urgentAction, urgencyReason } = useQuickActionPriority(meeting);

  const actionHandlers: Record<QuickActionId, () => void> = {
    follow_up_email: onEmailClick,
    book_call: onBookCallClick,
    share_recording: onShareClick,
  };

  const handleActionClick = (actionId: QuickActionId, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    actionHandlers[actionId]();
  };

  return (
    <div className={cn('section-card min-w-0', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-amber-500" />
        <h3 className="font-semibold text-base sm:text-lg">Quick Actions</h3>
      </div>

      <motion.div
        className="grid grid-cols-3 gap-2"
        variants={{
          show: {
            transition: {
              staggerChildren: 0.08,
            },
          },
        }}
        initial="hidden"
        animate="show"
      >
        {orderedActions.map((actionId) => {
          const config = actionConfig[actionId];
          const styles = colorStyles[config.color];
          const Icon = config.icon;
          const isUrgent = actionId === urgentAction;

          return (
            <motion.button
              key={actionId}
              type="button"
              variants={{
                hidden: { y: 20, opacity: 0 },
                show: { y: 0, opacity: 1 },
              }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 30,
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={(e) => handleActionClick(actionId, e)}
              className={cn(
                'relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-300 group backdrop-blur-sm',
                styles.button
              )}
            >
              {/* Urgency badge */}
              {isUrgent && urgencyReason && (
                <div className="absolute -top-1.5 -right-1.5 z-10">
                  <span className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white shadow-sm',
                    styles.badge
                  )}>
                    {urgencyReason}
                  </span>
                </div>
              )}

              <div
                className={cn(
                  'p-2 rounded-lg transition-all duration-300 group-hover:scale-110 backdrop-blur-sm mb-1.5',
                  styles.iconBg
                )}
              >
                <Icon className={cn('w-4 h-4', styles.icon)} />
              </div>
              <span className="text-xs font-medium text-gray-900 dark:text-white text-center">
                {config.label}
              </span>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}

export default QuickActionsCard;
