/**
 * SkillOutputRenderer
 *
 * Renders skill output with proper formatting for tables, sections, and markdown.
 * Provides a polished, easy-to-read presentation of AI-generated content.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface SkillOutputRendererProps {
  content: string;
  className?: string;
}

export function SkillOutputRenderer({ content, className }: SkillOutputRendererProps) {
  return (
    <div className={cn('skill-output', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Main title styling
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
              {children}
            </h1>
          ),
          // Section headers
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-emerald-600 dark:text-emerald-400 mt-6 mb-3 uppercase tracking-wide flex items-center gap-2">
              <span className="w-1 h-4 bg-emerald-500 rounded-full" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">
              {children}
            </h3>
          ),
          // Paragraphs
          p: ({ children }) => (
            <p className="text-sm text-gray-700 dark:text-gray-300 my-2 leading-relaxed">
              {children}
            </p>
          ),
          // Strong/bold text
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-900 dark:text-white">
              {children}
            </strong>
          ),
          // Emphasis/italic
          em: ({ children }) => (
            <em className="text-gray-500 dark:text-gray-400 not-italic">
              {children}
            </em>
          ),
          // Horizontal rules as section dividers
          hr: () => (
            <hr className="my-4 border-gray-200 dark:border-gray-700" />
          ),
          // Tables with proper styling
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300">
              {children}
            </td>
          ),
          // Unordered lists
          ul: ({ children }) => (
            <ul className="my-3 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
              {children}
            </ul>
          ),
          // Ordered lists
          ol: ({ children }) => (
            <ol className="my-3 space-y-1.5 text-sm text-gray-700 dark:text-gray-300 list-decimal list-inside">
              {children}
            </ol>
          ),
          // List items with custom bullets
          li: ({ children, ...props }) => {
            // Check if this is a checkbox item
            const childArray = Array.isArray(children) ? children : [children];
            const hasCheckbox = childArray.some(
              (child) => typeof child === 'object' && child !== null && 'type' in child && child.type === 'input'
            );

            if (hasCheckbox) {
              return (
                <li className="flex items-start gap-2 py-0.5" {...props}>
                  {children}
                </li>
              );
            }

            return (
              <li className="flex items-start gap-2 py-0.5" {...props}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span className="flex-1">{children}</span>
              </li>
            );
          },
          // Checkbox inputs (for task lists)
          input: ({ type, checked, ...props }) => {
            if (type === 'checkbox') {
              return (
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-4 h-4 rounded border mr-2 shrink-0',
                    checked
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-gray-300 dark:border-gray-600'
                  )}
                >
                  {checked && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              );
            }
            return <input type={type} {...props} />;
          },
          // Code blocks
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 rounded" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={cn('block p-3 text-xs font-mono bg-gray-900 dark:bg-gray-950 text-gray-100 rounded-lg overflow-x-auto', className)} {...props}>
                {children}
              </code>
            );
          },
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="my-3 pl-4 border-l-2 border-emerald-500 text-gray-600 dark:text-gray-400 italic">
              {children}
            </blockquote>
          ),
          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
