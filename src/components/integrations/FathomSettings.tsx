import React, { useState } from 'react';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { useOrgStore } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, X, RefreshCw, Calendar, Play, Trash2, Copy, Zap, ExternalLink, ChevronDown, ChevronUp, AlertTriangle, Clock, BrainCircuit } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FathomTokenTest } from '@/components/FathomTokenTest';
import { toast } from 'sonner';

// Webhook URL should match the current environment domain.
// Prefer an explicit public URL env var if set, otherwise fall back to window.location.origin.

export function FathomSettings() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const WEBHOOK_URL = `${(import.meta as any)?.env?.VITE_PUBLIC_URL || window.location.origin}/api/webhooks/fathom${activeOrgId ? `?org_id=${encodeURIComponent(activeOrgId)}` : ''}`;

  const {
    integration,
    syncState,
    loading,
    error,
    isConnected,
    isSyncing,
    canManage,
    lifetimeMeetingsCount,
    connectFathom,
    disconnectFathom,
    triggerSync,
  } = useFathomIntegration();

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncType, setSyncType] = useState<'initial' | 'incremental' | 'manual' | 'all_time'>('manual');
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
  const [syncing, setSyncing] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [deleteSyncedMeetings, setDeleteSyncedMeetings] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showWebhookGuide, setShowWebhookGuide] = useState(true);
  const [webhookDismissed, setWebhookDismissed] = useState(false);

  // Load webhook dismiss state from integration record
  React.useEffect(() => {
    if (integration && (integration as any).webhook_setup_dismissed) {
      setWebhookDismissed(true);
    } else {
      setWebhookDismissed(false);
    }
  }, [integration]);

  const dismissWebhookBanner = async () => {
    setWebhookDismissed(true);
    if (integration) {
      const supabaseAny = supabase as any;
      await supabaseAny
        .from('fathom_integrations')
        .update({ webhook_setup_dismissed: true })
        .eq('id', integration.id);
    }
  };
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<any>(null);
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number; currentMeeting: string } | null>(null);
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());
  const [retryingMeetingId, setRetryingMeetingId] = useState<string | null>(null);
  const [runningAiAnalysis, setRunningAiAnalysis] = useState(false);

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      toast.success('Webhook URL copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy URL');
    }
  };

  const handleSync = async () => {
    // Close modal immediately and run sync in background
    // The realtime subscription on fathom_sync_state will update the UI
    setShowSyncModal(false);
    toast.info('Sync started', { description: 'Your meetings are syncing in the background. You can continue working.' });
    triggerSync({
      sync_type: syncType,
      start_date: dateRange.start,
      end_date: dateRange.end,
    }).then((result) => {
      if (result?.upgrade_required) {
        toast.warning('Upgrade required', { description: result.limit_warning || 'Free tier limit reached.' });
      } else if (result?.meetings_synced !== undefined) {
        toast.success('Sync complete', { description: `${result.meetings_synced} meeting${result.meetings_synced === 1 ? '' : 's'} synced.` });
      }
    }).catch(() => {
      toast.error('Sync failed', { description: 'Check the Fathom settings page for details.' });
    });
  };

  const handleSyncNewMeetings = async () => {
    toast.info('Syncing new meetings...', { description: 'Running in the background.' });
    triggerSync({ sync_type: 'incremental' }).then((result) => {
      if (result?.meetings_synced !== undefined) {
        toast.success('Sync complete', { description: `${result.meetings_synced} new meeting${result.meetings_synced === 1 ? '' : 's'} synced.` });
      }
    }).catch(() => {
      toast.error('Sync failed', { description: 'Check the Fathom settings page for details.' });
    });
  };

  const handleTestSync = async () => {
    setSyncing(true);
    try {
      // Test sync with only last 10 calls
      const result = await triggerSync({
        sync_type: 'manual',
        limit: 10
      });
    } catch (err) {
    } finally {
      setSyncing(false);
    }
  };

  const handleReprocessPending = async (mode: 'diagnose' | 'reprocess' = 'diagnose', meetingIds?: string[]) => {
    setReprocessing(true);
    setProcessingProgress(null);

    // Only clear results if starting fresh diagnose
    if (mode === 'diagnose') {
      setReprocessResult(null);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      if (mode === 'diagnose') {
        // Diagnose mode - single request
        const response = await fetch(
          `${(import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL)}/functions/v1/reprocess-pending-meetings`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              mode: 'diagnose',
              limit: 50,
              types: ['transcript', 'summary', 'thumbnail', 'ai_index']
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to diagnose pending meetings');
        }

        const result = await response.json();
        setReprocessResult(result);

        if (result.result?.total_pending === 0) {
          toast.success('All meetings are up to date!');
        } else {
          setShowReprocessModal(true);
          const shortCount = result.result?.short_meetings_count || 0;
          const totalPending = result.result?.total_pending || 0;
          toast.info(
            `Found ${totalPending} pending meeting${totalPending !== 1 ? 's' : ''}` +
            (shortCount > 0 ? ` (${shortCount} short/silent)` : '')
          );
        }
      } else {
        // Reprocess mode - process meetings one by one for live progress
        const meetings = meetingIds || reprocessResult?.result?.meetings?.map((m: any) => m.id) || [];
        const meetingTitles = reprocessResult?.result?.meetings?.reduce((acc: any, m: any) => {
          acc[m.id] = m.title || 'Untitled';
          return acc;
        }, {}) || {};

        if (meetings.length === 0) {
          toast.error('No meetings to process');
          return;
        }

        const allResults: any[] = [];
        let successCount = 0;
        let failedCount = 0;

        // Initialize progress result
        setReprocessResult({
          mode: 'reprocess',
          total_processed: 0,
          successful: 0,
          failed: 0,
          results: []
        });

        for (let i = 0; i < meetings.length; i++) {
          const meetingId = meetings[i];
          const meetingTitle = meetingTitles[meetingId] || 'Meeting';

          setProcessingProgress({
            current: i + 1,
            total: meetings.length,
            currentMeeting: meetingTitle
          });

          try {
            const result = await processSingleMeeting(meetingId);

            if (result.results?.[0]) {
              const meetingResult = result.results[0];
              allResults.push(meetingResult);

              const success = meetingResult.transcript?.success || meetingResult.summary?.success || meetingResult.thumbnail?.success;
              if (success) {
                successCount++;
              } else {
                failedCount++;
              }

              // Update results in real-time
              setReprocessResult({
                mode: 'reprocess',
                total_processed: allResults.length,
                successful: successCount,
                failed: failedCount,
                results: [...allResults]
              });
            }
          } catch (err) {
            failedCount++;
            allResults.push({
              meeting_id: meetingId,
              title: meetingTitle,
              error: err instanceof Error ? err.message : 'Unknown error',
              transcript: { success: false, message: err instanceof Error ? err.message : 'Failed' },
              summary: null,
              thumbnail: null,
              ai_index: null
            });

            setReprocessResult({
              mode: 'reprocess',
              total_processed: allResults.length,
              successful: successCount,
              failed: failedCount,
              results: [...allResults]
            });
          }
        }

        setProcessingProgress(null);

        // Final toast
        const shortMeetings = allResults.filter((r: any) => r.is_short_meeting);
        if (shortMeetings.length > 0) {
          toast.info(
            `Processed ${successCount} meetings. ${shortMeetings.length} short meetings had limited processing.`,
            { duration: 5000 }
          );
        } else if (failedCount > 0) {
          toast.warning(
            `Processed ${successCount} meetings successfully, ${failedCount} had issues.`
          );
        } else {
          toast.success(`Successfully processed ${successCount} meetings!`);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process pending meetings');
    } finally {
      setReprocessing(false);
      setProcessingProgress(null);
    }
  };

  const handleRunAiAnalysis = async () => {
    setRunningAiAnalysis(true);
    toast.info('AI Analysis started', { description: 'Analyzing meetings without coaching insights. This runs in the background.' });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('reprocess-meetings-ai', {
        body: { user_id: session.user.id, force: false },
      });

      if (error) throw error;

      const processed = data?.meetings_processed ?? 0;
      const actionItems = data?.action_items_created ?? 0;
      if (processed === 0) {
        toast.success('All meetings already have AI analysis');
      } else {
        toast.success('AI Analysis complete', {
          description: `${processed} meeting${processed === 1 ? '' : 's'} analyzed, ${actionItems} action item${actionItems === 1 ? '' : 's'} found.`,
        });
      }
    } catch (err) {
      toast.error('AI Analysis failed', {
        description: err instanceof Error ? err.message : 'Check logs for details.',
      });
    } finally {
      setRunningAiAnalysis(false);
    }
  };

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return 'Unknown';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const toggleMeetingExpanded = (meetingId: string) => {
    setExpandedMeetings(prev => {
      const next = new Set(prev);
      if (next.has(meetingId)) {
        next.delete(meetingId);
      } else {
        next.add(meetingId);
      }
      return next;
    });
  };

  const processSingleMeeting = async (meetingId: string): Promise<any> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${(import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL)}/functions/v1/reprocess-pending-meetings`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'reprocess',
          meeting_ids: [meetingId],
          types: ['transcript', 'summary', 'thumbnail', 'ai_index']
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to process meeting');
    }

    return response.json();
  };

  const handleRetryMeeting = async (meetingId: string, meetingTitle: string) => {
    setRetryingMeetingId(meetingId);
    try {
      const result = await processSingleMeeting(meetingId);

      if (result.results?.[0]) {
        const meetingResult = result.results[0];

        // Update the reprocessResult with the new result for this meeting
        setReprocessResult((prev: any) => {
          if (!prev) return prev;

          // If we're in diagnose mode, switch to showing results
          if (prev.mode === 'diagnose') {
            return {
              mode: 'reprocess',
              total_processed: 1,
              successful: meetingResult.transcript?.success || meetingResult.summary?.success ? 1 : 0,
              failed: meetingResult.transcript?.success || meetingResult.summary?.success ? 0 : 1,
              results: [meetingResult]
            };
          }

          // If we're already in reprocess mode, update the specific meeting
          const updatedResults = prev.results?.map((r: any) =>
            r.meeting_id === meetingId ? meetingResult : r
          ) || [meetingResult];

          return {
            ...prev,
            results: updatedResults
          };
        });

        const success = meetingResult.transcript?.success || meetingResult.summary?.success || meetingResult.thumbnail?.success;
        if (success) {
          toast.success(`Reprocessed "${meetingTitle}" successfully`);
        } else {
          toast.warning(`Reprocessed "${meetingTitle}" with some issues`);
        }
      }
    } catch (err) {
      toast.error(`Failed to reprocess: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRetryingMeetingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-gray-900 dark:bg-[#1a1a1a] px-3 py-2 rounded-lg flex items-center space-x-2 shadow-sm">
                <span className="text-white font-bold text-lg tracking-wide">FATHOM</span>
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                  <path d="M4 16C4 14 4 12 6 10C8 8 10 8 12 6C14 4 16 4 18 6C20 8 20 10 20 12" stroke="#00BEFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 20C4 18 4 16 6 14C8 12 10 12 12 10C14 8 16 8 18 10C20 12 20 14 20 16" stroke="#00BEFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <CardTitle className="text-gray-900 dark:text-white">Fathom Integration</CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">
                  Connect your Fathom account to automatically sync meeting recordings and insights
                </CardDescription>
              </div>
            </div>
            {isConnected && (
              <Badge variant="default" className="flex items-center gap-1 bg-green-500 hover:bg-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!isConnected ? (
            <div className="rounded-lg border border-dashed border-gray-300 dark:border-slate-600 p-6 text-center">
              <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">No Fathom Account Connected</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Connect your Fathom account to enable automatic meeting sync, transcription access, and AI-generated insights.
              </p>
              <Button
                onClick={connectFathom}
                disabled={!canManage}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
                {canManage ? 'Connect Fathom Account' : 'Connect Fathom (Admin only)'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Integration Details */}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Connected As</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {integration.fathom_user_email || (
                      <span className="text-orange-600 dark:text-orange-400">
                        Unknown - Run diagnostics below
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Permissions</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {integration.scopes.map((scope) => (
                      <Badge key={scope} variant="secondary" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Connected On</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {new Date(integration.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Last Sync</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {integration.last_sync_at ? new Date(integration.last_sync_at).toLocaleDateString() : 'Never'}
                  </div>
                </div>
              </div>

              {/* Instant Sync Webhook Setup */}
              {!webhookDismissed && (
              <div className="rounded-lg border-2 border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      <h4 className="font-semibold text-gray-900 dark:text-white">Enable Instant Meeting Sync</h4>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowWebhookGuide(!showWebhookGuide)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        {showWebhookGuide ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={dismissWebhookBanner}
                        className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                        title="Dismiss"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Add this webhook URL to Fathom so your meetings appear <strong>instantly</strong> when they finish recording — no waiting for scheduled syncs!
                  </p>

                  {/* Webhook URL with Copy Button */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white dark:bg-slate-800 rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 font-mono text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
                      {WEBHOOK_URL}
                    </div>
                    <Button
                      onClick={copyWebhookUrl}
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-2 border-amber-400 dark:border-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>

                  {showWebhookGuide && (
                    <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-700 space-y-3">
                      <h5 className="font-medium text-sm text-gray-900 dark:text-white">How to set up in Fathom:</h5>
                      <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
                        <li>
                          Go to{' '}
                          <a
                            href="https://fathom.video/settings/integrations"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
                          >
                            Fathom Settings → Integrations
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </li>
                        <li>Find the <strong>Webhooks</strong> section and click <strong>Add Webhook</strong></li>
                        <li>Paste the URL above into the webhook URL field</li>
                        <li>Select event type: <strong>"Recording Ready"</strong> or <strong>"All Events"</strong></li>
                        <li>Save the webhook configuration</li>
                      </ol>

                      <Alert className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700">
                        <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <AlertDescription className="text-emerald-800 dark:text-emerald-200">
                          <strong>Why add the webhook?</strong> Without it, meetings only sync on a schedule (hourly).
                          With the webhook, Fathom notifies us the moment your meeting ends, so it appears in your CRM within seconds!
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </div>
              )}

              {/* Sync Status */}
              {syncState && (
                <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Sync Status</h4>
                    <Badge
                      variant={
                        syncState.sync_status === 'syncing'
                          ? 'default'
                          : syncState.sync_status === 'error'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {syncState.sync_status === 'syncing' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {syncState.sync_status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-gray-600 dark:text-gray-400">Meetings Synced</div>
                      <div className="font-medium text-lg text-gray-900 dark:text-white">{syncState.meetings_synced}</div>
                    </div>
                    <div>
                      <div className="text-gray-600 dark:text-gray-400">Total Found</div>
                      <div className="font-medium text-lg text-gray-900 dark:text-white">{syncState.total_meetings_found}</div>
                    </div>
                    <div>
                      <div className="text-gray-600 dark:text-gray-400">Lifetime Meetings</div>
                      <div className="font-medium text-lg text-gray-900 dark:text-white">{lifetimeMeetingsCount}</div>
                    </div>
                  </div>

                  {syncState.last_sync_completed_at && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Last synced: {new Date(syncState.last_sync_completed_at).toLocaleString()}
                    </div>
                  )}

                  {syncState.last_sync_error && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertDescription className="text-xs">{syncState.last_sync_error}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {/* Token Test */}
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-3">
                <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Connection Diagnostics</h4>
                <FathomTokenTest />
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleTestSync}
                  disabled={isSyncing || syncing}
                  variant="secondary"
                  className="gap-2"
                  size="sm"
                >
                  {(isSyncing || syncing) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Test Sync (Last 10)
                </Button>

                <Button
                  onClick={handleSyncNewMeetings}
                  disabled={isSyncing || syncing}
                  className="gap-2"
                  size="sm"
                >
                  {(isSyncing || syncing) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Sync New Meetings
                </Button>

                <Button
                  onClick={() => setShowSyncModal(true)}
                  disabled={isSyncing || syncing}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Custom Sync Range
                </Button>

                <Button
                  onClick={() => handleReprocessPending('diagnose')}
                  disabled={reprocessing}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  {reprocessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {reprocessing ? 'Checking...' : 'Reprocess Pending'}
                </Button>

                <Button
                  onClick={handleRunAiAnalysis}
                  disabled={runningAiAnalysis}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  {runningAiAnalysis ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BrainCircuit className="h-4 w-4" />
                  )}
                  {runningAiAnalysis ? 'Analyzing...' : 'Run AI Analysis'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>

        {isConnected && (
          <CardFooter className="border-t border-gray-200 dark:border-slate-700 pt-4">
            <Button 
              variant="destructive" 
              onClick={() => setShowDisconnectDialog(true)} 
              size="sm"
              className="gap-2"
              disabled={!canManage}
            >
              <XCircle className="h-4 w-4" />
              {canManage ? 'Disconnect Fathom' : 'Disconnect (Admin only)'}
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Fathom Integration</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect your Fathom account? This will stop automatic meeting syncing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-start space-x-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start space-x-2 flex-1">
                <input
                  type="checkbox"
                  id="deleteMeetings"
                  checked={deleteSyncedMeetings}
                  onChange={(e) => setDeleteSyncedMeetings(e.target.checked)}
                  className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                />
                <label htmlFor="deleteMeetings" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <span className="font-medium">Also delete all synced meeting data</span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    This will permanently delete all meetings that were synced from Fathom. This action cannot be undone.
                  </p>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDisconnectDialog(false);
                setDeleteSyncedMeetings(false);
              }}
              disabled={disconnecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setDisconnecting(true);
                try {
                  await disconnectFathom(deleteSyncedMeetings);
                  toast.success(
                    deleteSyncedMeetings
                      ? 'Fathom disconnected and synced meetings deleted'
                      : 'Fathom disconnected successfully'
                  );
                  setShowDisconnectDialog(false);
                  setDeleteSyncedMeetings(false);
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Failed to disconnect Fathom';
                  toast.error(message);
                  console.error('[FathomSettings] Disconnect error:', error);
                } finally {
                  setDisconnecting(false);
                }
              }}
              disabled={disconnecting || !canManage}
              className="gap-2"
            >
              {disconnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Disconnect
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Modal */}
      <Dialog open={showSyncModal} onOpenChange={setShowSyncModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom Sync Configuration</DialogTitle>
            <DialogDescription>
              Choose a sync type and date range to pull meetings from Fathom
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sync-type">Sync Type</Label>
              <Select value={syncType} onValueChange={(value: any) => setSyncType(value)}>
                <SelectTrigger id="sync-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (Last 30 days)</SelectItem>
                  <SelectItem value="incremental">Incremental (Last 24 hours)</SelectItem>
                  <SelectItem value="all_time">All Time (Complete history)</SelectItem>
                  <SelectItem value="initial">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {syncType === 'initial' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={dateRange.start || ''}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={dateRange.end || ''}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  />
                </div>
              </>
            )}

            <Alert>
              <AlertDescription className="text-xs">
                {syncType === 'manual' && 'Syncs meetings from the last 30 days'}
                {syncType === 'incremental' && 'Syncs new/updated meetings from the last 24 hours'}
                {syncType === 'all_time' && 'Syncs all meetings from your entire Fathom history. This may take several minutes.'}
                {syncType === 'initial' && 'Syncs all meetings within the specified date range'}
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSyncModal(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSync} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              Start Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprocess Pending Modal */}
      <Dialog open={showReprocessModal} onOpenChange={setShowReprocessModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {reprocessResult?.mode === 'diagnose' ? 'Pending Meetings' : 'Reprocess Results'}
            </DialogTitle>
            <DialogDescription>
              {reprocessResult?.mode === 'diagnose'
                ? 'Review meetings that need processing'
                : 'Summary of processed meetings'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Diagnose Mode Summary */}
            {reprocessResult?.mode === 'diagnose' && reprocessResult.result && (
              <>
                {/* Status Summary */}
                {(() => {
                  // Calculate unique meeting count (backend may return duplicates)
                  const uniqueMeetings = reprocessResult.result.meetings
                    ? new Set(reprocessResult.result.meetings.map((m: any) => m.id)).size
                    : reprocessResult.result.total_pending;
                  return (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Total Pending</div>
                    <div className="text-xl font-semibold text-gray-900 dark:text-white">
                      {uniqueMeetings}
                    </div>
                  </div>
                  {reprocessResult.result.short_meetings_count > 0 && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <div className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Short Meetings
                      </div>
                      <div className="text-xl font-semibold text-amber-700 dark:text-amber-300">
                        {reprocessResult.result.short_meetings_count}
                      </div>
                    </div>
                  )}
                </div>
                  );
                })()}

                {/* Status Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Status Breakdown</h4>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    {reprocessResult.result.by_status.transcript_pending > 0 && (
                      <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                        {reprocessResult.result.by_status.transcript_pending} transcripts pending
                      </div>
                    )}
                    {reprocessResult.result.by_status.transcript_failed > 0 && (
                      <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                        {reprocessResult.result.by_status.transcript_failed} transcripts failed
                      </div>
                    )}
                    {reprocessResult.result.by_status.transcript_too_short > 0 && (
                      <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
                        {reprocessResult.result.by_status.transcript_too_short} too short
                      </div>
                    )}
                    {reprocessResult.result.by_status.summary_pending > 0 && (
                      <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                        {reprocessResult.result.by_status.summary_pending} summaries pending
                      </div>
                    )}
                    {reprocessResult.result.by_status.thumbnail_pending > 0 && (
                      <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                        {reprocessResult.result.by_status.thumbnail_pending} thumbnails pending
                      </div>
                    )}
                  </div>
                </div>

                {/* Meeting List */}
                {reprocessResult.result.meetings?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Meetings</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {/* Deduplicate meetings by ID */}
                      {Array.from(
                        new Map(reprocessResult.result.meetings.map((m: any) => [m.id, m])).values()
                      ).map((meeting: any) => (
                        <div
                          key={meeting.id}
                          className={`p-3 rounded-lg border ${
                            meeting.is_short_meeting
                              ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 dark:text-white text-sm">
                                {meeting.title}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {new Date(meeting.meeting_start).toLocaleString()}
                                {meeting.duration_seconds !== null && (
                                  <span className="ml-2">
                                    ({formatDuration(meeting.duration_seconds)})
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {meeting.is_short_meeting && (
                                <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Short
                                </Badge>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRetryMeeting(meeting.id, meeting.title)}
                                disabled={retryingMeetingId === meeting.id || reprocessing}
                                className="h-7 px-2 text-xs"
                              >
                                {retryingMeetingId === meeting.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Process
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                          {meeting.short_meeting_reason && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {meeting.short_meeting_reason}
                            </p>
                          )}
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {!meeting.has_transcript && !meeting.is_short_meeting && (
                              <Badge variant="secondary" className="text-xs">No transcript</Badge>
                            )}
                            {!meeting.has_summary && !meeting.is_short_meeting && (
                              <Badge variant="secondary" className="text-xs">No summary</Badge>
                            )}
                            {!meeting.has_thumbnail && (
                              <Badge variant="secondary" className="text-xs">No thumbnail</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Reprocess Mode Results */}
            {reprocessResult?.mode === 'reprocess' && (
              <>
                {/* Live Progress Indicator */}
                {processingProgress && (
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                          Processing {processingProgress.current} of {processingProgress.total}
                        </span>
                      </div>
                      <span className="text-sm text-blue-600 dark:text-blue-400">
                        {Math.round((processingProgress.current / processingProgress.total) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mb-2">
                      <div
                        className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(processingProgress.current / processingProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                      Current: {processingProgress.currentMeeting}
                    </p>
                  </div>
                )}

                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-center">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Processed</div>
                    <div className="text-xl font-semibold text-gray-900 dark:text-white">
                      {reprocessResult.total_processed || 0}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-center">
                    <div className="text-sm text-green-600 dark:text-green-400">Successful</div>
                    <div className="text-xl font-semibold text-green-700 dark:text-green-300">
                      {reprocessResult.successful || 0}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-center">
                    <div className="text-sm text-red-600 dark:text-red-400">Issues</div>
                    <div className="text-xl font-semibold text-red-700 dark:text-red-300">
                      {reprocessResult.failed || 0}
                    </div>
                  </div>
                </div>

                {/* Results List */}
                {reprocessResult.results && reprocessResult.results.length > 0 && (
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {reprocessResult.results.map((result: any) => {
                      const isExpanded = expandedMeetings.has(result.meeting_id);
                      const hasErrors = (result.transcript && !result.transcript.success && !result.transcript.skipped) ||
                                       (result.summary && !result.summary.success && !result.summary.skipped) ||
                                       (result.thumbnail && !result.thumbnail.success) ||
                                       result.error;

                      return (
                        <div
                          key={result.meeting_id}
                          className={`p-3 rounded-lg border ${
                            result.is_short_meeting
                              ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                              : hasErrors
                              ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 dark:text-white text-sm flex items-center gap-2">
                                {result.title}
                                {result.is_short_meeting && (
                                  <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {formatDuration(result.duration_seconds)}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleMeetingExpanded(result.meeting_id)}
                                className="h-7 px-2 text-xs"
                              >
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRetryMeeting(result.meeting_id, result.title)}
                                disabled={retryingMeetingId === result.meeting_id || (reprocessing && processingProgress !== null)}
                                className="h-7 px-2 text-xs"
                              >
                                {retryingMeetingId === result.meeting_id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><RefreshCw className="h-3 w-3 mr-1" />Retry</>
                                )}
                              </Button>
                            </div>
                          </div>
                          {result.short_meeting_reason && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {result.short_meeting_reason}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 text-xs">
                            {result.transcript && (
                              <span className={`px-2 py-0.5 rounded ${
                                result.transcript.success ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : result.transcript.skipped ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              }`}>
                                {result.transcript.success ? '✓' : result.transcript.skipped ? '⏭' : '✗'} Transcript
                              </span>
                            )}
                            {result.summary && (
                              <span className={`px-2 py-0.5 rounded ${
                                result.summary.success ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : result.summary.skipped ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              }`}>
                                {result.summary.success ? '✓' : result.summary.skipped ? '⏭' : '✗'} Summary
                              </span>
                            )}
                            {result.thumbnail && (
                              <span className={`px-2 py-0.5 rounded ${
                                result.thumbnail.success ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              }`}>
                                {result.thumbnail.success ? '✓' : '✗'} Thumbnail
                              </span>
                            )}
                            {result.ai_index && (
                              <span className={`px-2 py-0.5 rounded ${
                                result.ai_index.success ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : 'bg-gray-100 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400'
                              }`}>
                                {result.ai_index.success ? '✓' : '○'} AI Index
                              </span>
                            )}
                          </div>
                          {/* Expandable Details */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2 text-xs">
                              {result.transcript && (
                                <div className={`p-2 rounded ${result.transcript.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                                  <div className="font-medium text-gray-700 dark:text-gray-300">Transcript:</div>
                                  <div className="text-gray-600 dark:text-gray-400">{result.transcript.message}</div>
                                </div>
                              )}
                              {result.summary && (
                                <div className={`p-2 rounded ${result.summary.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                                  <div className="font-medium text-gray-700 dark:text-gray-300">Summary:</div>
                                  <div className="text-gray-600 dark:text-gray-400">{result.summary.message}</div>
                                </div>
                              )}
                              {result.thumbnail && (
                                <div className={`p-2 rounded ${result.thumbnail.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                                  <div className="font-medium text-gray-700 dark:text-gray-300">Thumbnail:</div>
                                  <div className="text-gray-600 dark:text-gray-400">{result.thumbnail.message}</div>
                                </div>
                              )}
                              {result.ai_index && (
                                <div className={`p-2 rounded ${result.ai_index.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-800'}`}>
                                  <div className="font-medium text-gray-700 dark:text-gray-300">AI Index:</div>
                                  <div className="text-gray-600 dark:text-gray-400">{result.ai_index.message}</div>
                                </div>
                              )}
                              {result.error && (
                                <div className="p-2 rounded bg-red-50 dark:bg-red-900/20">
                                  <div className="font-medium text-red-700 dark:text-red-300">Error:</div>
                                  <div className="text-red-600 dark:text-red-400">{result.error}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReprocessModal(false)}
              disabled={reprocessing && processingProgress !== null}
            >
              {reprocessing && processingProgress ? 'Processing...' : 'Close'}
            </Button>
            {reprocessResult?.mode === 'diagnose' && reprocessResult.result?.meetings?.length > 0 && (
              <Button
                onClick={() => handleReprocessPending('reprocess')}
                disabled={reprocessing}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {reprocessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {processingProgress ? `${processingProgress.current}/${processingProgress.total}...` : 'Starting...'}
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Reprocess All ({new Set(reprocessResult.result.meetings.map((m: any) => m.id)).size})
                  </>
                )}
              </Button>
            )}
            {reprocessResult?.mode === 'reprocess' && !reprocessing && reprocessResult.failed > 0 && (
              <Button
                onClick={() => {
                  const failedIds = reprocessResult.results
                    ?.filter((r: any) => !r.transcript?.success && !r.transcript?.skipped)
                    .map((r: any) => r.meeting_id) || [];
                  if (failedIds.length > 0) handleReprocessPending('reprocess', failedIds);
                }}
                variant="outline"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Failed ({reprocessResult.failed})
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
