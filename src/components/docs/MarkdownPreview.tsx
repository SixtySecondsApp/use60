import ReactMarkdown from 'react-markdown';

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  // For now, just render the markdown as-is
  // Custom blocks (:::beginner) can be enhanced later with proper parsing

  return (
    <div className="prose prose-slate dark:prose-invert max-w-none p-4 h-full overflow-y-auto bg-slate-50 dark:bg-slate-900/30">
      <ReactMarkdown>
        {content}
      </ReactMarkdown>
    </div>
  );
}
