import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Mail, Code, ChevronDown, ChevronUp } from 'lucide-react';

export function V1ResultPreview({ result, v1UseRealData }: { result: Record<string, unknown>; v1UseRealData: boolean }) {
  const [showRaw, setShowRaw] = useState(false);
  const r = result as any;

  // Extract common fields from proactive-simulate responses
  const slackSent = r.slack?.sent || r.slackSent;
  const inAppCreated = r.inApp?.created || r.inAppCreated;
  const emailSent = r.email?.sent || r.emailSent;

  // Try to extract structured content from various response shapes
  const slackBlocks = r.slack?.blocks || r.blocks;
  const slackText = r.slack?.text || r.text || r.message;
  const emailSubject = r.email?.subject || r.subject;
  const emailBody = r.email?.body || r.body;
  const title = r.title || r.meetingTitle || r.dealName;
  const summary = r.summary || r.brief || r.digest;
  const actionItems = r.actionItems || r.action_items || r.tasks || [];
  const insights = r.insights || r.recommendations || r.coaching || [];

  return (
    <div className="space-y-3">
      {/* Status badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Result</span>
        {slackSent && <Badge variant="default" className="text-[10px] bg-purple-600">Slack sent</Badge>}
        {emailSent && <Badge variant="default" className="text-[10px] bg-blue-600">Email sent</Badge>}
        {inAppCreated && <Badge variant="secondary" className="text-[10px]">In-app created</Badge>}
        {v1UseRealData && <Badge variant="outline" className="text-[10px] text-emerald-600">Live data</Badge>}
      </div>

      {/* Rich preview card */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        {/* Title */}
        {title && (
          <h4 className="font-medium text-sm">{title}</h4>
        )}

        {/* Summary / main content */}
        {summary && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{typeof summary === 'string' ? summary.slice(0, 500) : JSON.stringify(summary)}</p>
        )}

        {/* Slack text preview */}
        {slackText && !summary && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 font-medium">
              <MessageSquare className="w-3 h-3" />
              Slack Message
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-purple-300 dark:border-purple-700 pl-3">
              {typeof slackText === 'string' ? slackText.slice(0, 500) : JSON.stringify(slackText)}
            </p>
          </div>
        )}

        {/* Email preview */}
        {emailSubject && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
              <Mail className="w-3 h-3" />
              Email Draft
            </div>
            <div className="text-sm border-l-2 border-blue-300 dark:border-blue-700 pl-3">
              <div className="font-medium">{emailSubject}</div>
              {emailBody && <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{typeof emailBody === 'string' ? emailBody.slice(0, 400) : ''}</p>}
            </div>
          </div>
        )}

        {/* Action items */}
        {Array.isArray(actionItems) && actionItems.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Action Items ({actionItems.length})</div>
            <ul className="space-y-1">
              {actionItems.slice(0, 5).map((item: any, i: number) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#10003;</span>
                  <span>{typeof item === 'string' ? item : item.title || item.task || item.text || JSON.stringify(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Insights / recommendations */}
        {Array.isArray(insights) && insights.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Insights ({insights.length})</div>
            <ul className="space-y-1">
              {insights.slice(0, 3).map((item: any, i: number) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">&#9679;</span>
                  <span>{typeof item === 'string' ? item : item.action || item.text || item.recommendation || JSON.stringify(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Slack Block Kit sections preview */}
        {Array.isArray(slackBlocks) && slackBlocks.length > 0 && !slackText && !summary && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 font-medium">
              <MessageSquare className="w-3 h-3" />
              Slack Blocks ({slackBlocks.length})
            </div>
            {slackBlocks.slice(0, 4).map((block: any, i: number) => (
              <div key={i} className="text-xs text-muted-foreground border-l-2 border-purple-200 dark:border-purple-800 pl-3">
                {block.text?.text || block.text || (block.type === 'divider' ? '---' : block.type)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raw JSON toggle */}
      <button
        onClick={() => setShowRaw(!showRaw)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Code className="w-3 h-3" />
        {showRaw ? 'Hide' : 'Show'} Raw JSON
        {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {showRaw && (
        <Textarea
          value={JSON.stringify(result, null, 2)}
          readOnly
          className="min-h-[180px] font-mono text-xs"
        />
      )}
    </div>
  );
}
