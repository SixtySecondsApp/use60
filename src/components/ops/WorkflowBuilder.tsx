/**
 * OI-004: Workflow Builder
 *
 * Natural language input → parsed steps → visual pipeline → save
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Save } from 'lucide-react';
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
      const { data } = await opsTableService.supabase.functions.invoke(
        'ops-table-workflow-engine',
        {
          body: { tableId, action: 'parse', description },
        }
      );
      return data.steps;
    },
    onSuccess: (parsedSteps) => {
      setSteps(parsedSteps);
      toast.success('Workflow parsed successfully');
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
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold">Create Workflow</h2>
        <p className="text-sm text-muted-foreground">
          Describe what you want to happen in plain English
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Workflow Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Enrich and score new leads"
          />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Every time a new contact syncs from HubSpot, enrich their LinkedIn, score by ICP fit, assign by territory, Slack alert if Director+"
            rows={4}
          />
        </div>

        <div>
          <Label>Trigger</Label>
          <Select value={triggerType} onValueChange={setTriggerType}>
            <SelectTrigger>
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
        >
          <Play className="h-4 w-4 mr-2" />
          Parse Workflow
        </Button>
      </div>

      {steps.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold">Workflow Steps</h3>
          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div key={idx} className="border rounded-lg p-4">
                <div className="font-medium">
                  Step {idx + 1}: {step.action_type}
                </div>
                {step.condition && (
                  <div className="text-sm text-muted-foreground mt-1">
                    When: {step.condition}
                  </div>
                )}
              </div>
            ))}
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!name || saveMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Workflow
          </Button>
        </div>
      )}
    </div>
  );
}
