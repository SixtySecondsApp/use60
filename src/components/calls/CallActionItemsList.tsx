import React, { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

type CallActionItem = {
  id: string;
  call_id: string;
  title: string;
  description: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent' | string;
  category: string | null;
  deadline_at: string | null;
  importance: 'high' | 'medium' | 'low' | null;
  synced_to_task: boolean;
  linked_task_id: string | null;
};

interface CallActionItemsListProps {
  callId: string;
  actionItems: CallActionItem[];
  onTasksCreated: () => void;
}

export function CallActionItemsList({ callId, actionItems, onTasksCreated }: CallActionItemsListProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isConverting, setIsConverting] = useState(false);
  const [importanceFilter, setImportanceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const filteredItems = useMemo(() => {
    return actionItems.filter((item) => {
      if (importanceFilter === 'all') return true;
      return item.importance === importanceFilter;
    });
  }, [actionItems, importanceFilter]);

  const unsyncedItems = useMemo(() => filteredItems.filter((i) => !i.synced_to_task), [filteredItems]);

  const toggleItem = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedItems.size === unsyncedItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(unsyncedItems.map((i) => i.id)));
    }
  };

  const convertToTasks = async () => {
    if (selectedItems.size === 0) return;

    setIsConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-router', {
        body: {
          action: 'task_unified',
          mode: 'manual',
          action_item_ids: Array.from(selectedItems),
          source: 'call_action_item',
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Created ${data.tasks_created} task(s)`);
        setSelectedItems(new Set());
        onTasksCreated();
      } else if (data?.errors && data.errors.length > 0) {
        toast.warning(`Created ${data.tasks_created} task(s). ${data.errors.length} failed.`);
        setSelectedItems(new Set());
        onTasksCreated();
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create tasks. Please try again.');
    } finally {
      setIsConverting(false);
    }
  };

  const getImportanceBadge = (importance: string | null) => {
    const level = (importance || 'medium') as 'high' | 'medium' | 'low';
    const colors: Record<string, string> = {
      high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
      low: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100',
    };
    return <Badge className={`${colors[level] || colors.medium} text-xs`}>{level.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Header with Bulk Actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Checkbox checked={selectedItems.size === unsyncedItems.length && unsyncedItems.length > 0} onCheckedChange={toggleAll} disabled={unsyncedItems.length === 0} />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {selectedItems.size > 0 ? `${selectedItems.size} selected` : 'Select all'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={importanceFilter}
            onChange={(e) => setImportanceFilter(e.target.value as any)}
            className="text-sm border rounded px-2 py-1 dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="all">All Importance</option>
            <option value="high">High Only</option>
            <option value="medium">Medium Only</option>
            <option value="low">Low Only</option>
          </select>

          <Button onClick={convertToTasks} disabled={selectedItems.size === 0 || isConverting} size="sm">
            {isConverting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Converting...
              </>
            ) : (
              `Convert ${selectedItems.size} to Tasks`
            )}
          </Button>
        </div>
      </div>

      {/* Action Items List */}
      <div className="space-y-2">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-3 p-3 border rounded-lg ${
              item.synced_to_task ? 'bg-gray-50 dark:bg-gray-800/50 opacity-60' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
            } transition-colors`}
          >
            <Checkbox checked={selectedItems.has(item.id)} onCheckedChange={() => toggleItem(item.id)} disabled={item.synced_to_task} className="mt-1" />

            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-1 flex-wrap">
                <p className="text-sm font-medium flex-1 min-w-0">{item.title}</p>
                {getImportanceBadge(item.importance)}
                {item.synced_to_task && (
                  <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    In Tasks
                  </Badge>
                )}
              </div>
              {item.description && <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{item.description}</p>}
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                {item.assignee_name && <span>👤 {item.assignee_name}</span>}
                {item.deadline_at && <span>📅 {new Date(item.deadline_at).toLocaleDateString()}</span>}
                {item.category && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{item.category}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredItems.length === 0 && actionItems.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">No action items {importanceFilter !== 'all' ? `with ${importanceFilter} importance` : ''}</p>
        </div>
      )}

      {actionItems.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Circle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No action items for this call</p>
          <p className="text-xs mt-1 opacity-75">Extract tasks from the transcript to populate this list.</p>
        </div>
      )}
    </div>
  );
}













