import { useState, useEffect, useMemo } from 'react';
import { List } from 'lucide-react';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function TableOfContents({ content }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');

  const headings = useMemo(() => {
    const items: TocItem[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^(#{2,3})\s+(.+)/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        items.push({ id: slugify(text), text, level });
      }
    }
    return items;
  }, [content]);

  // Scroll spy using IntersectionObserver
  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0.1 }
    );

    for (const heading of headings) {
      const el = document.getElementById(heading.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav className="hidden xl:block sticky top-24 w-56 shrink-0 max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-custom">
      <div className="flex items-center gap-2 mb-3 px-2">
        <List className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          On this page
        </span>
      </div>
      <ul className="space-y-0.5">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(heading.id);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth' });
                  setActiveId(heading.id);
                }
              }}
              className={`
                block text-sm py-1 transition-colors
                ${heading.level === 3 ? 'pl-5' : 'pl-2'}
                ${
                  activeId === heading.id
                    ? 'text-blue-600 dark:text-blue-400 font-medium border-l-2 border-blue-500 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-l-2 border-transparent'
                }
              `}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
