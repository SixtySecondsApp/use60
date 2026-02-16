import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video,
  UserCircle,
  Activity,
  LayoutList,
  Mail,
  Phone,
  Linkedin,
  Target,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Clock,
  Play,
  Bot,
  Inbox
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Task } from '@/lib/database/models';

type ContextTab = 'meeting' | 'contact' | 'activity' | 'related';

interface ContextPanelProps {
  task: Task;
}

export function ContextPanel({ task }: ContextPanelProps) {
  const meetingContext = task.metadata?.meeting_context;
  const contactContext = task.metadata?.contact_context;
  const activity = task.metadata?.activity;
  const relatedItems = task.metadata?.related_items;

  const [activeTab, setActiveTab] = useState<ContextTab>(meetingContext ? 'meeting' : 'contact');

  const tabs: { id: ContextTab; label: string; icon: typeof Video; available: boolean }[] = [
    { id: 'meeting', label: 'Meeting', icon: Video, available: !!meetingContext },
    { id: 'contact', label: 'Contact', icon: UserCircle, available: !!contactContext },
    { id: 'activity', label: 'Activity', icon: Activity, available: !!(activity && activity.length > 0) },
    { id: 'related', label: 'Related', icon: LayoutList, available: !!(relatedItems && relatedItems.length > 0) },
  ];

  const availableTabs = tabs.filter(t => t.available);

  // Auto-select first available tab
  useEffect(() => {
    if (!tabs.find(t => t.id === activeTab && t.available)) {
      const first = availableTabs[0];
      if (first) setActiveTab(first.id);
    }
  }, [task.id]);

  if (availableTabs.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="shrink-0 border-l border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80 overflow-hidden flex flex-col"
    >
      {/* Context tabs */}
      <div className="shrink-0 flex items-center gap-0 px-3 border-b border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80">
        {availableTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-2.5 text-[11px] font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300'
            )}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'meeting' && meetingContext && (
            <motion.div key="meeting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-4">
              {/* Recording embed */}
              <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 bg-slate-900 aspect-video flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
                <div className="relative flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm">
                    <Play className="h-5 w-5 text-white ml-0.5" />
                  </div>
                  <span className="text-[11px] text-slate-400">{meetingContext.duration} recording</span>
                </div>
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-white/10">
                    <div className="h-full w-0 rounded-full bg-blue-500" />
                  </div>
                  <span className="text-[10px] text-slate-500">0:00</span>
                </div>
              </div>

              {/* Meeting info */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">{meetingContext.title}</h4>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">
                  {new Date(meetingContext.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {meetingContext.duration}
                </p>
              </div>

              {/* Summary */}
              <div>
                <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">AI Summary</h5>
                <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">{meetingContext.summary}</p>
              </div>

              {/* Highlights */}
              {meetingContext.highlights && (
                <div>
                  <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Key Moments</h5>
                  <div className="space-y-1.5">
                    {meetingContext.highlights.map((h: string, i: number) => (
                      <button key={i} className="w-full flex items-start gap-2 text-left rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors group">
                        <Clock className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                        <span className="text-[11px] text-slate-600 dark:text-gray-400 group-hover:text-slate-800 dark:group-hover:text-gray-300">{h}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Attendees */}
              {meetingContext.attendees && (
                <div>
                  <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Attendees</h5>
                  <div className="space-y-2">
                    {meetingContext.attendees.map((a: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center">
                          <span className="text-[10px] font-semibold text-slate-600 dark:text-gray-300">{a.name[0]}</span>
                        </div>
                        <div>
                          <p className="text-[11px] font-medium text-slate-700 dark:text-gray-300">{a.name}</p>
                          <p className="text-[10px] text-slate-400 dark:text-gray-500">{a.role} · {a.company}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'contact' && contactContext && (
            <motion.div key="contact" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-4">
              {/* Contact card */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">{contactContext.name.split(' ').map((n: string) => n[0]).join('')}</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-200">{contactContext.name}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-gray-400">{contactContext.title}</p>
                  <p className="text-[11px] text-slate-400 dark:text-gray-500">{contactContext.company}</p>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px]">
                  <Mail className="h-3 w-3 text-slate-400" />
                  <span className="text-blue-600 dark:text-blue-400">{contactContext.email}</span>
                </div>
                {contactContext.phone && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <Phone className="h-3 w-3 text-slate-400" />
                    <span className="text-slate-600 dark:text-gray-400">{contactContext.phone}</span>
                  </div>
                )}
                {contactContext.linkedin && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <Linkedin className="h-3 w-3 text-slate-400" />
                    <span className="text-blue-600 dark:text-blue-400">{contactContext.linkedin}</span>
                  </div>
                )}
              </div>

              {/* Relationship score */}
              {contactContext.relationship_score !== undefined && (
                <div>
                  <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-2">Relationship Health</h5>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          contactContext.relationship_score >= 70 ? 'bg-emerald-500' :
                          contactContext.relationship_score >= 40 ? 'bg-amber-500' : 'bg-red-500'
                        )}
                        style={{ width: `${contactContext.relationship_score}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">{contactContext.relationship_score}</span>
                  </div>
                  {contactContext.last_contacted && (
                    <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">
                      Last contacted {contactContext.last_contacted}
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              {contactContext.notes && (
                <div>
                  <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Notes</h5>
                  <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">{contactContext.notes}</p>
                </div>
              )}

              {/* Deal info */}
              {task.metadata?.deal_name && (
                <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">Active Deal</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-gray-400">{task.metadata.deal_name}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {task.metadata.deal_value && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{task.metadata.deal_value}</span>}
                    {task.metadata.deal_stage && <Badge variant="secondary" className="text-[10px]">{task.metadata.deal_stage}</Badge>}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'activity' && activity && (
            <motion.div key="activity" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4">
              <div className="space-y-2">
                {activity.map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="relative flex flex-col items-center">
                      <div className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center',
                        item.actor === 'AI' ? 'bg-violet-100 dark:bg-violet-500/20' : 'bg-blue-100 dark:bg-blue-500/20'
                      )}>
                        {item.actor === 'AI' ? (
                          <Bot className="h-2.5 w-2.5 text-violet-500" />
                        ) : (
                          <UserCircle className="h-2.5 w-2.5 text-blue-500" />
                        )}
                      </div>
                      {i < activity.length - 1 && (
                        <div className="w-px h-4 bg-slate-200 dark:bg-gray-700/50 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <p className="text-[11px] text-slate-600 dark:text-gray-400">{item.action}</p>
                      <span className="text-[10px] text-slate-400 dark:text-gray-500">
                        {new Date(item.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Comments section */}
              {task.metadata?.comments && task.metadata.comments.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-gray-700/50">
                  <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-3">AI Notes</h5>
                  <div className="space-y-3">
                    {task.metadata.comments.map((comment: any) => (
                      <div key={comment.id} className="flex gap-2">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                          comment.isAI ? 'bg-gradient-to-br from-violet-500 to-blue-500' : 'bg-slate-200 dark:bg-gray-700'
                        )}>
                          {comment.isAI ? <Bot className="h-3 w-3 text-white" /> : <span className="text-[10px] font-semibold text-slate-600">{comment.author[0]}</span>}
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-600 dark:text-gray-400 leading-relaxed">{comment.content}</p>
                          <span className="text-[10px] text-slate-400 dark:text-gray-500">
                            {new Date(comment.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'related' && relatedItems && (
            <motion.div key="related" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-2">
              {relatedItems.map((item: any, i: number) => (
                <button key={i} className="w-full flex items-center gap-3 rounded-lg border border-slate-200 dark:border-gray-700/50 p-3 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors text-left">
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center',
                    item.type === 'deal' ? 'bg-emerald-50 dark:bg-emerald-500/10' :
                    item.type === 'meeting' ? 'bg-indigo-50 dark:bg-indigo-500/10' :
                    'bg-blue-50 dark:bg-blue-500/10'
                  )}>
                    {item.type === 'deal' ? <Target className="h-3.5 w-3.5 text-emerald-500" /> :
                     item.type === 'meeting' ? <CalendarClock className="h-3.5 w-3.5 text-indigo-500" /> :
                     <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-gray-300 truncate">{item.title}</p>
                    <p className="text-[10px] text-slate-400 dark:text-gray-500">{item.status}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-300 dark:text-gray-600" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
