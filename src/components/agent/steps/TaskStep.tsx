/**
 * TaskStep — config form for action_type='create_task'
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface TaskConfig {
  title: string;
  due_days?: number;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assignee?: string;
  description?: string;
}

interface Props {
  value: TaskConfig;
  onChange: (config: TaskConfig) => void;
  disabled?: boolean;
}

export default function TaskStep({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Task Title</Label>
        <Input
          placeholder="e.g. Follow up after no-show"
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Due In (days)</Label>
          <Input
            type="number"
            min={0}
            placeholder="1"
            value={value.due_days ?? ''}
            onChange={(e) => onChange({ ...value, due_days: parseInt(e.target.value, 10) || undefined })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select
            value={value.priority ?? 'medium'}
            onValueChange={(v) => onChange({ ...value, priority: v as TaskConfig['priority'] })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Assignee <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input
          placeholder="e.g. deal_owner, rep, manager"
          value={value.assignee ?? ''}
          onChange={(e) => onChange({ ...value, assignee: e.target.value })}
          disabled={disabled}
        />
        <p className="text-xs text-gray-400">Defaults to the deal owner if not specified</p>
      </div>

      <div className="space-y-1.5">
        <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input
          placeholder="Task description"
          value={value.description ?? ''}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
