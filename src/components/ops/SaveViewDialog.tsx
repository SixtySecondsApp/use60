import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConditionalFormattingEditor } from './ConditionalFormattingEditor';
import type { FormattingRule } from '@/lib/utils/conditionalFormatting';
import type { OpsTableColumn } from '@/lib/services/opsTableService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SaveViewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, formattingRules?: FormattingRule[]) => void;
  defaultName?: string;
  columns?: OpsTableColumn[];
  existingFormattingRules?: FormattingRule[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SaveViewDialog({
  isOpen,
  onClose,
  onSave,
  defaultName = '',
  columns,
  existingFormattingRules,
}: SaveViewDialogProps) {
  const [name, setName] = useState(defaultName);
  const [formattingRules, setFormattingRules] = useState<FormattingRule[]>(existingFormattingRules ?? []);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setFormattingRules(existingFormattingRules ?? []);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultName, existingFormattingRules]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, formattingRules.length > 0 ? formattingRules : undefined);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-gray-700 bg-gray-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">Save View</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div>
            <label
              htmlFor="view-name"
              className="mb-1.5 block text-sm font-medium text-gray-300"
            >
              View name
            </label>
            <input
              ref={inputRef}
              id="view-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Verified emails only"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
            />
          </div>

          {/* Conditional formatting (only if columns provided) */}
          {columns && columns.length > 0 && (
            <ConditionalFormattingEditor
              columns={columns}
              rules={formattingRules}
              onChange={setFormattingRules}
            />
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
              className="bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40"
            >
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
