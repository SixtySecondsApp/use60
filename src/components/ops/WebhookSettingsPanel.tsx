import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Zap,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  Activity,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useWebhookConfig,
  useGenerateApiKey,
  useUpdateWebhookConfig,
} from '@/lib/hooks/useWebhookSettings';
import { WebhookSetupInstructions } from './WebhookSetupInstructions';
import { WebhookTestConsole } from './WebhookTestConsole';
import { WebhookActivityLog } from './WebhookActivityLog';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WebhookSettingsPanelProps {
  tableId: string;
  tableName: string;
  columns?: Array<{ key: string; label: string; column_type: string }>;
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copied to clipboard`);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WebhookSettingsPanel({
  tableId,
  tableName,
  columns = [],
  open,
  onClose,
}: WebhookSettingsPanelProps) {
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ops-table-inbound-webhook`;

  const { data: config, isLoading } = useWebhookConfig(tableId);
  const generateApiKey = useGenerateApiKey();
  // logs rendered by WebhookActivityLog component — not fetched here
  const updateConfig = useUpdateWebhookConfig();

  // Revealed full key (shown once after generation, then cleared)
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showRevealedKey, setShowRevealedKey] = useState(false);
  const [testConsoleOpen, setTestConsoleOpen] = useState(false);

  function handleToggleEnabled(enabled: boolean) {
    if (!config) return;
    updateConfig.mutate(
      { webhookId: config.id, tableId, updates: { is_enabled: enabled } },
      {
        onError: () => toast.error('Failed to update webhook settings'),
      }
    );
  }

  function handleToggleAutoCreate(enabled: boolean) {
    if (!config) return;
    updateConfig.mutate(
      { webhookId: config.id, tableId, updates: { auto_create_columns: enabled } },
      {
        onError: () => toast.error('Failed to update auto-create columns setting'),
      }
    );
  }

  async function handleGenerateApiKey() {
    try {
      const result = await generateApiKey.mutateAsync({ tableId });
      setRevealedKey(result.fullKey);
      setShowRevealedKey(true);
      toast.success('New API key generated');
    } catch {
      toast.error('Failed to generate API key');
    }
  }

  const maskedKey = config?.displayKey ?? null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="!top-16 !h-[calc(100vh-4rem)] overflow-y-auto w-[480px] max-w-full bg-gray-950 border-l border-gray-800 p-0"
      >
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-gray-100">API &amp; Webhooks</span>
            <span className="text-xs text-gray-500 ml-1 truncate max-w-[140px]">{tableName}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
            Loading…
          </div>
        ) : (
          <div className="px-6 py-5 space-y-6">

            {/* ---- Enabled toggle ---- */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">Webhook enabled</p>
                <p className="text-xs text-gray-500 mt-0.5">Accept inbound data from external sources</p>
              </div>
              <button
                role="switch"
                aria-checked={config?.is_enabled ?? false}
                onClick={() => handleToggleEnabled(!(config?.is_enabled ?? false))}
                disabled={!config || updateConfig.isPending}
                className={`
                  relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                  transition-colors duration-200 ease-in-out focus:outline-none
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${(config?.is_enabled ?? false) ? 'bg-violet-500' : 'bg-gray-700'}
                `}
              >
                <span
                  className={`
                    pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
                    transition duration-200 ease-in-out
                    ${(config?.is_enabled ?? false) ? 'translate-x-4' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>

            {/* ---- INBOUND section ---- */}
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Inbound</p>

              {/* Webhook URL */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">Webhook URL</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={webhookUrl}
                    className="flex-1 min-w-0 rounded-md bg-gray-800 border border-gray-700 px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-7 px-2 border-gray-700 text-gray-400 hover:text-gray-200"
                    onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">API Key</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={maskedKey ?? '(not generated)'}
                    className="flex-1 min-w-0 rounded-md bg-gray-800 border border-gray-700 px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none"
                  />
                  {maskedKey && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-7 px-2 border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={revealedKey ? 'Copy full key' : 'Regenerate key to copy full value'}
                      disabled={!revealedKey}
                      onClick={() => revealedKey && copyToClipboard(revealedKey, 'API Key')}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 h-7 px-2 border-gray-700 text-gray-400 hover:text-amber-400"
                        disabled={generateApiKey.isPending}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${generateApiKey.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-gray-900 border-gray-700">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-gray-100">Regenerate API key?</AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-400">
                          A new key will be generated. Your existing key will continue working for 24 hours, giving you time to update any integrations.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-gray-700 text-gray-300 hover:bg-gray-800">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleGenerateApiKey}
                          className="bg-amber-600 hover:bg-amber-500 text-white"
                        >
                          Regenerate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Revealed key — shown once after generation */}
                {revealedKey && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                    <p className="text-xs font-medium text-amber-300">
                      Save this key — it won't be shown again
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-amber-200 font-mono break-all select-all">
                        {showRevealedKey ? revealedKey : '•'.repeat(Math.min(revealedKey.length, 40))}
                      </code>
                      <button
                        onClick={() => setShowRevealedKey((v) => !v)}
                        className="text-amber-400 hover:text-amber-200 shrink-0"
                      >
                        {showRevealedKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => copyToClipboard(revealedKey, 'Full API key')}
                        className="text-amber-400 hover:text-amber-200 shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => setRevealedKey(null)}
                      className="text-[10px] text-amber-500/70 hover:text-amber-400 underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              {/* Auto-create columns — only shown before first call */}
              {config && !config.first_call_received_at && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-300">Auto-create columns</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Automatically add new columns from incoming payload keys
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={config.auto_create_columns}
                    onClick={() => handleToggleAutoCreate(!config.auto_create_columns)}
                    disabled={updateConfig.isPending}
                    className={`
                      relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                      transition-colors duration-200 ease-in-out focus:outline-none
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${config.auto_create_columns ? 'bg-violet-500' : 'bg-gray-700'}
                    `}
                  >
                    <span
                      className={`
                        pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
                        transition duration-200 ease-in-out
                        ${config.auto_create_columns ? 'translate-x-4' : 'translate-x-0'}
                      `}
                    />
                  </button>
                </div>
              )}

              {/* Setup Instructions */}
              <WebhookSetupInstructions
                webhookUrl={webhookUrl}
                apiKey={maskedKey ?? '(not generated)'}
                columns={columns}
              />

              {/* Test Webhook */}
              <Button
                size="sm"
                variant="outline"
                className="w-full border-gray-700 text-gray-400 hover:text-gray-200"
                onClick={() => setTestConsoleOpen(true)}
              >
                Test Webhook
              </Button>
              <WebhookTestConsole
                tableId={tableId}
                webhookUrl={webhookUrl}
                apiKey={maskedKey ?? ''}
                apiKeyFull={revealedKey ?? undefined}
                columns={columns}
                open={testConsoleOpen}
                onClose={() => setTestConsoleOpen(false)}
              />
            </div>

            {/* ---- OUTBOUND section ---- */}
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Outbound</p>
              <p className="text-xs text-gray-500">
                No outbound webhook rules configured for this table.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full border-gray-700 text-gray-500 cursor-not-allowed"
                disabled
                title="Coming soon"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Webhook Rule
              </Button>
            </div>

            {/* ---- Recent Activity ---- */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                <Activity className="w-3.5 h-3.5" />
                Recent Activity
              </div>
              <WebhookActivityLog
                webhookId={config?.id ?? null}
                onRetry={(log) => {
                  // Pre-fill test console with the failed payload
                  setTestConsoleOpen(true);
                }}
              />
            </div>

          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default WebhookSettingsPanel;
