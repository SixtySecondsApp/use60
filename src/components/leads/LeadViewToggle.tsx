import { Inbox, Table } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeadViewToggleProps {
  view: 'list' | 'table';
  onViewChange: (view: 'list' | 'table') => void;
  disabled?: boolean;
}

export function LeadViewToggle({ view, onViewChange, disabled }: LeadViewToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
      <button
        type="button"
        onClick={() => !disabled && onViewChange('list')}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
          view === 'list'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        aria-label="Inbox view"
        aria-pressed={view === 'list'}
      >
        <Inbox className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => !disabled && onViewChange('table')}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
          view === 'table'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        aria-label="Table view"
        aria-pressed={view === 'table'}
      >
        <Table className="h-4 w-4" />
      </button>
    </div>
  );
}

