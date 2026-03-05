import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, CheckCircle2, ArrowRight, Tag, Mail, Loader2, AlertCircle, Inbox } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGmailEmails, useGmailLabels } from '@/lib/hooks/useGoogleIntegration';
import { emails as mockEmails } from './mockData';
import type { ShotComponentProps } from './types';

// 60 category config — used for mapping label names to visual styles
const categoryConfig: Record<string, { label: string; color: string; bg: string; dotColor: string }> = {
  INBOX: { label: 'Inbox', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30', dotColor: 'bg-blue-400' },
  UNREAD: { label: 'Unread', color: 'text-green-400', bg: 'bg-green-500/20 border-green-500/30', dotColor: 'bg-green-400' },
  IMPORTANT: { label: 'Important', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30', dotColor: 'bg-amber-400' },
  SENT: { label: 'Sent', color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/30', dotColor: 'bg-purple-400' },
  STARRED: { label: 'Starred', color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-500/30', dotColor: 'bg-yellow-400' },
  CATEGORY_PROMOTIONS: { label: 'Promotions', color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/30', dotColor: 'bg-orange-400' },
  CATEGORY_UPDATES: { label: 'Updates', color: 'text-teal-400', bg: 'bg-teal-500/20 border-teal-500/30', dotColor: 'bg-teal-400' },
  CATEGORY_SOCIAL: { label: 'Social', color: 'text-pink-400', bg: 'bg-pink-500/20 border-pink-500/30', dotColor: 'bg-pink-400' },
  CATEGORY_FORUMS: { label: 'Forums', color: 'text-indigo-400', bg: 'bg-indigo-500/20 border-indigo-500/30', dotColor: 'bg-indigo-400' },
  DRAFT: { label: 'Draft', color: 'text-gray-400', bg: 'bg-gray-500/20 border-gray-500/30', dotColor: 'bg-gray-400' },
  SPAM: { label: 'Spam', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30', dotColor: 'bg-red-400' },
  TRASH: { label: 'Trash', color: 'text-gray-500', bg: 'bg-gray-600/20 border-gray-600/30', dotColor: 'bg-gray-500' },
};

// Fallback style for unknown labels
const defaultCategory = { label: '', color: 'text-gray-400', bg: 'bg-gray-500/20 border-gray-500/30', dotColor: 'bg-gray-400' };

// Labels we show as primary category badge (first match wins)
const PRIMARY_LABEL_PRIORITY = ['UNREAD', 'IMPORTANT', 'STARRED', 'SENT', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_SOCIAL', 'DRAFT'];

// Labels to hide from badge display (too common / not useful)
const HIDDEN_LABELS = new Set(['INBOX', 'CATEGORY_PERSONAL', 'UNREAD']);

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  labelIds: string[];
  isUnread: boolean;
}

interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

function LoadingSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-700/30 last:border-0">
          <div className="w-4 h-4 rounded bg-gray-700/50 animate-pulse" />
          <div className="w-7 h-7 rounded-full bg-gray-700/50 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-28 bg-gray-700/50 rounded animate-pulse" />
              <div className="h-4 w-16 bg-gray-700/50 rounded animate-pulse" />
            </div>
            <div className="h-3 w-48 bg-gray-700/50 rounded animate-pulse" />
          </div>
          <div className="h-3 w-12 bg-gray-700/50 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function parseFromField(from: string): { name: string; avatar: string } {
  // "John Smith <john@example.com>" => { name: "John Smith", avatar: "JS" }
  const match = from.match(/^(.+?)\s*<.+>$/);
  const name = match ? match[1].replace(/"/g, '').trim() : from.split('@')[0];
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return { name, avatar: initials || '?' };
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getPrimaryBadge(labelIds: string[], labelMap: Map<string, GmailLabel>): { label: string; color: string; bg: string } | null {
  for (const priority of PRIMARY_LABEL_PRIORITY) {
    if (labelIds.includes(priority)) {
      return categoryConfig[priority] ?? null;
    }
  }
  // Check user labels
  for (const id of labelIds) {
    if (!HIDDEN_LABELS.has(id) && !categoryConfig[id]) {
      const lbl = labelMap.get(id);
      if (lbl && lbl.type === 'user') {
        return { label: lbl.name, ...defaultCategory };
      }
    }
  }
  return null;
}

export default function ShotEmailTriage({ activeStep }: ShotComponentProps) {
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());

  // Fetch real Gmail data
  const { data: emailData, isLoading: emailsLoading, error: emailsError } = useGmailEmails();
  const { data: labelData, isLoading: labelsLoading, error: labelsError } = useGmailLabels();

  const messages: GmailMessage[] = emailData?.messages ?? [];
  const labels: GmailLabel[] = labelData?.labels ?? [];

  // Build label lookup map
  const labelMap = useMemo(() => {
    const map = new Map<string, GmailLabel>();
    labels.forEach((l) => map.set(l.id, l));
    return map;
  }, [labels]);

  // Resolve label IDs to display names
  const resolveLabelNames = (labelIds: string[]): string[] => {
    return labelIds
      .filter((id) => !HIDDEN_LABELS.has(id))
      .map((id) => {
        const cfg = categoryConfig[id];
        if (cfg) return cfg.label;
        const lbl = labelMap.get(id);
        return lbl?.name ?? id;
      })
      .slice(0, 3); // max 3 badges
  };

  // Group messages by primary label for the inbox view
  const groupedMessages = useMemo(() => {
    const groups: Record<string, GmailMessage[]> = {};
    messages.forEach((msg) => {
      // Determine primary group
      let group = 'OTHER';
      if (msg.labelIds.includes('IMPORTANT')) group = 'IMPORTANT';
      else if (msg.isUnread) group = 'UNREAD';
      else if (msg.labelIds.includes('SENT')) group = 'SENT';
      else if (msg.labelIds.includes('CATEGORY_PROMOTIONS')) group = 'PROMOTIONS';
      else if (msg.labelIds.includes('INBOX')) group = 'INBOX';

      if (!groups[group]) groups[group] = [];
      groups[group].push(msg);
    });
    return groups;
  }, [messages]);

  // Initialize starred IDs from real data
  useMemo(() => {
    const starred = messages.filter((m) => m.labelIds.includes('STARRED')).map((m) => m.id);
    if (starred.length > 0 && starredIds.size === 0) {
      setStarredIds(new Set(starred));
    }
  }, [messages]);

  const toggleStar = (id: string) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isLoading = emailsLoading || labelsLoading;
  const hasError = emailsError || labelsError;

  // Build 60-category list from real labels for step 2
  const sixtyCategories = useMemo(() => {
    const cats = [
      { key: 'to_respond', label: 'To Respond', color: 'text-green-400', dotColor: 'bg-green-400', count: messages.filter((m) => m.isUnread && m.labelIds.includes('IMPORTANT')).length },
      { key: 'fyi', label: 'FYI', color: 'text-blue-400', dotColor: 'bg-blue-400', count: messages.filter((m) => !m.isUnread && m.labelIds.includes('INBOX')).length },
      { key: 'marketing', label: 'Marketing', color: 'text-orange-400', dotColor: 'bg-orange-400', count: messages.filter((m) => m.labelIds.includes('CATEGORY_PROMOTIONS')).length },
      { key: 'automated', label: 'Automated', color: 'text-gray-400', dotColor: 'bg-gray-400', count: messages.filter((m) => m.labelIds.includes('CATEGORY_UPDATES')).length },
    ];
    return cats;
  }, [messages]);

  // Real Gmail labels for step 2
  const gmailLabelDisplay = useMemo(() => {
    // Prioritize system labels that are meaningful, then user labels
    const systemPriority = ['INBOX', 'IMPORTANT', 'SENT', 'STARRED', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_SOCIAL'];
    const shown: { name: string; color: string }[] = [];

    for (const id of systemPriority) {
      const lbl = labelMap.get(id);
      if (lbl) {
        const cfg = categoryConfig[id];
        shown.push({ name: cfg?.label ?? lbl.name, color: cfg?.bg ?? defaultCategory.bg });
      }
    }

    // Add user labels
    labels
      .filter((l) => l.type === 'user')
      .slice(0, 4)
      .forEach((l) => {
        shown.push({ name: l.name, color: defaultCategory.bg });
      });

    return shown.slice(0, 6);
  }, [labels, labelMap]);

  return (
    <AnimatePresence mode="wait">
      {activeStep === 0 && (
        <motion.div key="inbox" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Inbox className="w-5 h-5 text-blue-400" />
              Smart Inbox
              {!isLoading && messages.length > 0 && (
                <span className="text-xs text-gray-500 font-normal">({messages.length} emails)</span>
              )}
            </h3>
            <div className="flex gap-2 flex-wrap justify-end">
              {Object.entries(groupedMessages).slice(0, 4).map(([group, msgs]) => {
                const cfg = categoryConfig[group] ?? defaultCategory;
                return (
                  <Badge key={group} className={cn('text-xs border', cfg.bg, cfg.color)}>
                    {cfg.label || group} ({msgs.length})
                  </Badge>
                );
              })}
            </div>
          </div>

          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardContent className="p-0">
              {isLoading && <LoadingSkeleton />}

              {hasError && !isLoading && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <p className="text-sm text-red-300">Failed to load Gmail</p>
                  <p className="text-xs text-gray-500 max-w-xs">
                    {(emailsError as Error)?.message || 'Could not connect to Gmail. Make sure Google is connected.'}
                  </p>
                </div>
              )}

              {!isLoading && !hasError && messages.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Mail className="w-8 h-8 text-gray-600" />
                  <p className="text-sm text-gray-400">No emails found</p>
                </div>
              )}

              {!isLoading && !hasError && messages.slice(0, 10).map((msg, i) => {
                const { name, avatar } = parseFromField(msg.from);
                const badge = getPrimaryBadge(msg.labelIds, labelMap);
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * i }}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 border-b border-gray-700/30 last:border-0 cursor-pointer',
                      'hover:bg-gray-700/20 transition-colors',
                      msg.isUnread && 'bg-gray-800/80'
                    )}
                  >
                    <button onClick={() => toggleStar(msg.id)} className="flex-shrink-0">
                      <Star className={cn('w-4 h-4', starredIds.has(msg.id) ? 'text-amber-400 fill-amber-400' : 'text-gray-600')} />
                    </button>
                    <div className="w-7 h-7 rounded-full bg-gray-700/50 flex items-center justify-center text-xs text-gray-300 flex-shrink-0">
                      {avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm truncate', msg.isUnread ? 'font-semibold text-white' : 'text-gray-300')}>{name}</span>
                        {badge && (
                          <Badge className={cn('text-xs border flex-shrink-0', badge.bg, badge.color)}>{badge.label}</Badge>
                        )}
                        {msg.labelIds.filter((id) => !HIDDEN_LABELS.has(id) && id !== (badge ? PRIMARY_LABEL_PRIORITY.find((p) => msg.labelIds.includes(p)) : null)).slice(0, 1).map((id) => {
                          const cfg = categoryConfig[id];
                          const lbl = labelMap.get(id);
                          if (!cfg && !lbl) return null;
                          return (
                            <Badge key={id} className={cn('text-xs border flex-shrink-0', (cfg ?? defaultCategory).bg, (cfg ?? defaultCategory).color)}>
                              {cfg?.label ?? lbl?.name ?? id}
                            </Badge>
                          );
                        })}
                      </div>
                      <p className={cn('text-xs truncate mt-0.5', msg.isUnread ? 'text-gray-200' : 'text-gray-500')}>
                        {msg.subject}
                      </p>
                    </div>
                    <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{formatDate(msg.date)}</span>
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeStep === 1 && (
        <motion.div key="interact" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Smart Inbox</h3>
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700/50 rounded-lg"
            >
              <span className="text-xs text-gray-400">1 selected</span>
              <Button size="sm" variant="ghost" className="h-6 text-xs text-gray-300">Archive</Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs text-gray-300">Snooze</Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400">Delete</Button>
            </motion.div>
          </div>
          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardContent className="p-0">
              {/* Show real emails if available, else fallback to mock */}
              {(messages.length > 0 ? messages.slice(0, 5) : mockEmails.slice(0, 5)).map((msg, i) => {
                const isReal = messages.length > 0;
                const isSelected = i === 0;

                // Normalize to a common shape
                const id = isReal ? (msg as GmailMessage).id : (msg as typeof mockEmails[0]).id;
                const displayName = isReal
                  ? parseFromField((msg as GmailMessage).from).name
                  : (msg as typeof mockEmails[0]).from.name;
                const avatarText = isReal
                  ? parseFromField((msg as GmailMessage).from).avatar
                  : (msg as typeof mockEmails[0]).from.avatar;
                const subject = isReal ? (msg as GmailMessage).subject : (msg as typeof mockEmails[0]).subject;
                const isUnread = isReal ? (msg as GmailMessage).isUnread : !(msg as typeof mockEmails[0]).isRead;
                const dateStr = isReal ? formatDate((msg as GmailMessage).date) : (msg as typeof mockEmails[0]).timestamp;

                // Badge
                let badgeInfo: { label: string; color: string; bg: string } | null = null;
                if (isReal) {
                  badgeInfo = getPrimaryBadge((msg as GmailMessage).labelIds, labelMap);
                } else {
                  const mockCat = (msg as typeof mockEmails[0]).category;
                  const catMap: Record<string, { label: string; color: string; bg: string }> = {
                    to_respond: { label: 'To Respond', color: 'text-green-400', bg: 'bg-green-500/20 border-green-500/30' },
                    fyi: { label: 'FYI', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
                    marketing: { label: 'Marketing', color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/30' },
                    automated: { label: 'Automated', color: 'text-gray-400', bg: 'bg-gray-500/20 border-gray-500/30' },
                  };
                  badgeInfo = catMap[mockCat] ?? null;
                }

                const isStarred = starredIds.has(id) || (!isReal && (msg as typeof mockEmails[0]).isStarred);

                return (
                  <div
                    key={id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 border-b border-gray-700/30 last:border-0',
                      isSelected && 'bg-blue-500/10 border-l-2 border-l-blue-500'
                    )}
                  >
                    <Star className={cn('w-4 h-4 flex-shrink-0', isStarred ? 'text-amber-400 fill-amber-400' : 'text-gray-600')} />
                    <div className="w-7 h-7 rounded-full bg-gray-700/50 flex items-center justify-center text-xs text-gray-300 flex-shrink-0">
                      {avatarText}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-300 truncate">{displayName}</span>
                        {badgeInfo && (
                          <Badge className={cn('text-xs border', badgeInfo.bg, badgeInfo.color)}>{badgeInfo.label}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{subject}</p>
                    </div>
                    <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{dateStr}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeStep === 2 && (
        <motion.div key="labelsync" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <h3 className="text-lg font-semibold text-white mb-4 text-center">Label Sync</h3>
          <div className="grid grid-cols-5 gap-4 items-start">
            {/* Left: 60 Categories */}
            <div className="col-span-2">
              <Card className="bg-gray-800/60 border-gray-700/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-400" />
                    <CardTitle className="text-sm text-white">60 Categories</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sixtyCategories.map((cat, i) => (
                    <motion.div
                      key={cat.key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * i }}
                      className="flex items-center gap-2 p-2 rounded bg-gray-900/40"
                    >
                      <div className={cn('w-2 h-2 rounded-full', cat.dotColor)} />
                      <span className="text-xs text-gray-300">{cat.label}</span>
                      <span className="text-xs text-gray-600 ml-auto">{cat.count}</span>
                    </motion.div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Center: Arrows */}
            <div className="flex flex-col items-center justify-center gap-2 pt-16">
              {Array.from({ length: Math.min(sixtyCategories.length, gmailLabelDisplay.length) }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + 0.15 * i }}
                >
                  <ArrowRight className="w-5 h-5 text-blue-400" />
                </motion.div>
              ))}
            </div>

            {/* Right: Real Gmail Labels */}
            <div className="col-span-2">
              <Card className="bg-gray-800/60 border-gray-700/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-red-400" />
                    <CardTitle className="text-sm text-white">Gmail Labels</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {labelsLoading && (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                      <span className="text-xs text-gray-500">Loading labels...</span>
                    </div>
                  )}
                  {!labelsLoading && gmailLabelDisplay.map((label, i) => (
                    <motion.div
                      key={label.name}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + 0.1 * i }}
                      className="flex items-center gap-2 p-2 rounded bg-gray-900/40"
                    >
                      <Badge className={cn('text-xs border', label.color)}>{label.name}</Badge>
                      <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 1.2 + 0.1 * i }}
                      >
                        <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />
                      </motion.div>
                    </motion.div>
                  ))}
                  {!labelsLoading && gmailLabelDisplay.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-2">No labels found</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
