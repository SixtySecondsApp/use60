import {
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  AtSign,
  Paperclip,
  Image,
  FileText,
  Send,
  Users,
  Mail,
  Clock,
  ArrowRight,
  MessageCircle,
  ExternalLink,
  CheckCircle2,
  Loader2,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Task } from '@/lib/database/models';
import { Button } from '@/components/ui/button';
import { CampaignWorkflowDeliverable } from './types';

interface DeliverableEditorProps {
  task: Task;
}

export function DeliverableEditor({ task }: DeliverableEditorProps) {
  const navigate = useNavigate();
  const hasDeliverable = task.deliverable_data && Object.keys(task.deliverable_data).length > 0;

  if (!hasDeliverable) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-slate-400 dark:text-slate-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
          No content yet
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
          This task doesn&apos;t have any deliverable content yet. The AI will generate content when it processes this task.
        </p>
      </div>
    );
  }

  // Campaign Workflow Renderer
  const deliverableData = task.deliverable_data as CampaignWorkflowDeliverable;
  if (deliverableData?.type === 'campaign_workflow' || task.deliverable_type === 'campaign_workflow') {
    const isWorking = task.ai_status === 'working';
    const isDraftReady = task.ai_status === 'draft_ready';
    const isFailed = task.ai_status === 'failed';

    return (
      <div className="p-6">
        {/* Working State */}
        {isWorking && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-violet-600 dark:text-violet-400 animate-spin" />
              </div>
              <div className="absolute inset-0 w-16 h-16 rounded-full bg-violet-400/20 dark:bg-violet-400/10 animate-ping" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                AI is building your campaign...
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Finding leads, generating emails, and setting up your workflow
              </p>
            </div>
            {deliverableData.steps && deliverableData.steps.length > 0 && (
              <div className="w-full max-w-md mt-4 space-y-2">
                {deliverableData.steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-sm">
                    {step.status === 'complete' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : step.status === 'working' ? (
                      <Loader2 className="w-4 h-4 text-violet-500 animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 shrink-0" />
                    )}
                    <span className={step.status === 'complete' ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-white'}>
                      {step.step}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Draft Ready State */}
        {isDraftReady && (
          <div className="space-y-6">
            {/* Campaign Name */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Send className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {deliverableData.campaign_name || 'Campaign Workflow'}
                </h3>
              </div>
              {deliverableData.prompt && (
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                  {deliverableData.prompt}
                </p>
              )}
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-4">
              {deliverableData.leads_found !== undefined && (
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200/50 dark:border-blue-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                      Leads
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                    {deliverableData.leads_found}
                  </div>
                </div>
              )}
              {deliverableData.emails_generated !== undefined && (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/50 dark:border-emerald-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                      Emails
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                    {deliverableData.emails_generated}
                  </div>
                </div>
              )}
              {deliverableData.duration_ms !== undefined && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                      Build Time
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {(deliverableData.duration_ms / 1000).toFixed(1)}s
                  </div>
                </div>
              )}
            </div>

            {/* Step Summary */}
            {deliverableData.steps && deliverableData.steps.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Workflow Steps
                </h4>
                <div className="space-y-2">
                  {deliverableData.steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">
                          {step.step}
                        </div>
                        {step.summary && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {step.summary}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              {deliverableData.table_id && (
                <Button
                  onClick={() => navigate(`/ops/${deliverableData.table_id}`)}
                  className="flex-1"
                  variant="default"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in Ops Table
                </Button>
              )}
              {deliverableData.conversation_id && (
                <Button
                  onClick={() => navigate(`/copilot?conversation=${deliverableData.conversation_id}`)}
                  variant="outline"
                  className="flex-1"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Continue in Copilot
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Failed State */}
        {isFailed && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Campaign build failed
              </h3>
              {deliverableData.error && (
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md">
                  {deliverableData.error}
                </p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Try creating a new campaign or contact support if the issue persists
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Editor Toolbar */}
      <div className="flex items-center gap-1 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
        <Button variant="ghost" size="icon" className="w-8 h-8">
          <Bold className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="w-8 h-8">
          <Italic className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="w-8 h-8">
          <Link className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-2" />
        <Button variant="ghost" size="icon" className="w-8 h-8">
          <List className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="w-8 h-8">
          <ListOrdered className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-2" />
        <Button variant="ghost" size="icon" className="w-8 h-8">
          <AtSign className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="w-8 h-8">
          <Paperclip className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="w-8 h-8">
          <Image className="w-4 h-4" />
        </Button>
      </div>

      {/* Content Renderer */}
      <div className="prose prose-slate dark:prose-invert max-w-none">
        {typeof task.deliverable_data === 'string' ? (
          <div className="whitespace-pre-wrap">{task.deliverable_data}</div>
        ) : (
          <div className="space-y-4">
            {Object.entries(task.deliverable_data).map(([key, value]) => (
              <div key={key}>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 capitalize">
                  {key.replace(/_/g, ' ')}
                </h3>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  {typeof value === 'string' ? (
                    <p className="whitespace-pre-wrap">{value}</p>
                  ) : Array.isArray(value) ? (
                    <ul className="list-disc list-inside space-y-1">
                      {value.map((item, idx) => (
                        <li key={idx}>{String(item)}</li>
                      ))}
                    </ul>
                  ) : typeof value === 'object' && value !== null ? (
                    <pre className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto text-xs">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    <span>{String(value)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Task Notes/Description as fallback */}
        {!task.deliverable_data && task.notes && (
          <div className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
            {task.notes}
          </div>
        )}
      </div>
    </div>
  );
}
