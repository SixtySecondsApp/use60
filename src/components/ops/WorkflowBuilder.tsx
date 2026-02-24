/**
 * OI-004: Workflow Builder
 *
 * Natural language input → parsed steps → visual pipeline → save
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Save, ArrowLeft, ChevronRight, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useServices } from '@/lib/services/ServiceLocator';

interface WorkflowBuilderProps {
  tableId: string;
  onClose: () => void;
}

export function WorkflowBuilder({ tableId, onClose }: WorkflowBuilderProps) {
  const { opsTableService } = useServices();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<any[]>([]);
  const [triggerType, setTriggerType] = useState<string>('manual');

  const parseMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await opsTableService.supabase.functions.invoke(
        'ops-table-workflow-engine',
        {
          body: { tableId, action: 'parse', description },
        }
      );
      if (error) throw new Error(error.message || 'Failed to invoke workflow engine');
      if (!data || data.error) throw new Error(data?.error || 'No response from workflow engine');
      if (!Array.isArray(data.steps)) throw new Error('Invalid response: missing steps array');
      return data.steps;
    },
    onSuccess: (parsedSteps) => {
      setSteps(parsedSteps);
      toast.success(`Parsed ${parsedSteps.length} workflow steps`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to parse workflow');
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      opsTableService.saveWorkflow({
        tableId,
        name: name || 'Untitled Workflow',
        description,
        trigger_type: triggerType,
        steps,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows', tableId] });
      toast.success('Workflow saved');
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save workflow');
    },
  });

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to workflows
      </button>

      {/* Form */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Enrich and score new leads"
            className="h-9 text-sm bg-white/[0.03] border-white/[0.08] text-gray-200 placeholder:text-gray-600 focus:border-violet-500/50 focus:ring-violet-500/20"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">What should this workflow do?</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Every time a new contact syncs from HubSpot, enrich their LinkedIn, score by ICP fit, assign by territory, Slack alert if Director+"
            rows={3}
            className="text-sm bg-white/[0.03] border-white/[0.08] text-gray-200 placeholder:text-gray-600 focus:border-violet-500/50 focus:ring-violet-500/20 resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">Trigger</Label>
          <Select value={triggerType} onValueChange={setTriggerType}>
            <SelectTrigger className="h-9 text-sm bg-white/[0.03] border-white/[0.08] text-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual only</SelectItem>
              <SelectItem value="on_sync">After HubSpot sync</SelectItem>
              <SelectItem value="on_cell_change">On cell change</SelectItem>
              <SelectItem value="on_schedule">Scheduled (cron)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => parseMutation.mutate()}
          disabled={!description || parseMutation.isPending}
          className="w-full h-9 text-sm bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white border-0 shadow-lg shadow-violet-500/20 disabled:opacity-50"
        >
          {parseMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 mr-2" />
          )}
          {parseMutation.isPending ? 'Parsing...' : 'Parse Workflow'}
        </Button>
      </div>

      {/* Parsed steps */}
      {steps.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Pipeline Steps</p>

          <div className="space-y-0">
            {steps.map((step, idx) => (
              <div key={idx} className="relative flex items-start gap-3 pb-4 last:pb-0">
                {/* Vertical connector line */}
                {idx < steps.length - 1 && (
                  <div className="absolute left-[11px] top-6 bottom-0 w-px bg-gradient-to-b from-violet-500/30 to-transparent" />
                )}

                {/* Step indicator */}
                <div className="shrink-0 mt-0.5">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                    <span className="text-[10px] font-bold text-white">{idx + 1}</span>
                  </div>
                </div>

                {/* Step content */}
                <div className="flex-1 min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-sm font-medium text-gray-200">{step.action_type}</p>
                  {step.condition && (
                    <p className="text-xs text-gray-500 mt-1">
                      When: {step.condition}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!name || saveMutation.isPending}
            className="w-full h-9 text-sm bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white border-0 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-2" />
            )}
            {saveMutation.isPending ? 'Saving...' : 'Save Workflow'}
          </Button>
        </div>
      )}
    </div>
  );
}
