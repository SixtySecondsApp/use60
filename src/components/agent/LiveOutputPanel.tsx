import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Zap,
  Mail,
  CheckCircle2,
  Brain,
  ArrowRight,
  GraduationCap,
  Loader2,
  SkipForward,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EmailPreview } from '@/components/agent/EmailPreview';
import { SKILL_DISPLAY_NAMES } from '@/lib/agent/abilityRegistry';

interface LiveOutputPanelProps {
  stepResults: any[];
  jobStatus: string | null;
  jobId: string | null;
  eventType?: string;
}

export function LiveOutputPanel({
  stepResults,
  jobStatus,
  jobId,
  eventType,
}: LiveOutputPanelProps) {
  // Build a map of step outputs
  const outputMap = new Map<string, any>();
  for (const r of stepResults) {
    if (r.status === 'completed' && r.output && !r.output?.skipped) {
      outputMap.set(r.skill_key, r.output);
    }
  }

  // Find specific step outputs (used across sequences)
  const classifyOutput = outputMap.get('classify-call-type');
  const actionItemsOutput = outputMap.get('extract-action-items');
  const intentsOutput = outputMap.get('detect-intents');
  const emailDraftOutput = outputMap.get('draft-followup-email');
  const coachingOutput = outputMap.get('coaching-micro-feedback');
  const nextActionsOutput = outputMap.get('suggest-next-actions');

  // Check if email was skipped
  const emailStep = stepResults.find(r => r.skill_key === 'draft-followup-email');
  const emailSkipped = emailStep?.output?.skipped;
  const emailSkipReason = emailStep?.output?.reason;

  // Collect outputs that don't have dedicated renderers (for generic display)
  const knownKeys = new Set([
    'classify-call-type', 'extract-action-items', 'detect-intents',
    'suggest-next-actions', 'draft-followup-email', 'coaching-micro-feedback',
  ]);
  const genericOutputs: Array<{ key: string; output: any }> = [];
  for (const [key, output] of outputMap) {
    if (!knownKeys.has(key) && !output.stub) {
      genericOutputs.push({ key, output });
    }
  }

  // Nothing yet — show waiting state
  if (stepResults.length === 0 && !jobId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Zap className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select a meeting and run the orchestrator to see live results here
          </p>
        </CardContent>
      </Card>
    );
  }

  if (stepResults.length === 0 && jobId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Waiting for orchestrator results...
          </p>
          <p className="text-xs text-gray-400 mt-1">Job: {jobId.slice(0, 8)}...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-gray-400">
        <Zap className="w-4 h-4" />
        <span>Live Orchestrator Output</span>
        {jobStatus && (
          <Badge
            variant={jobStatus === 'completed' ? 'default' : jobStatus === 'failed' ? 'destructive' : 'secondary'}
            className="text-[10px] ml-auto"
          >
            {jobStatus}
          </Badge>
        )}
      </div>

      {/* Call Type Classification */}
      {classifyOutput && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg border',
              classifyOutput.is_sales
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                : 'bg-gray-50 dark:bg-gray-500/10 border-gray-200 dark:border-gray-500/30'
            )}>
              <div className={cn(
                'w-2 h-2 rounded-full',
                classifyOutput.is_sales ? 'bg-emerald-500' : 'bg-gray-400'
              )} />
              <span className={cn(
                'font-semibold text-sm',
                classifyOutput.is_sales
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-gray-600 dark:text-gray-400'
              )}>
                {classifyOutput.call_type_name || 'Unknown'}
              </span>
              {classifyOutput.confidence && (
                <span className="text-[11px] text-gray-400">
                  {(classifyOutput.confidence * 100).toFixed(0)}% confident
                </span>
              )}
              {!classifyOutput.is_sales && (
                <Badge variant="secondary" className="text-[9px] ml-auto">Non-sales</Badge>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Action Items */}
      {actionItemsOutput && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Action Items ({actionItemsOutput.itemsCreated || actionItemsOutput.items?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {actionItemsOutput.items ? (
                actionItemsOutput.items.map((item: any, i: number) => (
                  <div key={i} className="flex gap-2 text-[13px]">
                    <span className="text-gray-400 shrink-0">{i + 1}.</span>
                    <div>
                      <span className="text-gray-900 dark:text-gray-200">
                        {item.description || item.action || item.text || JSON.stringify(item)}
                      </span>
                      {item.assignee && (
                        <span className="text-gray-400 ml-1">({item.assignee})</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-gray-500">
                  {actionItemsOutput.itemsCreated || 0} action items extracted
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Intents & Buying Signals */}
      {intentsOutput && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-500" />
                Intents & Signals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {intentsOutput.commitments?.length > 0 && (
                <div>
                  <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Commitments ({intentsOutput.commitments.length})
                  </div>
                  {intentsOutput.commitments.map((c: any, i: number) => (
                    <div key={i} className="text-[13px] text-gray-700 dark:text-gray-300 flex gap-2 mb-1">
                      <span className="text-purple-500 shrink-0">-</span>
                      <span>{c.phrase || c.text || c.description || JSON.stringify(c)}</span>
                    </div>
                  ))}
                </div>
              )}
              {intentsOutput.buying_signals?.length > 0 && (
                <div>
                  <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Buying Signals ({intentsOutput.buying_signals.length})
                  </div>
                  {intentsOutput.buying_signals.slice(0, 5).map((s: any, i: number) => (
                    <div key={i} className="text-[13px] text-gray-700 dark:text-gray-300 flex gap-2 mb-1">
                      <span className="text-amber-500 shrink-0">-</span>
                      <span>{s.phrase || s.text || s.signal || JSON.stringify(s)}</span>
                    </div>
                  ))}
                </div>
              )}
              {intentsOutput.follow_up_items?.length > 0 && (
                <div>
                  <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Follow-up Items ({intentsOutput.follow_up_items.length})
                  </div>
                  {intentsOutput.follow_up_items.slice(0, 3).map((f: any, i: number) => (
                    <div key={i} className="text-[13px] text-gray-700 dark:text-gray-300 flex gap-2 mb-1">
                      <span className="text-blue-500 shrink-0">-</span>
                      <span>{f.description || f.text || f.action || JSON.stringify(f)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Next Best Actions */}
      {nextActionsOutput && nextActionsOutput.suggestions?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-blue-500" />
                Next Best Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {nextActionsOutput.suggestions.map((s: any, i: number) => (
                <div key={i} className="text-[13px] text-gray-700 dark:text-gray-300 flex gap-2 mb-1">
                  <span className="text-blue-500 shrink-0">{i + 1}.</span>
                  <span>{s.action || s.description || s.text || JSON.stringify(s)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Email Draft or Skip */}
      {emailDraftOutput?.email_draft ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <div className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-gray-400">
            <Mail className="w-4 h-4" />
            <span>Draft email (awaiting approval)</span>
          </div>
          <EmailPreview
            from="You"
            to={emailDraftOutput.email_draft.to || 'Unknown'}
            subject={emailDraftOutput.email_draft.subject || 'Follow-up'}
            body={emailDraftOutput.email_draft.body || ''}
            timestamp={new Date().toLocaleString()}
          />
        </motion.div>
      ) : emailSkipped ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className="border-dashed border-gray-200 dark:border-gray-700">
            <CardContent className="py-4 flex items-center gap-3">
              <SkipForward className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Email draft skipped</p>
                <p className="text-[11px] text-gray-400">
                  {emailSkipReason === 'no_contact_email'
                    ? 'No contact email linked to this meeting. Link a contact in CRM to enable email drafting.'
                    : emailSkipReason || 'Step was skipped'}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      {/* Coaching Feedback */}
      {coachingOutput && !coachingOutput.skipped && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.35 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-violet-500" />
                Coaching Feedback
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[13px] text-gray-700 dark:text-gray-300 space-y-2">
              {coachingOutput.talk_ratio != null && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Talk Ratio:</span>
                  <span className="font-medium">{coachingOutput.talk_ratio}%</span>
                </div>
              )}
              {coachingOutput.strengths?.length > 0 && (
                <div>
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Strengths</div>
                  {coachingOutput.strengths.map((s: any, i: number) => (
                    <div key={i} className="flex gap-2 mb-0.5">
                      <span className="text-emerald-500 shrink-0">+</span>
                      <span>{typeof s === 'string' ? s : s.text || s.description || JSON.stringify(s)}</span>
                    </div>
                  ))}
                </div>
              )}
              {coachingOutput.improvements?.length > 0 && (
                <div>
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Areas to Improve</div>
                  {coachingOutput.improvements.map((s: any, i: number) => (
                    <div key={i} className="flex gap-2 mb-0.5">
                      <span className="text-amber-500 shrink-0">-</span>
                      <span>{typeof s === 'string' ? s : s.text || s.description || JSON.stringify(s)}</span>
                    </div>
                  ))}
                </div>
              )}
              {!coachingOutput.talk_ratio && !coachingOutput.strengths && (
                <p className="text-gray-500 italic">Coaching analysis completed</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Generic output cards for steps without dedicated renderers */}
      {genericOutputs.map(({ key, output }, idx) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 + idx * 0.05 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-500" />
                {SKILL_DISPLAY_NAMES[key] || key}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[13px] text-gray-700 dark:text-gray-300">
              {typeof output === 'string' ? (
                <p>{output}</p>
              ) : output.summary || output.executive_summary || output.text || output.message ? (
                <p>{output.summary || output.executive_summary || output.text || output.message}</p>
              ) : (
                <pre className="text-[11px] text-gray-500 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {JSON.stringify(output, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
