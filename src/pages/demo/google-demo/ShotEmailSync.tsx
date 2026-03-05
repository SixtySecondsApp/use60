import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Wand2, Zap, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useGmailEmails } from '@/lib/hooks/useGoogleIntegration';
import { contacts } from './mockData';
import type { ShotComponentProps } from './types';

// ── Types ────────────────────────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  labelIds?: string[];
  isUnread: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────

function parseSenderName(from: string): { name: string; initials: string } {
  // "John Doe <john@example.com>" or just "john@example.com"
  const match = from.match(/^(.+?)\s*<.+>$/);
  const name = match ? match[1].replace(/"/g, '').trim() : from.split('@')[0];
  const init = name
    .split(/[\s.]+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return { name, initials: init || '??' };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Skeletons ────────────────────────────────────────────────────

function EmailListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2 py-3 border-b border-gray-700/30 last:border-0">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-700/50 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-700/50 rounded animate-pulse w-48" />
              <div className="h-2 bg-gray-700/30 rounded animate-pulse w-full" />
              <div className="h-2 bg-gray-700/30 rounded animate-pulse w-3/4" />
            </div>
          </div>
        </div>
      ))}
      <p className="text-xs text-gray-500 text-center py-2">Loading emails from Gmail...</p>
    </div>
  );
}

// ── Contact header (mock data) ───────────────────────────────────

function ContactHeader() {
  const c = contacts[0];
  return (
    <div className="flex items-center gap-4 p-4 bg-gray-800/40 rounded-lg border border-gray-700/50 mb-4">
      <Avatar className="w-12 h-12">
        <AvatarFallback className="bg-blue-500/20 text-blue-300 font-semibold">{c.avatar}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <h3 className="text-base font-semibold text-white">{c.name}</h3>
        <p className="text-sm text-gray-400">{c.role} at {c.company}</p>
      </div>
      <div className="flex gap-2">
        <Badge variant="outline" className="border-amber-500/40 text-amber-400">Negotiation</Badge>
        <Badge variant="outline" className="border-green-500/40 text-green-400">&pound;45,000</Badge>
      </div>
    </div>
  );
}

// ── Email row ────────────────────────────────────────────────────

function EmailRow({
  message,
  index,
  isNew,
}: {
  message: GmailMessage;
  index: number;
  isNew?: boolean;
}) {
  const { name, initials: init } = parseSenderName(message.from);
  const isUnread = message.isUnread;

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: -20, height: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      transition={isNew ? { type: 'spring', stiffness: 300, damping: 25 } : { delay: 0.08 * index }}
      className={cn(
        'flex items-start gap-3 py-3 border-b border-gray-700/30 last:border-0',
        isNew && 'bg-blue-500/5 -mx-4 px-4 rounded-t',
      )}
    >
      <div className="relative">
        <Avatar className="w-8 h-8">
          <AvatarFallback className={cn(
            'text-xs font-medium',
            isUnread ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-700/50 text-gray-400',
          )}>
            {init}
          </AvatarFallback>
        </Avatar>
        {isNew && (
          <motion.div
            animate={{ scale: [1, 1.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-gray-800"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm truncate', isUnread ? 'font-semibold text-white' : 'font-medium text-gray-300')}>{name}</span>
          {isNew ? (
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">Just now</Badge>
          ) : (
            <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(message.date)}</span>
          )}
        </div>
        <p className={cn('text-xs mt-0.5 truncate', isUnread ? 'text-gray-200 font-medium' : 'text-gray-400')}>{message.subject}</p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{message.snippet}</p>
      </div>
    </motion.div>
  );
}

// ── Step variants ────────────────────────────────────────────────

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

// ── Main component ───────────────────────────────────────────────

export default function ShotEmailSync({ activeStep, onStepChange, isActive }: ShotComponentProps) {
  const { data: gmailData, isLoading, refetch, dataUpdatedAt } = useGmailEmails();

  const messages: GmailMessage[] = useMemo(
    () => (gmailData?.messages ?? []).slice(0, 8),
    [gmailData?.messages],
  );

  // Track which message IDs existed at step 1 so step 3 can highlight new ones
  const [step1Ids, setStep1Ids] = useState<Set<string>>(new Set());
  const [step3Messages, setStep3Messages] = useState<GmailMessage[]>([]);
  const [isRefetching, setIsRefetching] = useState(false);

  // Capture message IDs when we enter step 1
  useEffect(() => {
    if (activeStep === 1 && messages.length > 0) {
      setStep1Ids(new Set(messages.map((m) => m.id)));
    }
  }, [activeStep, messages]);

  // When entering step 3, refetch to get latest emails
  useEffect(() => {
    if (activeStep === 3) {
      setIsRefetching(true);
      refetch().then((result) => {
        const latest: GmailMessage[] = (result.data?.messages ?? []).slice(0, 8);
        setStep3Messages(latest);
        setIsRefetching(false);
      }).catch(() => {
        // Fallback: just use current messages
        setStep3Messages(messages);
        setIsRefetching(false);
      });
    }
  }, [activeStep]); // intentionally not adding refetch/messages to deps to run only on step change

  // Determine which emails are "new" (appeared after step 1 snapshot)
  const newMessageIds = useMemo(() => {
    if (step1Ids.size === 0) return new Set<string>();
    return new Set(step3Messages.filter((m) => !step1Ids.has(m.id)).map((m) => m.id));
  }, [step1Ids, step3Messages]);

  // For the AI analysis panel, use the first real email if available
  const firstEmail = messages[0];

  return (
    <AnimatePresence mode="wait">
      {/* ── Step 0: Contact header + loading skeleton ── */}
      {activeStep === 0 && (
        <motion.div key="skeleton" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <ContactHeader />
          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-500" />
                <CardTitle className="text-sm text-gray-400">Email History</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <EmailListSkeleton />
              ) : messages.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">No emails found in Gmail.</p>
              ) : (
                <EmailListSkeleton />
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Step 1: Real email thread list ── */}
      {activeStep === 1 && (
        <motion.div key="threads" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <ContactHeader />
          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <CardTitle className="text-sm text-white">Email History</CardTitle>
                </div>
                <Badge variant="outline" className="border-blue-500/40 text-blue-400 text-xs">
                  {messages.length} email{messages.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <EmailListSkeleton />
              ) : messages.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">No emails found.</p>
              ) : (
                messages.map((msg, i) => (
                  <EmailRow key={msg.id} message={msg} index={i} />
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Step 2: AI analysis panel ── */}
      {activeStep === 2 && (
        <motion.div key="analysis" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="grid grid-cols-5 gap-4">
          <div className="col-span-3">
            <ContactHeader />
            <Card className="bg-gray-800/60 border-gray-700/50">
              <CardContent className="py-3">
                {messages.slice(0, 2).map((msg, i) => {
                  const { name, initials: init } = parseSenderName(msg.from);
                  return (
                    <div key={msg.id} className="flex items-start gap-3 py-2 border-b border-gray-700/30 last:border-0">
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className={cn(
                          'text-xs',
                          msg.isUnread ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-700/50 text-gray-400',
                        )}>
                          {init}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white">{name}</span>
                          <span className="text-xs text-gray-600">{formatDate(msg.date)}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{msg.snippet}</p>
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-4">No emails to analyse.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="col-span-2">
            <Card className="bg-gray-800/60 border-blue-500/20 border">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-blue-400" />
                  <CardTitle className="text-sm text-white">AI Thread Analysis</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Summary</p>
                  <p className="text-xs text-gray-300">
                    {firstEmail
                      ? `Analysing thread "${firstEmail.subject}" — ${firstEmail.snippet.slice(0, 100)}...`
                      : 'Active pricing negotiation. CFO reviewing annual commitment. Buyer is engaged but needs ROI validation for board approval.'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Sentiment</p>
                  <div className="flex gap-1.5">
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Positive</Badge>
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">Engaged</Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Key Topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['Annual pricing', 'ROI case', 'CFO approval', 'Implementation'].map((t) => (
                      <Badge key={t} variant="outline" className="border-gray-600 text-gray-400 text-xs">{t}</Badge>
                    ))}
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-700/30">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <p className="text-xs font-medium text-amber-300">Suggested Action</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Send follow-up with ROI case study and flexible commitment structure before Thursday meeting.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

      {/* ── Step 3: New email animation / refetch ── */}
      {activeStep === 3 && (
        <motion.div key="newemail" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <ContactHeader />
          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <CardTitle className="text-sm text-white">Email History</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {isRefetching && (
                    <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
                  )}
                  <Badge variant="outline" className="border-blue-500/40 text-blue-400 text-xs">
                    {step3Messages.length || messages.length} email{(step3Messages.length || messages.length) !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isRefetching ? (
                <EmailListSkeleton />
              ) : (
                (step3Messages.length > 0 ? step3Messages : messages).map((msg, i) => {
                  const isNew = newMessageIds.has(msg.id);
                  // Show newest first: new emails at top
                  return (
                    <EmailRow
                      key={msg.id}
                      message={msg}
                      index={isNew ? 0 : i}
                      isNew={isNew}
                    />
                  );
                })
              )}
              {!isRefetching && newMessageIds.size === 0 && step3Messages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-xs text-gray-500 text-center py-2"
                >
                  No new emails since last check — inbox is up to date.
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
