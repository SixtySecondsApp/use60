/**
 * SkillContentEditor Component
 *
 * Markdown editor with autocomplete for:
 * - @ mentions (documents and skills)
 * - {variables} (organization context)
 *
 * Features:
 * - Syntax highlighting for references
 * - Autocomplete dropdown
 * - Insert buttons
 * - Preview mode
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AtSign,
  Braces,
  Eye,
  EyeOff,
  FileCode,
  FileText,
  Lightbulb,
  Link2,
  Folder,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SkillDocumentType } from '@/lib/types/skills';
import { getVariableSuggestions, type VariableSuggestion } from '@/lib/types/skills';

// =============================================================================
// Types
// =============================================================================

interface DocumentSuggestion {
  id: string;
  title: string;
  path: string;
  doc_type: SkillDocumentType;
}

interface SkillSuggestion {
  skill_key: string;
  name: string;
  category: string;
}

interface SkillContentEditorProps {
  title: string;
  description: string;
  content: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onContentChange: (content: string) => void;
  documentSuggestions: DocumentSuggestion[];
  skillSuggestions: SkillSuggestion[];
  onSearchDocuments?: (query: string) => void;
  onSearchSkills?: (query: string) => void;
  isLoading?: boolean;
  className?: string;
  /** Start in preview mode */
  defaultShowPreview?: boolean;
  /** Hide the preview toggle button (for read-only views) */
  hidePreviewToggle?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DOC_TYPE_ICONS: Record<SkillDocumentType, typeof FileText> = {
  prompt: FileCode,
  example: Lightbulb,
  asset: FileText,
  reference: Link2,
  template: FileText,
};

const VARIABLE_SUGGESTIONS = getVariableSuggestions();

// =============================================================================
// Autocomplete Popup
// =============================================================================

interface AutocompletePopupProps {
  type: 'mention' | 'variable';
  query: string;
  position: { top: number; left: number };
  documentSuggestions: DocumentSuggestion[];
  skillSuggestions: SkillSuggestion[];
  onSelect: (value: string) => void;
  onClose: () => void;
}

function AutocompletePopup({
  type,
  query,
  position,
  documentSuggestions,
  skillSuggestions,
  onSelect,
  onClose,
}: AutocompletePopupProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter suggestions based on query
  const filteredDocs = useMemo(
    () =>
      documentSuggestions.filter(
        (d) =>
          d.title.toLowerCase().includes(query.toLowerCase()) ||
          d.path.toLowerCase().includes(query.toLowerCase())
      ),
    [documentSuggestions, query]
  );

  const filteredSkills = useMemo(
    () =>
      skillSuggestions.filter(
        (s) =>
          s.skill_key.toLowerCase().includes(query.toLowerCase()) ||
          s.name.toLowerCase().includes(query.toLowerCase())
      ),
    [skillSuggestions, query]
  );

  const filteredVariables = useMemo(
    () =>
      VARIABLE_SUGGESTIONS.filter(
        (v) =>
          v.name.toLowerCase().includes(query.toLowerCase()) ||
          v.description.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );

  const items =
    type === 'mention'
      ? [
          ...filteredDocs.map((d) => ({ type: 'doc' as const, ...d })),
          ...filteredSkills.map((s) => ({ type: 'skill' as const, ...s })),
        ]
      : filteredVariables.map((v) => ({ type: 'variable' as const, ...v }));

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (items[selectedIndex]) {
            const item = items[selectedIndex];
            if (item.type === 'doc') {
              onSelect(`@${item.path}`);
            } else if (item.type === 'skill') {
              onSelect(`@${item.skill_key}`);
            } else {
              onSelect(`{${item.name}}`);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onSelect, onClose]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed z-50 bg-gray-900 border border-white/20 rounded-lg shadow-xl overflow-hidden"
      style={{ top: position.top, left: position.left, minWidth: 280, maxWidth: 400 }}
    >
      <ScrollArea className="max-h-64">
        <div className="p-1">
          {type === 'mention' && filteredDocs.length > 0 && (
            <>
              <div className="px-2 py-1 text-xs text-gray-500 uppercase">Documents</div>
              {filteredDocs.map((doc, idx) => {
                const DocIcon = DOC_TYPE_ICONS[doc.doc_type] || FileText;
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={doc.id}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors',
                      isSelected ? 'bg-blue-600/30' : 'hover:bg-white/5'
                    )}
                    onClick={() => onSelect(`@${doc.path}`)}
                  >
                    <DocIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate">{doc.title}</div>
                      <div className="text-xs text-gray-500 truncate">{doc.path}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {doc.doc_type}
                    </Badge>
                  </button>
                );
              })}
            </>
          )}

          {type === 'mention' && filteredSkills.length > 0 && (
            <>
              <div className="px-2 py-1 text-xs text-gray-500 uppercase mt-1">Skills</div>
              {filteredSkills.map((skill, idx) => {
                const isSelected = idx + filteredDocs.length === selectedIndex;
                return (
                  <button
                    key={skill.skill_key}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors',
                      isSelected ? 'bg-blue-600/30' : 'hover:bg-white/5'
                    )}
                    onClick={() => onSelect(`@${skill.skill_key}`)}
                  >
                    <Wand2 className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate">{skill.name}</div>
                      <div className="text-xs text-gray-500 truncate">{skill.skill_key}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {skill.category}
                    </Badge>
                  </button>
                );
              })}
            </>
          )}

          {type === 'variable' &&
            filteredVariables.map((variable, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={variable.name}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors',
                    isSelected ? 'bg-blue-600/30' : 'hover:bg-white/5'
                  )}
                  onClick={() => onSelect(`{${variable.name}}`)}
                >
                  <Braces className="h-4 w-4 text-green-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200">{variable.name}</div>
                    <div className="text-xs text-gray-500 truncate">{variable.description}</div>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {variable.category}
                  </Badge>
                </button>
              );
            })}
        </div>
      </ScrollArea>
    </div>
  );
}

// =============================================================================
// Variable Picker Modal
// =============================================================================

interface VariablePickerProps {
  onSelect: (variable: string) => void;
}

function VariablePicker({ onSelect }: VariablePickerProps) {
  const [search, setSearch] = useState('');

  const filteredVariables = useMemo(
    () =>
      VARIABLE_SUGGESTIONS.filter(
        (v) =>
          v.name.toLowerCase().includes(search.toLowerCase()) ||
          v.description.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  const categories = useMemo(() => {
    const cats = new Map<string, VariableSuggestion[]>();
    for (const v of filteredVariables) {
      const list = cats.get(v.category) || [];
      list.push(v);
      cats.set(v.category, list);
    }
    return cats;
  }, [filteredVariables]);

  return (
    <div className="w-80">
      <div className="p-3 border-b border-white/10">
        <Input
          placeholder="Search variables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8"
        />
      </div>
      <ScrollArea className="h-64">
        <div className="p-2">
          {Array.from(categories.entries()).map(([category, variables]) => (
            <div key={category} className="mb-3">
              <div className="px-2 py-1 text-xs text-gray-500 uppercase">{category}</div>
              {variables.map((variable) => (
                <button
                  key={variable.name}
                  className="w-full flex items-start gap-2 px-2 py-1.5 rounded text-left hover:bg-white/5 transition-colors"
                  onClick={() => onSelect(`{${variable.name}}`)}
                >
                  <Braces className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 font-mono">{`{${variable.name}}`}</div>
                    <div className="text-xs text-gray-500">{variable.description}</div>
                    {variable.example && (
                      <div className="text-xs text-gray-600 italic mt-0.5">
                        e.g., {variable.example}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SkillContentEditor({
  title,
  description,
  content,
  onTitleChange,
  onDescriptionChange,
  onContentChange,
  documentSuggestions,
  skillSuggestions,
  onSearchDocuments,
  onSearchSkills,
  isLoading,
  className,
  defaultShowPreview = false,
  hidePreviewToggle = false,
}: SkillContentEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(defaultShowPreview);

  // Autocomplete state
  const [autocomplete, setAutocomplete] = useState<{
    type: 'mention' | 'variable';
    query: string;
    position: { top: number; left: number };
    startIndex: number;
  } | null>(null);

  // Handle content change and detect autocomplete triggers
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart;
      onContentChange(value);

      // Check for @ trigger
      const textBeforeCursor = value.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@([\w\-\/\.]*)$/);
      const braceMatch = textBeforeCursor.match(/\{([\w_]*)$/);

      if (atMatch) {
        const query = atMatch[1];
        const rect = textareaRef.current?.getBoundingClientRect();
        if (rect) {
          setAutocomplete({
            type: 'mention',
            query,
            position: { top: rect.top + 24, left: rect.left + 100 },
            startIndex: cursorPos - atMatch[0].length,
          });
          onSearchDocuments?.(query);
          onSearchSkills?.(query);
        }
      } else if (braceMatch) {
        const query = braceMatch[1];
        const rect = textareaRef.current?.getBoundingClientRect();
        if (rect) {
          setAutocomplete({
            type: 'variable',
            query,
            position: { top: rect.top + 24, left: rect.left + 100 },
            startIndex: cursorPos - braceMatch[0].length,
          });
        }
      } else {
        setAutocomplete(null);
      }
    },
    [onContentChange, onSearchDocuments, onSearchSkills]
  );

  // Handle autocomplete selection
  const handleAutocompleteSelect = useCallback(
    (value: string) => {
      if (!autocomplete || !textareaRef.current) return;

      const before = content.slice(0, autocomplete.startIndex);
      const after = content.slice(textareaRef.current.selectionStart);
      const newContent = before + value + ' ' + after;

      onContentChange(newContent);
      setAutocomplete(null);

      // Focus and position cursor
      setTimeout(() => {
        textareaRef.current?.focus();
        const newPos = autocomplete.startIndex + value.length + 1;
        textareaRef.current?.setSelectionRange(newPos, newPos);
      }, 0);
    },
    [autocomplete, content, onContentChange]
  );

  // Insert @ mention at cursor
  const insertMention = useCallback(() => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const before = content.slice(0, pos);
    const after = content.slice(pos);
    onContentChange(before + '@' + after);

    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos + 1, pos + 1);
      // Trigger autocomplete
      const rect = textareaRef.current?.getBoundingClientRect();
      if (rect) {
        setAutocomplete({
          type: 'mention',
          query: '',
          position: { top: rect.top + 24, left: rect.left + 100 },
          startIndex: pos,
        });
      }
    }, 0);
  }, [content, onContentChange]);

  // Insert variable at cursor
  const insertVariable = useCallback(
    (variable: string) => {
      if (!textareaRef.current) return;
      const pos = textareaRef.current.selectionStart;
      const before = content.slice(0, pos);
      const after = content.slice(pos);
      onContentChange(before + variable + ' ' + after);

      setTimeout(() => {
        textareaRef.current?.focus();
        const newPos = pos + variable.length + 1;
        textareaRef.current?.setSelectionRange(newPos, newPos);
      }, 0);
    },
    [content, onContentChange]
  );

  // Custom component to highlight @ mentions and {variables} within text
  const HighlightedText = useCallback(({ children }: { children: React.ReactNode }) => {
    if (typeof children !== 'string') return <>{children}</>;

    // Split text by @ mentions and {variables}
    const parts = children.split(/(@[\w\-\/\.]+|\{[\w_]+\}|\$\{[\w_\.]+\})/g);

    return (
      <>
        {parts.map((part, i) => {
          if (part.startsWith('@')) {
            return (
              <span key={i} className="text-blue-400 bg-blue-400/10 px-1 rounded font-mono text-sm">
                {part}
              </span>
            );
          }
          if (part.startsWith('{') || part.startsWith('${')) {
            return (
              <span key={i} className="text-green-400 bg-green-400/10 px-1 rounded font-mono text-sm">
                {part}
              </span>
            );
          }
          return part;
        })}
      </>
    );
  }, []);

  // Custom markdown components with reference highlighting
  const markdownComponents = useMemo(() => ({
    p: ({ children }: { children: React.ReactNode }) => (
      <p className="mb-4 last:mb-0 leading-relaxed">
        <HighlightedText>{children}</HighlightedText>
      </p>
    ),
    h1: ({ children }: { children: React.ReactNode }) => (
      <h1 className="text-2xl font-bold mb-4 mt-8 first:mt-0 text-white border-b border-white/10 pb-3 tracking-tight">
        {children}
      </h1>
    ),
    h2: ({ children }: { children: React.ReactNode }) => (
      <h2 className="text-xl font-semibold mb-3 mt-6 first:mt-0 text-white tracking-tight flex items-center gap-2">
        <span className="w-1 h-5 bg-gradient-to-b from-blue-500 to-indigo-500 rounded-full" />
        {children}
      </h2>
    ),
    h3: ({ children }: { children: React.ReactNode }) => (
      <h3 className="text-lg font-medium mb-2 mt-5 first:mt-0 text-gray-100 tracking-tight">
        {children}
      </h3>
    ),
    h4: ({ children }: { children: React.ReactNode }) => (
      <h4 className="text-base font-medium mb-2 mt-4 first:mt-0 text-gray-200">
        {children}
      </h4>
    ),
    ul: ({ children }: { children: React.ReactNode }) => (
      <ul className="mb-4 space-y-2 text-gray-300 ml-1">
        {children}
      </ul>
    ),
    ol: ({ children }: { children: React.ReactNode }) => (
      <ol className="list-decimal list-inside mb-4 space-y-2 text-gray-300 ml-1">
        {children}
      </ol>
    ),
    li: ({ children }: { children: React.ReactNode }) => (
      <li className="text-gray-300 flex items-start gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 mt-2.5 flex-shrink-0" />
        <span className="flex-1">
          <HighlightedText>{children}</HighlightedText>
        </span>
      </li>
    ),
    code: ({ children, className }: { children: React.ReactNode; className?: string }) => {
      const isBlock = className?.includes('language-');
      if (isBlock) {
        return (
          <code className={cn(
            "block bg-gray-900/80 rounded-xl p-4 my-4 overflow-x-auto text-sm font-mono border border-white/5",
            className
          )}>
            {children}
          </code>
        );
      }
      return (
        <code className="bg-white/10 px-1.5 py-0.5 rounded-md text-sm font-mono text-pink-400 border border-white/5">
          {children}
        </code>
      );
    },
    pre: ({ children }: { children: React.ReactNode }) => (
      <pre className="bg-gray-900/80 rounded-xl overflow-hidden my-4 border border-white/5">
        {children}
      </pre>
    ),
    blockquote: ({ children }: { children: React.ReactNode }) => (
      <blockquote className="border-l-4 border-blue-500/50 pl-4 my-4 py-2 bg-blue-500/5 rounded-r-lg italic text-gray-400">
        {children}
      </blockquote>
    ),
    strong: ({ children }: { children: React.ReactNode }) => (
      <strong className="font-semibold text-white">{children}</strong>
    ),
    em: ({ children }: { children: React.ReactNode }) => (
      <em className="italic text-gray-300">{children}</em>
    ),
    a: ({ href, children }: { href?: string; children: React.ReactNode }) => (
      <a href={href} className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/30 hover:decoration-blue-300/50 transition-colors" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    hr: () => <hr className="my-8 border-white/5" />,
    table: ({ children }: { children: React.ReactNode }) => (
      <div className="overflow-x-auto my-6 rounded-xl border border-white/10">
        <table className="min-w-full">
          {children}
        </table>
      </div>
    ),
    th: ({ children }: { children: React.ReactNode }) => (
      <th className="bg-white/5 px-4 py-3 text-left font-semibold text-white text-sm border-b border-white/10">
        {children}
      </th>
    ),
    td: ({ children }: { children: React.ReactNode }) => (
      <td className="px-4 py-3 border-b border-white/5 text-sm">
        <HighlightedText>{children}</HighlightedText>
      </td>
    ),
  }), [HighlightedText]);

  // In preview mode (read-only), we show only the rendered content
  const isReadOnly = hidePreviewToggle && defaultShowPreview;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Title and Description - only show in edit mode */}
      {!isReadOnly && (
        <div className="space-y-4 p-5 border-b border-white/5 bg-gray-900/30">
          <div>
            <Label htmlFor="title" className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Document title..."
              className="mt-2 bg-white/5 border-white/10 focus:border-blue-500/50 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <Label htmlFor="description" className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Description
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Brief description..."
              className="mt-2 bg-white/5 border-white/10 focus:border-blue-500/50 focus:ring-blue-500/20"
            />
          </div>
        </div>
      )}

      {/* Toolbar - only show in edit mode */}
      {!isReadOnly && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-gray-900/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={insertMention}
            className="h-8 gap-1.5 hover:bg-white/10 rounded-lg"
            title="Insert @ mention"
          >
            <AtSign className="h-4 w-4 text-blue-400" />
            <span className="text-xs">Mention</span>
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 hover:bg-white/10 rounded-lg" title="Insert variable">
                <Braces className="h-4 w-4 text-green-400" />
                <span className="text-xs">Variable</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 bg-gray-900 border-white/10" align="start">
              <VariablePicker onSelect={insertVariable} />
            </PopoverContent>
          </Popover>

          <div className="flex-1" />

          {!hidePreviewToggle && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className={cn('h-8 gap-1.5 rounded-lg', showPreview ? 'bg-white/10 text-white' : 'hover:bg-white/10')}
            >
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="text-xs">{showPreview ? 'Edit' : 'Preview'}</span>
            </Button>
          )}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {showPreview ? (
          <ScrollArea className="h-full">
            <div className="py-6 pr-4 text-gray-300">
              {!content ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                    <FileText className="w-8 h-8 text-gray-500" />
                  </div>
                  <p className="text-gray-400 font-medium">No content yet</p>
                  <p className="text-sm text-gray-500 mt-1">Switch to edit mode to add content</p>
                </div>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents as any}
                >
                  {content}
                </ReactMarkdown>
              )}
            </div>
          </ScrollArea>
        ) : (
          <>
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              placeholder="Write your skill content here...

Use @folder/document.md to reference other documents
Use @skill-key to reference other skills
Use {variable_name} for organization context variables

Example:
Target customers matching {ICP_profile} who work at companies like {customer_logos}.

See @prompts/qualification.md for the qualification criteria."
              className="h-full resize-none rounded-none border-0 focus-visible:ring-0 font-mono text-sm"
            />

            {/* Autocomplete popup */}
            {autocomplete && (
              <AutocompletePopup
                type={autocomplete.type}
                query={autocomplete.query}
                position={autocomplete.position}
                documentSuggestions={documentSuggestions}
                skillSuggestions={skillSuggestions}
                onSelect={handleAutocompleteSelect}
                onClose={() => setAutocomplete(null)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default SkillContentEditor;
