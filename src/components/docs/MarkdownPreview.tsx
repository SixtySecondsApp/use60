import ReactMarkdown from 'react-markdown';

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  // Process custom blocks (:::beginner, :::intermediate, :::advanced)
  const processedContent = content.replace(
    /:::(\w+)\n([\s\S]*?):::/g,
    (match, level, content) => {
      return `<div class="skill-level-block skill-level-${level}">
        <div class="skill-level-badge">${level.toUpperCase()}</div>
        ${content}
      </div>`;
    }
  );

  // Highlight template variables
  const highlightedContent = processedContent.replace(
    /\{\{(\w+)\}\}/g,
    '<code class="template-var">{{$1}}</code>'
  );

  return (
    <div className="prose prose-slate dark:prose-invert max-w-none p-4 h-full overflow-y-auto bg-slate-50 dark:bg-slate-900/30">
      <ReactMarkdown
        components={{
          // Allow HTML (for custom blocks)
          div: ({ node, ...props }) => <div {...props} />,
        }}
      >
        {highlightedContent}
      </ReactMarkdown>

      <style jsx>{`
        .skill-level-block {
          margin: 1rem 0;
          padding: 1rem;
          border-left: 3px solid;
          border-radius: 0.5rem;
        }

        .skill-level-beginner {
          border-color: #10b981;
          background-color: rgba(16, 185, 129, 0.1);
        }

        .skill-level-intermediate {
          border-color: #f59e0b;
          background-color: rgba(245, 158, 11, 0.1);
        }

        .skill-level-advanced {
          border-color: #ef4444;
          background-color: rgba(239, 68, 68, 0.1);
        }

        .skill-level-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: 0.25rem;
          margin-bottom: 0.5rem;
        }

        .skill-level-beginner .skill-level-badge {
          background-color: #10b981;
          color: white;
        }

        .skill-level-intermediate .skill-level-badge {
          background-color: #f59e0b;
          color: white;
        }

        .skill-level-advanced .skill-level-badge {
          background-color: #ef4444;
          color: white;
        }

        :global(.template-var) {
          background-color: #dbeafe;
          color: #1e40af;
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-weight: 600;
        }

        :global(.dark .template-var) {
          background-color: #1e3a8a;
          color: #93c5fd;
        }
      `}</style>
    </div>
  );
}
