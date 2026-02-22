/**
 * RichCopilotInput
 *
 * Contenteditable chat input that supports:
 * - Plain text entry
 * - Inline @ entity chips (contacts, companies, deals)
 * - / skill command highlight
 * - All existing keyboard shortcuts (Enter sends, Shift+Enter newline, Escape cancels)
 *
 * Replaces the plain <textarea> in AssistantShell.
 */

import React, {
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useState,
  type KeyboardEvent,
} from 'react';
import { User, Building2, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EntityReference, EntityType, RichInputPayload } from '@/lib/types/entitySearch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RichCopilotInputHandle {
  focus: () => void;
  clear: () => void;
  insertEntityChip: (entity: EntityReference) => void;
  insertSkillCommand: (command: string) => void;
  getPayload: () => RichInputPayload;
  isEmpty: () => boolean;
}

interface RichCopilotInputProps {
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onSubmit: (payload: RichInputPayload) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** Called when the user types @ followed by characters */
  onMentionTrigger?: (query: string, caretRect: DOMRect | null) => void;
  /** Called when the mention trigger is dismissed (e.g., backspace past @) */
  onMentionDismiss?: () => void;
  /** Called when the user types / at the start */
  onSkillTrigger?: (query: string, caretRect: DOMRect | null) => void;
  /** Called when the skill trigger is dismissed */
  onSkillDismiss?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_CHIP_CLASS = 'copilot-entity-chip';
const SKILL_CMD_CLASS = 'copilot-skill-cmd';
const CHIP_ATTR = 'data-entity-id';
const CHIP_TYPE_ATTR = 'data-entity-type';
const CHIP_NAME_ATTR = 'data-entity-name';

const ENTITY_ICONS: Record<EntityType, string> = {
  contact: '\u{1F464}', // placeholder — rendered via Lucide in actual chips
  company: '\u{1F3E2}',
  deal: '\u{1F4BC}',
};

const ENTITY_COLORS: Record<EntityType, string> = {
  contact: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  company: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  deal: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RichCopilotInput = forwardRef<RichCopilotInputHandle, RichCopilotInputProps>(
  function RichCopilotInput(
    {
      placeholder = 'Ask me to create, find, or prep anything...',
      disabled = false,
      className,
      onSubmit,
      onKeyDown,
      onMentionTrigger,
      onMentionDismiss,
      onSkillTrigger,
      onSkillDismiss,
    },
    ref,
  ) {
    const editorRef = useRef<HTMLDivElement>(null);
    const [hasContent, setHasContent] = useState(false);
    const mentionActiveRef = useRef(false);
    const skillActiveRef = useRef(false);
    const mentionStartRef = useRef<number | null>(null);

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
      focus: () => editorRef.current?.focus(),
      clear: () => {
        if (editorRef.current) {
          editorRef.current.innerHTML = '';
          setHasContent(false);
          mentionActiveRef.current = false;
          skillActiveRef.current = false;
          mentionStartRef.current = null;
        }
      },
      insertEntityChip: (entity: EntityReference) => {
        insertChip(entity);
        mentionActiveRef.current = false;
        mentionStartRef.current = null;
        onMentionDismiss?.();
      },
      insertSkillCommand: (command: string) => {
        insertSkillCmd(command);
        skillActiveRef.current = false;
        onSkillDismiss?.();
      },
      getPayload: () => extractPayload(),
      isEmpty: () => !hasContent,
    }));

    // ---------------------------------------------------------------------------
    // Chip insertion
    // ---------------------------------------------------------------------------

    const insertChip = useCallback((entity: EntityReference) => {
      const editor = editorRef.current;
      if (!editor) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        editor.focus();
        return;
      }

      // Remove the @query text that triggered the autocomplete
      if (mentionStartRef.current !== null) {
        const range = sel.getRangeAt(0);
        // Walk back to find and remove the @ trigger text
        const textNode = range.startContainer;
        if (textNode.nodeType === Node.TEXT_NODE) {
          const text = textNode.textContent || '';
          const beforeCaret = text.slice(0, range.startOffset);
          const atIdx = beforeCaret.lastIndexOf('@');
          if (atIdx >= 0) {
            // Remove @query
            const newText = text.slice(0, atIdx) + text.slice(range.startOffset);
            textNode.textContent = newText;
            // Move caret to where @ was
            range.setStart(textNode, atIdx);
            range.collapse(true);
          }
        }
      }

      // Create chip element
      const chip = document.createElement('span');
      chip.className = `${ENTITY_CHIP_CLASS} inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded-md text-xs font-medium border cursor-default select-none ${ENTITY_COLORS[entity.type]}`;
      chip.contentEditable = 'false';
      chip.setAttribute(CHIP_ATTR, entity.id);
      chip.setAttribute(CHIP_TYPE_ATTR, entity.type);
      chip.setAttribute(CHIP_NAME_ATTR, entity.name);
      chip.textContent = entity.name;

      // Insert chip at caret
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(chip);

      // Add a space after the chip and place caret there
      const space = document.createTextNode('\u00A0');
      chip.after(space);
      range.setStartAfter(space);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);

      setHasContent(true);
      editor.focus();
    }, [onMentionDismiss]);

    const insertSkillCmd = useCallback((command: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      // Remove any existing skill command
      editor.querySelectorAll(`.${SKILL_CMD_CLASS}`).forEach((el) => el.remove());

      // Remove the /query text at the start
      const firstChild = editor.firstChild;
      if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
        const text = firstChild.textContent || '';
        if (text.startsWith('/')) {
          // Find where the command text ends (next space or end)
          const spaceIdx = text.indexOf(' ');
          firstChild.textContent = spaceIdx >= 0 ? text.slice(spaceIdx) : '';
        }
      }

      // Create skill command element
      const cmdEl = document.createElement('span');
      cmdEl.className = `${SKILL_CMD_CLASS} inline-flex items-center px-2 py-0.5 mr-1 rounded-md text-xs font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30 cursor-default select-none`;
      cmdEl.contentEditable = 'false';
      cmdEl.setAttribute('data-skill-command', command);
      cmdEl.textContent = `/${command}`;

      // Insert at the very beginning
      editor.prepend(cmdEl);

      // Add a space after and place caret there
      const space = document.createTextNode('\u00A0');
      cmdEl.after(space);
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.setStartAfter(space);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      setHasContent(true);
      editor.focus();
    }, [onSkillDismiss]);

    // ---------------------------------------------------------------------------
    // Payload extraction
    // ---------------------------------------------------------------------------

    const extractPayload = useCallback((): RichInputPayload => {
      const editor = editorRef.current;
      if (!editor) return { text: '', entities: [] };

      const entities: EntityReference[] = [];
      let skillCommand: string | undefined;

      // Walk the DOM nodes to build text and collect entities
      const textParts: string[] = [];

      const walkNodes = (parent: Node) => {
        parent.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            textParts.push(node.textContent || '');
          } else if (node instanceof HTMLElement) {
            if (node.classList.contains(ENTITY_CHIP_CLASS)) {
              const id = node.getAttribute(CHIP_ATTR);
              const type = node.getAttribute(CHIP_TYPE_ATTR) as EntityType;
              const name = node.getAttribute(CHIP_NAME_ATTR);
              if (id && type && name) {
                entities.push({ id, type, name });
                textParts.push(`@${name}`);
              }
            } else if (node.classList.contains(SKILL_CMD_CLASS)) {
              skillCommand = node.getAttribute('data-skill-command') || undefined;
              textParts.push(`/${skillCommand}`);
            } else {
              // Recurse for any other elements (e.g., <br>)
              if (node.tagName === 'BR') {
                textParts.push('\n');
              } else {
                walkNodes(node);
              }
            }
          }
        });
      };

      walkNodes(editor);

      return {
        text: textParts.join('').trim(),
        entities,
        skillCommand,
      };
    }, []);

    // ---------------------------------------------------------------------------
    // Input handling
    // ---------------------------------------------------------------------------

    const handleInput = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) return;

      const text = editor.textContent || '';
      setHasContent(text.trim().length > 0 || editor.querySelector(`.${ENTITY_CHIP_CLASS}`) !== null);

      // Detect @ mention trigger
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const textNode = range.startContainer;
        if (textNode.nodeType === Node.TEXT_NODE) {
          const textBefore = (textNode.textContent || '').slice(0, range.startOffset);

          // Check for @ trigger
          const atMatch = textBefore.match(/@(\w*)$/);
          if (atMatch) {
            mentionActiveRef.current = true;
            mentionStartRef.current = range.startOffset - atMatch[0].length;
            const caretRect = getCaretRect();
            onMentionTrigger?.(atMatch[1], caretRect);
            return;
          } else if (mentionActiveRef.current) {
            mentionActiveRef.current = false;
            mentionStartRef.current = null;
            onMentionDismiss?.();
          }

          // Check for / trigger at start of editor content
          const fullText = editor.textContent || '';
          const slashMatch = fullText.match(/^\/(\w*)$/);
          if (slashMatch && !editor.querySelector(`.${SKILL_CMD_CLASS}`)) {
            skillActiveRef.current = true;
            const caretRect = getCaretRect();
            onSkillTrigger?.(slashMatch[1], caretRect);
            return;
          } else if (skillActiveRef.current) {
            skillActiveRef.current = false;
            onSkillDismiss?.();
          }
        }
      }
    }, [onMentionTrigger, onMentionDismiss, onSkillTrigger, onSkillDismiss]);

    const handleKeyDownInternal = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        // Delegate to parent for dropdown navigation etc.
        onKeyDown?.(e);
        if (e.defaultPrevented) return;

        // Enter = send (unless Shift held)
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const payload = extractPayload();
          if (payload.text.trim() || payload.entities.length > 0) {
            onSubmit(payload);
          }
          return;
        }

        // Handle backspace on chips — when caret is right after a chip, remove it
        if (e.key === 'Backspace') {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            // If we're at position 0 in a text node, check previous sibling
            if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
              const prev = node.previousSibling;
              if (prev instanceof HTMLElement && prev.classList.contains(ENTITY_CHIP_CLASS)) {
                e.preventDefault();
                prev.remove();
                setHasContent((editorRef.current?.textContent || '').trim().length > 0);
                return;
              }
              if (prev instanceof HTMLElement && prev.classList.contains(SKILL_CMD_CLASS)) {
                e.preventDefault();
                prev.remove();
                return;
              }
            }
            // If caret is at the editor level right after a chip
            if (node === editorRef.current && range.startOffset > 0) {
              const prev = node.childNodes[range.startOffset - 1];
              if (prev instanceof HTMLElement && (prev.classList.contains(ENTITY_CHIP_CLASS) || prev.classList.contains(SKILL_CMD_CLASS))) {
                e.preventDefault();
                prev.remove();
                return;
              }
            }
          }
        }

        // Escape dismisses dropdowns (handled at a higher level)
        if (e.key === 'Escape') {
          if (mentionActiveRef.current) {
            mentionActiveRef.current = false;
            mentionStartRef.current = null;
            onMentionDismiss?.();
          }
          if (skillActiveRef.current) {
            skillActiveRef.current = false;
            onSkillDismiss?.();
          }
        }
      },
      [onKeyDown, onSubmit, extractPayload, onMentionDismiss, onSkillDismiss],
    );

    // Prevent paste from bringing in formatted HTML
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }, []);

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    function getCaretRect(): DOMRect | null {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);

      // Try to get caret rect
      const rects = range.getClientRects();
      if (rects.length > 0) return rects[0];

      // Fallback: use a temporary span
      const span = document.createElement('span');
      span.textContent = '\u200b'; // zero-width space
      range.insertNode(span);
      const rect = span.getBoundingClientRect();
      span.remove();
      return rect;
    }

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          role="textbox"
          aria-multiline="true"
          aria-placeholder={placeholder}
          data-testid="copilot-input"
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDownInternal}
          onPaste={handlePaste}
          className={cn(
            'flex-1 bg-transparent resize-none text-sm text-gray-100 placeholder-gray-500 focus:outline-none max-h-32 overflow-y-auto whitespace-pre-wrap break-words',
            'min-h-[24px]',
            !hasContent && 'empty:before:content-[attr(aria-placeholder)] empty:before:text-gray-500',
            disabled && 'opacity-60 cursor-not-allowed',
            className,
          )}
        />
      </div>
    );
  },
);
