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
}: SkillContentEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);

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

  // Syntax highlighting for preview
  const highlightedContent = useMemo(() => {
    if (!content) return '';

    return content
      .replace(
        /@([\w\-\/\.]+)/g,
        '<span class="text-blue-400 bg-blue-400/10 px-1 rounded">@$1</span>'
      )
      .replace(
        /\{([\w_]+)\}/g,
        '<span class="text-green-400 bg-green-400/10 px-1 rounded">{$1}</span>'
      )
      .replace(
        /\$\{([\w_\.]+)\}/g,
        '<span class="text-green-400 bg-green-400/10 px-1 rounded">${$1}</span>'
      );
  }, [content]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Title and Description */}
      <div className="space-y-4 p-4 border-b border-white/10">
        <div>
          <Label htmlFor="title" className="text-sm text-gray-400">
            Title
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Document title..."
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="description" className="text-sm text-gray-400">
            Description
          </Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Brief description..."
            className="mt-1"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-white/5">
        <Button
          variant="ghost"
          size="sm"
          onClick={insertMention}
          className="h-8 gap-1.5"
          title="Insert @ mention"
        >
          <AtSign className="h-4 w-4" />
          <span className="text-xs">Mention</span>
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5" title="Insert variable">
              <Braces className="h-4 w-4" />
              <span className="text-xs">Variable</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0" align="start">
            <VariablePicker onSelect={insertVariable} />
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
          className={cn('h-8 gap-1.5', showPreview && 'bg-white/10')}
        >
          {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="text-xs">{showPreview ? 'Edit' : 'Preview'}</span>
        </Button>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative">
        {showPreview ? (
          <ScrollArea className="h-full">
            <div
              className="p-4 prose prose-invert prose-sm max-w-none whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: highlightedContent }}
            />
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
