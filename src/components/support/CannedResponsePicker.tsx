import { useState } from 'react';
import { MessageSquareText, Search, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCannedResponses } from '@/lib/hooks/useCannedResponses';

interface CannedResponsePickerProps {
  onSelect: (content: string) => void;
}

export function CannedResponsePicker({ onSelect }: CannedResponsePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: responses, isLoading } = useCannedResponses();

  const filtered = (responses ?? []).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q) || r.shortcut?.toLowerCase().includes(q);
  });

  const handleSelect = (content: string) => {
    onSelect(content);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="Insert canned response"
        >
          <MessageSquareText className="w-3.5 h-3.5" />
          Canned
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0" sideOffset={8}>
        {/* Search */}
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 text-gray-400">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search responses..."
              className="w-full text-xs bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-60 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-xs text-gray-400">No canned responses found</p>
            </div>
          )}
          {filtered.map((response) => (
            <button
              key={response.id}
              type="button"
              onClick={() => handleSelect(response.content)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-50 dark:border-gray-800/50 last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{response.title}</p>
                {response.shortcut && (
                  <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono shrink-0">
                    /{response.shortcut}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{response.content}</p>
              {response.category && (
                <span className="text-[10px] text-gray-400 mt-1 inline-block">{response.category}</span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
