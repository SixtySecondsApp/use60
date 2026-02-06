import { useState, useEffect } from 'react';
import { Bold, Italic, Heading, Code, Link, Image } from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const [draftValue, setDraftValue] = useState(value);

  // Auto-save draft every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (draftValue !== value) {
        onChange(draftValue);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [draftValue, value, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraftValue(e.target.value);
  };

  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = draftValue.substring(start, end);
    const newText =
      draftValue.substring(0, start) +
      before +
      selectedText +
      after +
      draftValue.substring(end);

    setDraftValue(newText);
    onChange(newText);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selectedText.length
      );
    }, 0);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center space-x-2 p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
        <button
          type="button"
          onClick={() => insertMarkdown('**', '**')}
          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('*', '*')}
          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('## ', '')}
          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title="Heading"
        >
          <Heading className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('`', '`')}
          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title="Code"
        >
          <Code className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('[', '](url)')}
          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title="Link"
        >
          <Link className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('![alt](', ')')}
          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title="Image"
        >
          <Image className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">
          Auto-saves every 30s
        </span>
      </div>

      {/* Editor */}
      <textarea
        value={draftValue}
        onChange={handleChange}
        onBlur={() => onChange(draftValue)}
        className="flex-1 p-4 font-mono text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white
          border-none focus:outline-none resize-none"
        placeholder="Write your documentation in markdown...

## Beginner Example
Use {{table_name}} to personalize examples

:::beginner
This content only shows for beginner users
:::

:::intermediate
This content only shows for intermediate users
:::

:::advanced
This content only shows for advanced users
:::"
      />
    </div>
  );
}
