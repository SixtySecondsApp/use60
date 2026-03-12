/**
 * CreditMenuAdmin — Platform Admin page for managing credit_menu pricing.
 *
 * Allows platform admins to view, edit, activate, deactivate, and create
 * credit menu entries. Includes inline price editing with >50% change
 * confirmation, per-row history sheet, and a create dialog.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Coins,
  Plus,
  Check,
  X,
  History,
  Loader2,
  AlertCircle,
  RefreshCw,
  Pencil,
  Search,
  Download,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import {
  adminCreditMenuService,
  type CreditMenuEntry,
  type CreditMenuHistoryEntry,
  type NewCreditMenuEntry,
  type CreditMenuUpdatePayload,
} from '@/lib/services/adminCreditMenuService';

// ============================================================================
// Constants
// ============================================================================

const CATEGORIES = ['ai_actions', 'agents', 'integrations', 'enrichment', 'storage'] as const;
type CreditCategory = typeof CATEGORIES[number];

const PRICE_CHANGE_THRESHOLD = 0.5; // 50%

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function pctChange(oldVal: number, newVal: number): number {
  if (oldVal === 0) return newVal === 0 ? 0 : Infinity;
  return Math.abs((newVal - oldVal) / oldVal);
}

// ============================================================================
// CSV Helpers
// ============================================================================

const CSV_COLUMNS = [
  'action_id', 'display_name', 'description', 'category', 'unit',
  'cost_low', 'cost_medium', 'cost_high', 'is_active', 'free_with_sub', 'is_flat_rate',
] as const;

function escapeCsvField(value: string | number | boolean | null): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function entriesToCsv(entries: CreditMenuEntry[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = entries.map((e) =>
    CSV_COLUMNS.map((col) => escapeCsvField(e[col as keyof CreditMenuEntry])).join(',')
  );
  return [header, ...rows].join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

interface CsvDiffRow {
  actionId: string;
  isNew: boolean;
  changes: { field: string; oldVal: string; newVal: string }[];
  parsed: Record<string, string>;
}

function parseCsvUpload(
  csvText: string,
  existing: CreditMenuEntry[]
): { rows: CsvDiffRow[]; errors: string[] } {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], errors: ['CSV must have a header row and at least one data row.'] };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const actionIdIdx = headers.indexOf('action_id');
  if (actionIdIdx === -1) return { rows: [], errors: ['CSV must have an "action_id" column.'] };

  const errors: string[] = [];
  const existingMap = new Map(existing.map((e) => [e.action_id, e]));
  const diffRows: CsvDiffRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCsvLine(line);
    const parsed: Record<string, string> = {};
    headers.forEach((h, idx) => { parsed[h] = (fields[idx] ?? '').trim(); });

    const actionId = parsed.action_id;
    if (!actionId) {
      errors.push(`Row ${i + 1}: missing action_id`);
      continue;
    }

    const existingEntry = existingMap.get(actionId);
    if (existingEntry) {
      // Diff existing entry — only flag as changed if pricing columns differ
      const PRICE_FIELDS = ['cost_low', 'cost_medium', 'cost_high'];
      const changes: CsvDiffRow['changes'] = [];
      for (const col of PRICE_FIELDS) {
        if (!(col in parsed)) continue;
        const oldNum = Number(existingEntry[col as keyof CreditMenuEntry] ?? 0);
        const newNum = parseFloat(parsed[col]) || 0;
        if (oldNum !== newNum) {
          changes.push({ field: col, oldVal: String(oldNum), newVal: String(newNum) });
        }
      }
      if (changes.length > 0) {
        diffRows.push({ actionId, isNew: false, changes, parsed });
      }
    } else {
      // New row
      const changes = CSV_COLUMNS
        .filter((c) => c !== 'action_id' && c in parsed)
        .map((c) => ({ field: c, oldVal: '', newVal: parsed[c] }));
      diffRows.push({ actionId, isNew: true, changes, parsed });
    }
  }

  return { rows: diffRows, errors };
}

// ============================================================================
// CSV Upload Preview Dialog
// ============================================================================

interface CsvUploadDialogProps {
  open: boolean;
  onClose: () => void;
  diffRows: CsvDiffRow[];
  existingEntries: CreditMenuEntry[];
  parseErrors: string[];
  onConfirm: (approvedRows: CsvDiffRow[]) => void;
  applying: boolean;
}

/** Render a cell value, highlighting if it changed */
function CsvCell({
  field,
  currentVal,
  diff,
}: {
  field: string;
  currentVal: string;
  diff: CsvDiffRow | undefined;
}) {
  const change = diff?.changes.find((c) => c.field === field);
  if (!change) {
    return <span className="text-sm">{currentVal}</span>;
  }
  return (
    <span className="text-sm">
      <span className="line-through text-red-500 dark:text-red-400 mr-1">{change.oldVal}</span>
      <span className="text-green-600 dark:text-green-400 font-medium">{change.newVal}</span>
    </span>
  );
}

function CsvUploadDialog({
  open,
  onClose,
  diffRows,
  existingEntries,
  parseErrors,
  onConfirm,
  applying,
}: CsvUploadDialogProps) {
  const [approved, setApproved] = useState<Record<string, boolean>>({});

  // Reset approvals when dialog opens with new data
  useEffect(() => {
    if (open) {
      const initial: Record<string, boolean> = {};
      diffRows.forEach((r) => { initial[r.actionId] = true; });
      setApproved(initial);
    }
  }, [open, diffRows]);

  const diffMap = new Map(diffRows.map((r) => [r.actionId, r]));
  const changedIds = new Set(diffRows.map((r) => r.actionId));
  const newRows = diffRows.filter((r) => r.isNew);

  // Build full row list: existing entries + new rows from CSV
  const allRows: { actionId: string; displayName: string; category: string; unit: string; costLow: string; costMed: string; costHigh: string; isNew: boolean; hasChanges: boolean }[] = [];

  for (const entry of existingEntries) {
    const diff = diffMap.get(entry.action_id);
    allRows.push({
      actionId: entry.action_id,
      displayName: String(entry.display_name),
      category: String(entry.category),
      unit: String(entry.unit),
      costLow: String(entry.cost_low),
      costMed: String(entry.cost_medium),
      costHigh: String(entry.cost_high),
      isNew: false,
      hasChanges: !!diff,
    });
  }

  for (const row of newRows) {
    allRows.push({
      actionId: row.actionId,
      displayName: row.parsed.display_name || row.actionId,
      category: row.parsed.category || '',
      unit: row.parsed.unit || '',
      costLow: row.parsed.cost_low || '0',
      costMed: row.parsed.cost_medium || '0',
      costHigh: row.parsed.cost_high || '0',
      isNew: true,
      hasChanges: true,
    });
  }

  const approvedCount = Object.values(approved).filter(Boolean).length;
  const allApproved = diffRows.length > 0 && approvedCount === diffRows.length;

  const toggleAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    diffRows.forEach((r) => { next[r.actionId] = value; });
    setApproved(next);
  };

  const handleConfirm = () => {
    const approvedRows = diffRows.filter((r) => approved[r.actionId]);
    onConfirm(approvedRows);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>CSV Upload Preview</DialogTitle>
            {diffRows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleAll(!allApproved)}
                className="mr-6"
              >
                {allApproved ? 'Reject All' : 'Approve All'}
              </Button>
            )}
          </div>
          {diffRows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {approvedCount} of {diffRows.length} change{diffRows.length !== 1 ? 's' : ''} approved
              {newRows.length > 0 && ` (${newRows.length} new)`}
            </p>
          )}
        </DialogHeader>

        {parseErrors.length > 0 && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive space-y-1">
            {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}

        {diffRows.length === 0 && parseErrors.length === 0 && (
          <p className="text-muted-foreground text-sm py-4">No changes detected. All rows match the current data.</p>
        )}

        <div className="overflow-auto flex-1 border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center sticky left-0 bg-background">Y/N</TableHead>
                <TableHead>Action ID</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Low</TableHead>
                <TableHead className="text-right">Med</TableHead>
                <TableHead className="text-right">High</TableHead>
                <TableHead className="w-16 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allRows.map((row) => {
                const diff = diffMap.get(row.actionId);
                const isChanged = row.hasChanges;
                const isApproved = approved[row.actionId];

                return (
                  <TableRow
                    key={row.actionId}
                    className={cn(
                      !isChanged && 'opacity-50',
                      isChanged && !isApproved && 'opacity-40',
                      isChanged && isApproved && row.isNew && 'bg-blue-50/50 dark:bg-blue-950/20',
                      isChanged && isApproved && !row.isNew && 'bg-amber-50/50 dark:bg-amber-950/20',
                    )}
                  >
                    <TableCell className="text-center sticky left-0 bg-inherit">
                      {isChanged ? (
                        <button
                          onClick={() => setApproved((prev) => ({ ...prev, [row.actionId]: !prev[row.actionId] }))}
                          className={cn(
                            'inline-flex items-center justify-center h-7 w-7 rounded-md border text-xs font-bold transition-colors',
                            isApproved
                              ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400'
                              : 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400'
                          )}
                        >
                          {isApproved ? 'Y' : 'N'}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{row.actionId}</TableCell>
                    <TableCell>
                      <CsvCell field="display_name" currentVal={row.displayName} diff={diff} />
                    </TableCell>
                    <TableCell>
                      <CsvCell field="category" currentVal={row.category} diff={diff} />
                    </TableCell>
                    <TableCell>
                      <CsvCell field="unit" currentVal={row.unit} diff={diff} />
                    </TableCell>
                    <TableCell className="text-right">
                      <CsvCell field="cost_low" currentVal={row.costLow} diff={diff} />
                    </TableCell>
                    <TableCell className="text-right">
                      <CsvCell field="cost_medium" currentVal={row.costMed} diff={diff} />
                    </TableCell>
                    <TableCell className="text-right">
                      <CsvCell field="cost_high" currentVal={row.costHigh} diff={diff} />
                    </TableCell>
                    <TableCell className="text-center">
                      {row.isNew ? (
                        <Badge variant="outline" className="border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-400 text-xs">
                          NEW
                        </Badge>
                      ) : isChanged ? (
                        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-400 text-xs">
                          CHANGED
                        </Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleConfirm}
            disabled={applying || approvedCount === 0}
          >
            {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply {approvedCount} Change{approvedCount !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Inline Price Cell
// ============================================================================

interface PriceCellProps {
  value: number;
  onSave: (newVal: number) => Promise<void>;
}

function PriceCell({ value, onSave }: PriceCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = async () => {
    const parsed = parseFloat(draft);
    if (isNaN(parsed) || parsed < 0) {
      setDraft(String(value));
      setEditing(false);
      return;
    }
    if (parsed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
    } catch {
      setDraft(String(value));
      toast.error('Failed to save price');
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (saving) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {value}
      </span>
    );
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={0}
        step={0.1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className="h-7 w-20 text-sm px-2"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="hover:underline hover:text-foreground cursor-pointer text-left"
      title="Click to edit"
    >
      {value}
    </button>
  );
}

// ============================================================================
// History Sheet
// ============================================================================

interface HistorySheetProps {
  actionId: string | null;
  open: boolean;
  onClose: () => void;
}

function HistorySheet({ actionId, open, onClose }: HistorySheetProps) {
  const [entries, setEntries] = useState<CreditMenuHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !actionId) return;
    let mounted = true;
    setLoading(true);
    adminCreditMenuService
      .getHistory(actionId)
      .then((data) => { if (mounted) setEntries(data); })
      .catch(() => { if (mounted) toast.error('Failed to load history'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [open, actionId]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[480px] sm:w-[560px] !top-16 !h-[calc(100vh-4rem)] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Price History — {actionId}
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground text-sm mt-6 text-center">No history found.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="border rounded-lg p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      entry.event_type === 'activated'
                        ? 'default'
                        : entry.event_type === 'deactivated'
                        ? 'destructive'
                        : 'secondary'
                    }
                    className="capitalize"
                  >
                    {entry.event_type}
                  </Badge>
                  <span className="text-muted-foreground text-xs">{formatDate(entry.changed_at)}</span>
                </div>
                <p className="text-muted-foreground">By: {entry.changed_by}</p>
                {entry.prev_cost_low !== null && (
                  <div className="grid grid-cols-3 gap-2 text-xs mt-1">
                    <div>
                      <span className="text-muted-foreground">Low: </span>
                      {entry.prev_cost_low} → {entry.new_cost_low}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Med: </span>
                      {entry.prev_cost_medium} → {entry.new_cost_medium}
                    </div>
                    <div>
                      <span className="text-muted-foreground">High: </span>
                      {entry.prev_cost_high} → {entry.new_cost_high}
                    </div>
                  </div>
                )}
                {entry.reason && (
                  <p className="text-xs text-muted-foreground italic">{entry.reason}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Platform Feature Catalog
// ============================================================================

const PLATFORM_FEATURE_CATALOG: Array<NewCreditMenuEntry & { description: string; is_new?: boolean; byok_available?: boolean }> = [
  // ── AI Actions ─────────────────────────────────────────────────────────────
  {
    action_id: 'copilot_chat',
    display_name: 'Copilot Chat',
    description: 'AI-powered conversational assistant for sales queries and CRM actions.',
    category: 'ai_actions',
    unit: 'per message',
    cost_low: 0.1,
    cost_medium: 0.3,
    cost_high: 1.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'meeting_summary',
    display_name: 'Meeting Summary',
    description: 'Automatically generates structured summaries and action items from meeting transcripts.',
    category: 'ai_actions',
    unit: 'per meeting',
    cost_low: 0.3,
    cost_medium: 0.8,
    cost_high: 3.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'content_generation',
    display_name: 'Content Generation',
    description: 'Creates personalised outreach emails, follow-ups, and sales collateral.',
    category: 'ai_actions',
    unit: 'per piece',
    cost_low: 0.2,
    cost_medium: 0.5,
    cost_high: 2.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'daily_briefing',
    display_name: 'Daily Briefing',
    description: 'Compiles a personalised morning brief covering pipeline, tasks, and meeting prep.',
    category: 'ai_actions',
    unit: 'per brief',
    cost_low: 0.2,
    cost_medium: 0.5,
    cost_high: 2.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'deal_risk_score',
    display_name: 'Deal Risk Score',
    description: 'Analyses deal signals and conversation history to produce a risk likelihood score.',
    category: 'ai_actions',
    unit: 'per deal',
    cost_low: 0.3,
    cost_medium: 0.8,
    cost_high: 3.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'weekly_coaching_digest',
    display_name: 'Weekly Coaching Digest',
    description: 'Surfaces call coaching insights and performance trends for the previous week.',
    category: 'ai_actions',
    unit: 'per digest',
    cost_low: 0.5,
    cost_medium: 1.5,
    cost_high: 5.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'pre_meeting_brief',
    display_name: 'Pre-Meeting Brief',
    description: 'Assembles attendee context, recent activity, and talking-point suggestions before a meeting.',
    category: 'ai_actions',
    unit: 'per meeting',
    cost_low: 0.3,
    cost_medium: 1.2,
    cost_high: 5.0,
    free_with_sub: false,
    is_flat_rate: false,
    is_new: true,
  },
  {
    action_id: 'transcript_search',
    display_name: 'Transcript Search & Q&A',
    description: 'Semantic search and natural-language Q&A across all recorded meeting transcripts.',
    category: 'ai_actions',
    unit: 'per query',
    cost_low: 0.2,
    cost_medium: 0.6,
    cost_high: 2.5,
    free_with_sub: false,
    is_flat_rate: false,
    is_new: true,
  },
  {
    action_id: 'deal_proposal',
    display_name: 'Deal Proposal Generation',
    description: 'Drafts a tailored deal proposal document based on CRM data and meeting context.',
    category: 'ai_actions',
    unit: 'per proposal',
    cost_low: 1.0,
    cost_medium: 2.5,
    cost_high: 8.0,
    free_with_sub: false,
    is_flat_rate: false,
    is_new: true,
  },
  {
    action_id: 'coaching_analysis',
    display_name: 'Meeting Coaching Analysis',
    description: 'Deep-dives into call recordings to highlight talk-time, objection handling, and filler words.',
    category: 'ai_actions',
    unit: 'per meeting',
    cost_low: 0.5,
    cost_medium: 1.5,
    cost_high: 6.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'deal_intelligence',
    display_name: 'Deal Intelligence Summary',
    description: 'Synthesises all deal activity into a concise intelligence summary for stakeholders.',
    category: 'ai_actions',
    unit: 'per deal',
    cost_low: 0.5,
    cost_medium: 1.2,
    cost_high: 4.5,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'lead_qualification',
    display_name: 'Lead Qualification Score',
    description: 'Evaluates inbound leads against ICP criteria and assigns a qualification score.',
    category: 'ai_actions',
    unit: 'per lead',
    cost_low: 0.3,
    cost_medium: 0.8,
    cost_high: 3.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'competitor_intel',
    display_name: 'Competitor Intelligence',
    description: 'Aggregates competitive mention signals and generates battlecard-style intelligence reports.',
    category: 'ai_actions',
    unit: 'per report',
    cost_low: 0.5,
    cost_medium: 1.5,
    cost_high: 6.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'deal_rescue_plan',
    display_name: 'Deal Rescue Plan',
    description: 'Generates a step-by-step action plan to revive stalled or at-risk deals.',
    category: 'ai_actions',
    unit: 'per plan',
    cost_low: 0.5,
    cost_medium: 1.5,
    cost_high: 5.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  // ── Agents ─────────────────────────────────────────────────────────────────
  {
    action_id: 'task_execution',
    display_name: 'Task Execution',
    description: 'Autonomous agent executes multi-step CRM tasks on behalf of the user.',
    category: 'agents',
    unit: 'per task',
    cost_low: 0.2,
    cost_medium: 0.5,
    cost_high: 2.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'reengagement_trigger',
    display_name: 'Re-engagement Trigger',
    description: 'Autonomously detects lapsed contacts and triggers personalised re-engagement sequences.',
    category: 'agents',
    unit: 'per trigger',
    cost_low: 0.3,
    cost_medium: 0.8,
    cost_high: 3.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'stale_deal_alert',
    display_name: 'Stale Deal Alert',
    description: 'Monitors pipeline for deals with no activity and surfaces timely alerts.',
    category: 'agents',
    unit: 'per alert',
    cost_low: 0.1,
    cost_medium: 0.3,
    cost_high: 1.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'sequence_step_execution',
    display_name: 'Sequence Step Execution',
    description: 'Executes individual steps within automated outreach and nurture sequences.',
    category: 'agents',
    unit: 'per step',
    cost_low: 0.3,
    cost_medium: 0.8,
    cost_high: 3.0,
    free_with_sub: false,
    is_flat_rate: false,
    is_new: true,
  },
  {
    action_id: 'notetaker_bot',
    display_name: 'Meeting Notetaker Bot',
    description: 'Deploys an AI bot to join, record, and transcribe meetings automatically.',
    category: 'agents',
    unit: 'per meeting',
    cost_low: 1.0,
    cost_medium: 2.0,
    cost_high: 5.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  // ── Integrations ───────────────────────────────────────────────────────────
  {
    action_id: 'crm_update',
    display_name: 'CRM Update',
    description: 'Writes structured data back to connected CRM systems after AI analysis.',
    category: 'integrations',
    unit: 'per update',
    cost_low: 0.1,
    cost_medium: 0.1,
    cost_high: 0.1,
    free_with_sub: false,
    is_flat_rate: true,
  },
  {
    action_id: 'email_send',
    display_name: 'Email Send',
    description: 'Sends AI-drafted or template-based emails via connected email providers.',
    category: 'integrations',
    unit: 'per email',
    cost_low: 0.1,
    cost_medium: 0.1,
    cost_high: 0.1,
    free_with_sub: false,
    is_flat_rate: true,
  },
  {
    action_id: 'slack_notification',
    display_name: 'Slack Notification Send',
    description: 'Dispatches pipeline alerts, win/loss notifications, and HITL approvals via Slack.',
    category: 'integrations',
    unit: 'per message',
    cost_low: 0.1,
    cost_medium: 0.1,
    cost_high: 0.1,
    free_with_sub: false,
    is_flat_rate: true,
  },
  {
    action_id: 'hubspot_sync',
    display_name: 'HubSpot Full Sync',
    description: 'Performs a full bi-directional sync of contacts, deals, and activities with HubSpot.',
    category: 'integrations',
    unit: 'per sync',
    cost_low: 0.2,
    cost_medium: 0.2,
    cost_high: 0.2,
    free_with_sub: false,
    is_flat_rate: true,
  },
  // ── Enrichment ─────────────────────────────────────────────────────────────
  {
    action_id: 'research_enrichment',
    display_name: 'Research & Enrichment',
    description: 'Deep-research enrichment that combines multiple data sources for a contact or company.',
    category: 'enrichment',
    unit: 'per contact',
    cost_low: 0.5,
    cost_medium: 1.5,
    cost_high: 5.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  {
    action_id: 'apollo_search',
    display_name: 'Apollo Search',
    description: 'Searches Apollo.io for prospect lists matching defined ICP filters.',
    category: 'enrichment',
    unit: 'per search',
    cost_low: 0.3,
    cost_medium: 0.8,
    cost_high: 3.0,
    free_with_sub: false,
    is_flat_rate: false,
    byok_available: true,
  },
  {
    action_id: 'apollo_enrichment',
    display_name: 'Apollo Enrichment',
    description: 'Enriches contact and company records with verified data from Apollo.io.',
    category: 'enrichment',
    unit: 'per contact',
    cost_low: 0.3,
    cost_medium: 1.0,
    cost_high: 4.0,
    free_with_sub: false,
    is_flat_rate: false,
    byok_available: true,
  },
  {
    action_id: 'ai_ark_company',
    display_name: 'AI Ark Company Lookup',
    description: 'Retrieves firmographic and technographic data for a company from AI Ark.',
    category: 'enrichment',
    unit: 'per lookup',
    cost_low: 0.3,
    cost_medium: 0.8,
    cost_high: 3.0,
    free_with_sub: false,
    is_flat_rate: false,
    byok_available: true,
  },
  {
    action_id: 'ai_ark_people',
    display_name: 'AI Ark People Search',
    description: 'Finds and enriches individual contact profiles using the AI Ark people database.',
    category: 'enrichment',
    unit: 'per search',
    cost_low: 0.3,
    cost_medium: 0.8,
    cost_high: 3.0,
    free_with_sub: false,
    is_flat_rate: false,
    byok_available: true,
  },
  {
    action_id: 'exa_enrichment',
    display_name: 'Exa Web Enrichment',
    description: 'Performs real-time web searches via Exa to enrich contact and company profiles.',
    category: 'enrichment',
    unit: 'per query',
    cost_low: 0.5,
    cost_medium: 1.5,
    cost_high: 5.0,
    free_with_sub: false,
    is_flat_rate: false,
  },
  // ── Storage ────────────────────────────────────────────────────────────────
  {
    action_id: 'call_recording_storage',
    display_name: 'Call Recording Storage',
    description: 'Permanent S3 storage for call recordings, included free with all subscriptions.',
    category: 'storage',
    unit: 'per recording',
    cost_low: 0,
    cost_medium: 0,
    cost_high: 0,
    free_with_sub: true,
    is_flat_rate: false,
  },
];

// ============================================================================
// Add Action Dialog
// ============================================================================

interface AddActionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  existingActionIds: string[];
}

const EMPTY_FORM: Omit<NewCreditMenuEntry, never> = {
  action_id: '',
  display_name: '',
  description: '',
  category: 'ai_actions',
  unit: 'credits',
  cost_low: 0,
  cost_medium: 0,
  cost_high: 0,
  free_with_sub: false,
  is_flat_rate: false,
};

const CATEGORY_FILTER_TABS = [
  { label: 'All', value: 'all' },
  { label: 'AI Actions', value: 'ai_actions' },
  { label: 'Agents', value: 'agents' },
  { label: 'Integrations', value: 'integrations' },
  { label: 'Enrichment', value: 'enrichment' },
  { label: 'Storage', value: 'storage' },
] as const;

const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  ai_actions: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  agents: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  integrations: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  enrichment: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  storage: 'bg-secondary text-secondary-foreground',
};

const CATEGORY_LABELS: Record<string, string> = {
  ai_actions: 'AI Actions',
  agents: 'Agents',
  integrations: 'Integrations',
  enrichment: 'Enrichment',
  storage: 'Storage',
};

function AddActionDialog({ open, onClose, onCreated, existingActionIds }: AddActionDialogProps) {
  const [step, setStep] = useState<'catalog' | 'form'>('catalog');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<NewCreditMenuEntry, never>>(EMPTY_FORM);
  const [catalogFilter, setCatalogFilter] = useState<string>('all');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Reset all state each time the dialog opens
  useEffect(() => {
    if (open) {
      setStep('catalog');
      setForm(EMPTY_FORM);
      setCatalogFilter('all');
      setCatalogSearch('');
    }
  }, [open]);

  const update = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.action_id.trim() || !form.display_name.trim()) {
      toast.error('Action ID and Display Name are required');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(form.action_id)) {
      toast.error('Action ID must be lowercase letters, numbers, and underscores only');
      return;
    }
    setSaving(true);
    try {
      await adminCreditMenuService.create(form);
      toast.success('Credit menu entry created');
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create entry';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredCatalog = PLATFORM_FEATURE_CATALOG.filter(
    (item) =>
      (catalogFilter === 'all' || item.category === catalogFilter) &&
      (item.display_name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        item.description.toLowerCase().includes(catalogSearch.toLowerCase()))
  );

  const handleSelectCatalogItem = (item: typeof PLATFORM_FEATURE_CATALOG[number]) => {
    if (existingActionIds.includes(item.action_id)) return;
    setForm({
      action_id: item.action_id,
      display_name: item.display_name,
      description: item.description,
      category: item.category ?? 'ai_actions',
      unit: item.unit,
      cost_low: item.cost_low,
      cost_medium: item.cost_medium,
      cost_high: item.cost_high,
      free_with_sub: item.free_with_sub,
      is_flat_rate: item.is_flat_rate,
    });
    setStep('form');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          'transition-all',
          step === 'catalog' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'form' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('catalog')}
                className="mr-1 -ml-2 h-7 px-2"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Catalog
              </Button>
            )}
            {step === 'catalog' ? (
              <>
                <Plus className="h-4 w-4" />
                Add Credit Menu Entry
              </>
            ) : (
              form.display_name || 'Custom Action'
            )}
          </DialogTitle>
        </DialogHeader>

        {step === 'catalog' ? (
          <div className="space-y-4 py-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search actions..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Category filter tabs */}
            <div className="flex gap-1 flex-wrap">
              {CATEGORY_FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setCatalogFilter(tab.value)}
                  className={cn(
                    'px-3 py-1 rounded-md text-sm transition-colors',
                    catalogFilter === tab.value
                      ? 'bg-muted font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Catalog grid */}
            <div className="grid grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {filteredCatalog.map((item) => {
                const isAdded = existingActionIds.includes(item.action_id);
                return (
                  <div
                    key={item.action_id}
                    onClick={() => handleSelectCatalogItem(item)}
                    className={cn(
                      'rounded-lg border p-3 transition-colors',
                      isAdded
                        ? 'opacity-50 cursor-not-allowed bg-muted'
                        : 'cursor-pointer hover:border-primary hover:bg-accent'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm leading-snug">{item.display_name}</p>
                      {isAdded && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          Added
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {item.description}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {item.category && (
                        <Badge
                          className={cn(
                            'text-xs',
                            CATEGORY_BADGE_CLASSES[item.category] ?? 'bg-secondary text-secondary-foreground'
                          )}
                        >
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </Badge>
                      )}
                      {item.is_new && (
                        <Badge className="bg-green-100 text-green-700 text-xs">New</Badge>
                      )}
                      {item.free_with_sub && (
                        <Badge variant="outline" className="text-xs">
                          Free w/ Sub
                        </Badge>
                      )}
                      {item.byok_available && (
                        <Badge variant="outline" className="text-xs border-blue-300 text-blue-600 dark:border-blue-600 dark:text-blue-400">
                          Free w/ own key
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Custom action card */}
              <div
                onClick={() => { setForm(EMPTY_FORM); setStep('form'); }}
                className="rounded-lg border border-dashed p-3 cursor-pointer hover:border-primary hover:bg-accent transition-colors flex flex-col items-center justify-center gap-2 min-h-[88px]"
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground font-medium">Custom Action</p>
                <p className="text-xs text-muted-foreground text-center">Define your own action ID and pricing</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="action_id">Action ID *</Label>
                <Input
                  id="action_id"
                  placeholder="e.g. enrich_contact"
                  value={form.action_id}
                  onChange={(e) => update('action_id', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                />
                <p className="text-xs text-muted-foreground">Lowercase, underscores only</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="display_name">Display Name *</Label>
                <Input
                  id="display_name"
                  placeholder="e.g. Contact Enrichment"
                  value={form.display_name}
                  onChange={(e) => update('display_name', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => update('category', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c] ?? c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  placeholder="credits"
                  value={form.unit}
                  onChange={(e) => update('unit', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              {(['cost_low', 'cost_medium', 'cost_high'] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={field}>
                    {field === 'cost_low' ? 'Low' : field === 'cost_medium' ? 'Medium' : 'High'} Price
                  </Label>
                  <Input
                    id={field}
                    type="number"
                    min={0}
                    step={0.1}
                    value={form[field]}
                    placeholder={form.free_with_sub ? 'FREE' : undefined}
                    onChange={(e) => update(field, parseFloat(e.target.value) || 0)}
                    disabled={form.free_with_sub}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="free_with_sub"
                  checked={form.free_with_sub}
                  onCheckedChange={(v) => update('free_with_sub', v)}
                />
                <Label htmlFor="free_with_sub">Free with subscription</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="is_flat_rate"
                  checked={form.is_flat_rate}
                  onCheckedChange={(v) => update('is_flat_rate', v)}
                />
                <Label htmlFor="is_flat_rate">Flat rate</Label>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'catalog' ? (
            <DialogClose asChild>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              </DialogClose>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Draft
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Edit Action Dialog
// ============================================================================

interface EditActionDialogProps {
  entry: CreditMenuEntry | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: CreditMenuEntry) => void;
}

function EditActionDialog({ entry, open, onClose, onSaved }: EditActionDialogProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreditMenuUpdatePayload>({});

  useEffect(() => {
    if (open && entry) {
      setForm({
        display_name: entry.display_name,
        description: entry.description ?? '',
        category: entry.category,
        unit: entry.unit,
        cost_low: entry.cost_low,
        cost_medium: entry.cost_medium,
        cost_high: entry.cost_high,
        free_with_sub: entry.free_with_sub,
        is_flat_rate: entry.is_flat_rate,
      });
    }
  }, [open, entry]);

  const update = <K extends keyof CreditMenuUpdatePayload>(key: K, val: CreditMenuUpdatePayload[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!entry) return;
    if (!form.display_name?.trim()) {
      toast.error('Display Name is required');
      return;
    }
    setSaving(true);
    try {
      const updated = await adminCreditMenuService.update(entry.action_id, form);
      toast.success('Entry updated');
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update entry';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit — {entry.display_name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* action_id read-only */}
          <div className="space-y-1.5">
            <Label>Action ID</Label>
            <p className="text-sm font-mono bg-muted px-3 py-2 rounded-md text-muted-foreground">
              {entry.action_id}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_display_name">Display Name *</Label>
            <Input
              id="edit_display_name"
              value={form.display_name ?? ''}
              onChange={(e) => update('display_name', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category ?? ''} onValueChange={(v) => update('category', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c] ?? c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_unit">Unit</Label>
              <Input
                id="edit_unit"
                value={form.unit ?? ''}
                onChange={(e) => update('unit', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_description">Description</Label>
            <Input
              id="edit_description"
              placeholder="Optional description"
              value={form.description ?? ''}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            {(['cost_low', 'cost_medium', 'cost_high'] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`edit_${field}`}>
                  {field === 'cost_low' ? 'Low' : field === 'cost_medium' ? 'Medium' : 'High'} Price
                </Label>
                <Input
                  id={`edit_${field}`}
                  type="number"
                  min={0}
                  step={0.1}
                  value={form[field] ?? 0}
                  placeholder={form.free_with_sub ? 'FREE' : undefined}
                  onChange={(e) => update(field, parseFloat(e.target.value) || 0)}
                  disabled={!!form.free_with_sub}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="edit_free_with_sub"
                checked={!!form.free_with_sub}
                onCheckedChange={(v) => update('free_with_sub', v)}
              />
              <Label htmlFor="edit_free_with_sub">Free with subscription</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="edit_is_flat_rate"
                checked={!!form.is_flat_rate}
                onCheckedChange={(v) => update('is_flat_rate', v)}
              />
              <Label htmlFor="edit_is_flat_rate">Flat rate</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function CreditMenuAdmin() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();

  const [entries, setEntries] = useState<CreditMenuEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // History sheet state
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);

  // Add dialog
  const [showAdd, setShowAdd] = useState(false);

  // Edit dialog
  const [editEntry, setEditEntry] = useState<CreditMenuEntry | null>(null);

  // Activate/deactivate loading per row
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Pending price-change confirmation — resolve/reject stored in state to avoid stale closure bugs
  const [pendingPriceChange, setPendingPriceChange] = useState<{
    actionId: string;
    field: 'cost_low' | 'cost_medium' | 'cost_high';
    oldVal: number;
    newVal: number;
    pct: number;
    resolve: () => void;
    reject: (reason?: unknown) => void;
  } | null>(null);

  // Pending deactivation confirmation
  const [pendingDeactivate, setPendingDeactivate] = useState<CreditMenuEntry | null>(null);

  // CSV upload state
  const [csvDiffRows, setCsvDiffRows] = useState<CsvDiffRow[]>([]);
  const [csvParseErrors, setCsvParseErrors] = useState<string[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [showCsvDropzone, setShowCsvDropzone] = useState(false);
  const [csvApplying, setCsvApplying] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Mounted ref for async safety
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminCreditMenuService.listAll();
      if (mountedRef.current) setEntries(data);
    } catch {
      if (mountedRef.current) toast.error('Failed to load credit menu');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (isPlatformAdmin) {
      load();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);

  // ── Price editing ─────────────────────────────────────────────────────────

  const handlePriceChange = async (
    entry: CreditMenuEntry,
    field: 'cost_low' | 'cost_medium' | 'cost_high',
    newVal: number
  ) => {
    const oldVal = entry[field];
    const pct = pctChange(oldVal, newVal);

    if (pct > PRICE_CHANGE_THRESHOLD) {
      // Store resolve/reject directly in state to avoid stale closure bugs
      return new Promise<void>((resolve, reject) => {
        setPendingPriceChange({
          actionId: entry.action_id,
          field,
          oldVal,
          newVal,
          pct,
          resolve,
          reject,
        });
      });
    }

    await savePrice(entry.action_id, field, newVal);
  };

  const confirmPriceChange = async () => {
    if (!pendingPriceChange) return;
    const { actionId, field, newVal, resolve, reject } = pendingPriceChange;
    setPendingPriceChange(null);
    try {
      await savePrice(actionId, field, newVal);
      resolve();
    } catch (err) {
      reject(err);
    }
  };

  const cancelPriceChange = () => {
    if (!pendingPriceChange) return;
    const { reject } = pendingPriceChange;
    setPendingPriceChange(null);
    reject(new Error('Cancelled'));
  };

  const savePrice = async (
    actionId: string,
    field: 'cost_low' | 'cost_medium' | 'cost_high',
    newVal: number
  ) => {
    const payload: CreditMenuUpdatePayload = { [field]: newVal };
    await adminCreditMenuService.update(actionId, payload);
    setEntries((prev) =>
      prev.map((e) => (e.action_id === actionId ? { ...e, [field]: newVal } : e))
    );
    toast.success('Price updated');
  };

  // ── Activate / Deactivate ─────────────────────────────────────────────────

  const handleActivate = async (entry: CreditMenuEntry) => {
    const { action_id, cost_low, cost_medium, cost_high, free_with_sub } = entry;
    if (!free_with_sub && (cost_low <= 0 || cost_medium <= 0 || cost_high <= 0)) {
      toast.error('All three tier prices must be > 0 before activating. Set "Free with subscription" if intentionally free.');
      return;
    }
    setActionLoading((prev) => ({ ...prev, [action_id]: true }));
    try {
      const updated = await adminCreditMenuService.activate(action_id);
      setEntries((prev) => prev.map((e) => (e.action_id === action_id ? updated : e)));
      toast.success(`${entry.display_name} activated`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to activate';
      toast.error(msg);
    } finally {
      setActionLoading((prev) => ({ ...prev, [action_id]: false }));
    }
  };

  const handleDeactivate = (entry: CreditMenuEntry) => {
    // Show confirmation dialog before deactivating
    setPendingDeactivate(entry);
  };

  const confirmDeactivate = async () => {
    if (!pendingDeactivate) return;
    const entry = pendingDeactivate;
    setPendingDeactivate(null);
    setActionLoading((prev) => ({ ...prev, [entry.action_id]: true }));
    try {
      const updated = await adminCreditMenuService.deactivate(entry.action_id);
      setEntries((prev) => prev.map((e) => (e.action_id === entry.action_id ? updated : e)));
      toast.success(`${entry.display_name} deactivated`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to deactivate';
      toast.error(msg);
    } finally {
      setActionLoading((prev) => ({ ...prev, [entry.action_id]: false }));
    }
  };

  // ── CSV Download / Upload ─────────────────────────────────────────────────

  const handleDownloadCsv = () => {
    const csv = entriesToCsv(entries);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `credit-menu-${date}.csv`);
    toast.success('CSV downloaded');
  };

  const processCsvFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a .csv file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows, errors } = parseCsvUpload(text, entries);
      setCsvDiffRows(rows);
      setCsvParseErrors(errors);
      setShowCsvDropzone(false);
      setShowCsvPreview(true);
    };
    reader.readAsText(file);
  };

  const handleUploadCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processCsvFile(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processCsvFile(file);
  };

  const handleCsvConfirm = async (approvedRows: CsvDiffRow[]) => {
    setCsvApplying(true);
    let successCount = 0;
    let errorCount = 0;

    for (const row of approvedRows) {
      try {
        if (row.isNew) {
          const payload: NewCreditMenuEntry = {
            action_id: row.actionId,
            display_name: row.parsed.display_name || row.actionId,
            description: row.parsed.description,
            category: row.parsed.category,
            unit: row.parsed.unit,
            cost_low: parseFloat(row.parsed.cost_low) || 0,
            cost_medium: parseFloat(row.parsed.cost_medium) || 0,
            cost_high: parseFloat(row.parsed.cost_high) || 0,
            free_with_sub: row.parsed.free_with_sub === 'true',
            is_flat_rate: row.parsed.is_flat_rate === 'true',
          };
          await adminCreditMenuService.create(payload);
        } else {
          const payload: CreditMenuUpdatePayload = {};
          for (const ch of row.changes) {
            if (['cost_low', 'cost_medium', 'cost_high'].includes(ch.field)) {
              (payload as Record<string, number>)[ch.field] = parseFloat(ch.newVal) || 0;
            } else if (['free_with_sub', 'is_flat_rate'].includes(ch.field)) {
              (payload as Record<string, boolean>)[ch.field] = ch.newVal === 'true';
            } else if (['display_name', 'description', 'category', 'unit'].includes(ch.field)) {
              (payload as Record<string, string>)[ch.field] = ch.newVal;
            }
          }
          await adminCreditMenuService.update(row.actionId, payload);
        }
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setCsvApplying(false);
    setShowCsvPreview(false);

    if (errorCount === 0) {
      toast.success(`${successCount} change${successCount !== 1 ? 's' : ''} applied successfully`);
    } else {
      toast.error(`${successCount} applied, ${errorCount} failed`);
    }

    // Reload data
    await load();
  };

  // ── Group by category ─────────────────────────────────────────────────────

  const grouped = entries.reduce<Record<string, CreditMenuEntry[]>>((acc, entry) => {
    const cat = entry.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(entry);
    return acc;
  }, {});

  const sortedCategories = Object.keys(grouped).sort();

  const existingActionIds = entries.map((e) => e.action_id);

  // ── Access guard ──────────────────────────────────────────────────────────

  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
        <Button variant="outline" onClick={() => navigate('/platform')}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/platform')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Coins className="h-6 w-6 text-[#37bd7e]" />
              Credit Menu
            </h1>
            <p className="text-muted-foreground">
              Manage credit pricing for all platform actions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Action
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleDownloadCsv}
            disabled={entries.length === 0}
            title="Download CSV"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowCsvDropzone(true)}
            title="Upload CSV"
          >
            <Upload className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Coins className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No credit menu entries yet. Add actions from the platform catalog to start pricing them.</p>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Action
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedCategories.map((category) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 capitalize">
                {category}
              </h2>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead className="w-24 text-right">Low</TableHead>
                      <TableHead className="w-24 text-right">Medium</TableHead>
                      <TableHead className="w-24 text-right">High</TableHead>
                      <TableHead className="w-20">Unit</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-32 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped[category].map((entry) => (
                      <TableRow key={entry.action_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{entry.display_name}</p>
                            <p className="text-xs text-muted-foreground">{entry.action_id}</p>
                            {entry.free_with_sub && (
                              <Badge variant="outline" className="text-xs mt-0.5">
                                Free w/ sub
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <PriceCell
                            value={entry.cost_low}
                            onSave={(v) => handlePriceChange(entry, 'cost_low', v)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <PriceCell
                            value={entry.cost_medium}
                            onSave={(v) => handlePriceChange(entry, 'cost_medium', v)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <PriceCell
                            value={entry.cost_high}
                            onSave={(v) => handlePriceChange(entry, 'cost_high', v)}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.unit}
                        </TableCell>
                        <TableCell>
                          {entry.is_active ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              Active
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-400"
                            >
                              Draft
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {actionLoading[entry.action_id] ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : entry.is_active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeactivate(entry)}
                                className="h-7 px-2 text-xs"
                                title="Deactivate"
                              >
                                <X className="h-3.5 w-3.5 mr-1" />
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleActivate(entry)}
                                className="h-7 px-2 text-xs text-green-700 hover:text-green-800"
                                title="Activate"
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Activate
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditEntry(entry)}
                              title="Edit entry"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setHistoryActionId(entry.action_id)}
                              title="View history"
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History Sheet */}
      <HistorySheet
        actionId={historyActionId}
        open={historyActionId !== null}
        onClose={() => setHistoryActionId(null)}
      />

      {/* Edit Action Dialog */}
      <EditActionDialog
        entry={editEntry}
        open={editEntry !== null}
        onClose={() => setEditEntry(null)}
        onSaved={(updated) => {
          setEntries((prev) => prev.map((e) => (e.action_id === updated.action_id ? updated : e)));
          setEditEntry(null);
        }}
      />

      {/* Add Action Dialog */}
      <AddActionDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={load}
        existingActionIds={existingActionIds}
      />

      {/* Price Change Confirmation */}
      <AlertDialog
        open={pendingPriceChange !== null}
        onOpenChange={(v) => !v && cancelPriceChange()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Large Price Change</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPriceChange && (
                <>
                  You are changing{' '}
                  <strong>{pendingPriceChange.field.replace('cost_', '').toUpperCase()}</strong> from{' '}
                  <strong>{pendingPriceChange.oldVal}</strong> to{' '}
                  <strong>{pendingPriceChange.newVal}</strong> —{' '}
                  {isFinite(pendingPriceChange.pct)
                    ? <>a <strong>{Math.round(pendingPriceChange.pct * 100)}%</strong> change.</>
                    : <>a change from zero.</>}{' '}
                  Are you sure?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPriceChange}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPriceChange}>Confirm Change</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Dropzone Dialog */}
      <Dialog open={showCsvDropzone} onOpenChange={(v) => !v && setShowCsvDropzone(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Credit Menu CSV</DialogTitle>
          </DialogHeader>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors cursor-pointer',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            )}
            onClick={() => csvInputRef.current?.click()}
          >
            <Upload className={cn('h-8 w-8', dragOver ? 'text-primary' : 'text-muted-foreground')} />
            <p className="text-sm text-muted-foreground text-center">
              {dragOver ? 'Drop CSV file here' : 'Drag & drop a CSV file here, or click to browse'}
            </p>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleUploadCsv}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={() => setShowCsvDropzone(false)}>Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Upload Preview */}
      <CsvUploadDialog
        open={showCsvPreview}
        onClose={() => setShowCsvPreview(false)}
        diffRows={csvDiffRows}
        existingEntries={entries}
        parseErrors={csvParseErrors}
        onConfirm={handleCsvConfirm}
        applying={csvApplying}
      />

      {/* Deactivation Confirmation */}
      <AlertDialog
        open={pendingDeactivate !== null}
        onOpenChange={(v) => !v && setPendingDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Action</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeactivate && (
                <>
                  Deactivating <strong>{pendingDeactivate.display_name}</strong> will immediately
                  stop new credit charges for this action and hide it from the user pricing page.
                  In-progress workflows will not be affected. Continue?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeactivate(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
