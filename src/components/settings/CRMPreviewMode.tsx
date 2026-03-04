/**
 * CRMPreviewMode — CRM-CFG-005
 *
 * Shows what field updates the AI *would* apply from a given meeting transcript
 * without actually writing to the CRM. Calls agent-crm-update with dry_run=true.
 *
 * Light + dark mode. Lucide icons only. Toast errors.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Eye,
  Loader2,
  Zap,
  ShieldAlert,
  Ban,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface PreviewField {
  field: string;
  label: string;
  extracted_value: string;
  confidence: number; // 0-100
  mode: 'auto' | 'approve' | 'never';
  reason?: string;
}

interface PreviewResult {
  deal_id?: string | null;
  auto_apply: PreviewField[];
  require_approval: PreviewField[];
  skipped: PreviewField[];
  dry_run: true;
}

const CRM_OBJECTS = [
  { value: 'deal', label: 'Deal' },
  { value: 'contact', label: 'Contact' },
  { value: 'company', label: 'Company' },
];

// =============================================================================
// Helpers
// =============================================================================

function confidenceColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function confidenceBg(score: number): string {
  if (score >= 80) return 'bg-emerald-100 dark:bg-emerald-900/30';
  if (score >= 50) return 'bg-amber-100 dark:bg-amber-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

// =============================================================================
// FieldPreviewRow
// =============================================================================

function FieldPreviewRow({ field }: { field: PreviewField }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg bg-gray-50/80 dark:bg-gray-900/20">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {field.label || field.field}
          </span>
          <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{field.field}</span>
        </div>
        <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 break-words">
          {field.extracted_value}
        </div>
        {field.reason && (
          <div className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500 italic">
            {field.reason}
          </div>
        )}
      </div>
      <Badge
        className={cn(
          'text-xs border-0 shrink-0 tabular-nums',
          confidenceBg(field.confidence),
          confidenceColor(field.confidence)
        )}
      >
        {field.confidence}%
      </Badge>
    </div>
  );
}

// =============================================================================
// Section block
// =============================================================================

interface SectionProps {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  fields: PreviewField[];
  defaultExpanded?: boolean;
}

function PreviewSection({ title, description, icon: Icon, iconColor, fields, defaultExpanded = true }: SectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (fields.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        className="flex items-center gap-2 w-full text-left py-1"
        onClick={() => setExpanded((v) => !v)}
      >
        <Icon className={cn('w-4 h-4 shrink-0', iconColor)} />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-1">
          {title}
          <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
            ({fields.length} field{fields.length !== 1 ? 's' : ''})
          </span>
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">{description}</span>
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="space-y-1.5 pl-6">
          {fields.map((f) => (
            <FieldPreviewRow key={f.field} field={f} />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CRMPreviewMode (main)
// =============================================================================

export function CRMPreviewMode() {
  const orgId = useActiveOrgId();
  const [crmObject, setCrmObject] = useState<string>('deal');
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);

  async function handlePreview() {
    if (!orgId || !transcript.trim()) {
      toast.error('Paste a transcript to preview');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('agent-crm-update', {
        body: {
          org_id: orgId,
          crm_object: crmObject,
          transcript: transcript.trim(),
          dry_run: true,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Preview failed');

      setResult(data as PreviewResult);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Preview failed: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  const totalFields =
    (result?.auto_apply.length ?? 0) +
    (result?.require_approval.length ?? 0) +
    (result?.skipped.length ?? 0);

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-violet-500" />
          <div>
            <CardTitle className="text-base">Preview Mode</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Paste a transcript to see what the AI would update — without writing to the CRM
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={crmObject} onValueChange={setCrmObject}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRM_OBJECTS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            className="h-8"
            onClick={handlePreview}
            disabled={loading || !transcript.trim()}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="ml-1.5">{loading ? 'Analysing...' : 'Run Preview'}</span>
          </Button>
        </div>

        {/* Transcript input */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Meeting transcript
          </label>
          <Textarea
            placeholder="Paste a meeting transcript here…"
            className="min-h-[120px] text-xs font-mono resize-y bg-gray-50 dark:bg-gray-900/30"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
            {/* Summary */}
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                {totalFields} field{totalFields !== 1 ? 's' : ''} extracted
              </span>
              {result.auto_apply.length > 0 && (
                <Badge className="border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {result.auto_apply.length} auto-apply
                </Badge>
              )}
              {result.require_approval.length > 0 && (
                <Badge className="border-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {result.require_approval.length} approval required
                </Badge>
              )}
              {result.skipped.length > 0 && (
                <Badge className="border-0 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {result.skipped.length} skipped
                </Badge>
              )}
              <Badge className="border-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                Dry run — nothing written
              </Badge>
            </div>

            <div className="space-y-3">
              <PreviewSection
                title="Would auto-apply"
                description="Written immediately above confidence threshold"
                icon={Zap}
                iconColor="text-emerald-500"
                fields={result.auto_apply}
                defaultExpanded={true}
              />
              <PreviewSection
                title="Would require approval"
                description="Flagged for human review before writing"
                icon={ShieldAlert}
                iconColor="text-blue-500"
                fields={result.require_approval}
                defaultExpanded={true}
              />
              <PreviewSection
                title="Skipped (mode = never)"
                description="Configured to never update"
                icon={Ban}
                iconColor="text-gray-400"
                fields={result.skipped}
                defaultExpanded={false}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
