/**
 * InlineEditController
 *
 * Renders inside the react-frame-component iframe and uses event delegation
 * to enable double-click-to-edit on text, images, and dividers.
 *
 * - Text: contentEditable with Escape-to-revert, blur/Enter-to-commit
 * - Assets: floating toolbar with Regenerate / Remove
 * - Dividers: floating toolbar with type selector / Remove
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LandingSection, SectionDividerType } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EditTarget =
  | { type: 'text'; sectionId: string; field: string; el: HTMLElement; original: string }
  | { type: 'asset'; sectionId: string; el: HTMLElement; rect: DOMRect }
  | { type: 'divider'; sectionId: string; el: HTMLElement; rect: DOMRect }
  | null;

interface InlineEditControllerProps {
  frameDocument: Document | null;
  sections: LandingSection[];
  onSectionUpdate: (sectionId: string, updates: Partial<LandingSection>) => void;
  onRegenerateAsset?: (sectionId: string, assetType: 'image' | 'svg') => void;
  onUploadAsset?: (sectionId: string, file: File) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk up from an element to find the nearest [data-section-id] */
function findSectionAncestor(el: HTMLElement): { sectionId: string; wrapper: HTMLElement } | null {
  let node: HTMLElement | null = el;
  while (node) {
    const id = node.getAttribute('data-section-id');
    if (id) return { sectionId: id, wrapper: node };
    node = node.parentElement;
  }
  return null;
}

/** Detect which copy field an element maps to via tag + class heuristics */
function detectCopyField(el: HTMLElement): string | null {
  const tag = el.tagName.toLowerCase();
  const cls = el.className || '';

  // CTA button
  if (cls.includes('cta-btn') || (tag === 'a' && cls.includes('cta'))) return 'cta';

  // Headlines
  if (tag === 'h1' || tag === 'h2') return 'headline';

  // Paragraphs — distinguish by opacity class
  if (tag === 'p') {
    if (cls.includes('opacity-80') || cls.includes('subhead')) return 'subhead';
    if (cls.includes('opacity-60') || cls.includes('body')) return 'body';
    // Default paragraph — treat as subhead (most common after headline)
    return 'subhead';
  }

  return null;
}

/** Check if an element is an image or SVG asset */
function isAssetElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'img') return true;
  if (tag === 'svg' || el.closest('svg')) return true;
  // Image placeholder divs
  if (el.getAttribute('data-asset-slot')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Floating Toolbar (shared base)
// ---------------------------------------------------------------------------

function FloatingToolbar({
  rect,
  children,
  onDismiss,
}: {
  rect: DOMRect;
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: `${rect.top - 44}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
        zIndex: 99999,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '8px',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontSize: '11px',
        fontWeight: 500,
        borderRadius: '4px',
        border: 'none',
        cursor: 'pointer',
        color: danger ? '#f87171' : '#e2e8f0',
        backgroundColor: danger ? 'rgba(248, 113, 113, 0.1)' : 'rgba(139, 92, 246, 0.15)',
        transition: 'background-color 0.15s',
      }}
      onMouseOver={(e) => {
        (e.target as HTMLElement).style.backgroundColor = danger
          ? 'rgba(248, 113, 113, 0.25)'
          : 'rgba(139, 92, 246, 0.3)';
      }}
      onMouseOut={(e) => {
        (e.target as HTMLElement).style.backgroundColor = danger
          ? 'rgba(248, 113, 113, 0.1)'
          : 'rgba(139, 92, 246, 0.15)';
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Asset Action Toolbar
// ---------------------------------------------------------------------------

function AssetActionToolbar({
  sectionId,
  rect,
  onRegenerateAsset,
  onUploadAsset,
  onRemoveAsset,
  onDismiss,
}: {
  sectionId: string;
  rect: DOMRect;
  onRegenerateAsset?: (sectionId: string, assetType: 'image' | 'svg') => void;
  onUploadAsset?: (sectionId: string, file: File) => Promise<string>;
  onRemoveAsset: (sectionId: string) => void;
  onDismiss: () => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Create a hidden file input for the upload flow
  React.useEffect(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file && onUploadAsset) {
        onUploadAsset(sectionId, file);
        onDismiss();
      }
      // Cleanup
      input.value = '';
    });
    document.body.appendChild(input);
    fileInputRef.current = input;

    return () => {
      document.body.removeChild(input);
    };
  }, [sectionId, onUploadAsset, onDismiss]);

  return (
    <FloatingToolbar rect={rect} onDismiss={onDismiss}>
      {onRegenerateAsset && (
        <ToolbarButton
          label="Regenerate"
          onClick={() => {
            onRegenerateAsset(sectionId, 'image');
            onDismiss();
          }}
        />
      )}
      {onUploadAsset && (
        <ToolbarButton
          label="Upload"
          onClick={() => {
            fileInputRef.current?.click();
          }}
        />
      )}
      <ToolbarButton
        label="Remove"
        danger
        onClick={() => {
          onRemoveAsset(sectionId);
          onDismiss();
        }}
      />
    </FloatingToolbar>
  );
}

// ---------------------------------------------------------------------------
// Divider Action Toolbar
// ---------------------------------------------------------------------------

const DIVIDER_TYPES: SectionDividerType[] = ['wave', 'curve', 'diagonal', 'mesh'];

function DividerActionToolbar({
  sectionId,
  currentType,
  rect,
  onChangeDivider,
  onDismiss,
}: {
  sectionId: string;
  currentType: SectionDividerType | undefined;
  rect: DOMRect;
  onChangeDivider: (sectionId: string, type: SectionDividerType) => void;
  onDismiss: () => void;
}) {
  return (
    <FloatingToolbar rect={rect} onDismiss={onDismiss}>
      {DIVIDER_TYPES.map((dt) => (
        <ToolbarButton
          key={dt}
          label={dt === currentType ? `${dt} ✓` : dt}
          onClick={() => {
            onChangeDivider(sectionId, dt);
            onDismiss();
          }}
        />
      ))}
      <ToolbarButton
        label="Remove"
        danger
        onClick={() => {
          onChangeDivider(sectionId, 'none');
          onDismiss();
        }}
      />
    </FloatingToolbar>
  );
}

// ---------------------------------------------------------------------------
// Main Controller
// ---------------------------------------------------------------------------

export function InlineEditController({
  frameDocument,
  sections,
  onSectionUpdate,
  onRegenerateAsset,
  onUploadAsset,
}: InlineEditControllerProps) {
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  // Commit text edit
  const commitTextEdit = useCallback(
    (target: Extract<EditTarget, { type: 'text' }>) => {
      const newText = target.el.innerText.trim();
      if (newText !== target.original) {
        const section = sectionsRef.current.find((s) => s.id === target.sectionId);
        if (section) {
          onSectionUpdate(target.sectionId, {
            copy: { ...section.copy, [target.field]: newText },
          });
        }
      }
      target.el.removeAttribute('contenteditable');
      setEditTarget(null);
    },
    [onSectionUpdate],
  );

  // Revert text edit
  const revertTextEdit = useCallback((target: Extract<EditTarget, { type: 'text' }>) => {
    target.el.innerText = target.original;
    target.el.removeAttribute('contenteditable');
    setEditTarget(null);
  }, []);

  // Handle double-click events inside the iframe
  useEffect(() => {
    if (!frameDocument) return;

    function handleDblClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target) return;

      // Prevent default selection behaviour
      e.preventDefault();

      // Check for divider
      const dividerWrapper = target.closest('[data-divider-for]') as HTMLElement | null;
      if (dividerWrapper) {
        const sectionId = dividerWrapper.getAttribute('data-divider-for')!;
        setEditTarget({
          type: 'divider',
          sectionId,
          el: dividerWrapper,
          rect: dividerWrapper.getBoundingClientRect(),
        });
        return;
      }

      // Check for asset
      if (isAssetElement(target)) {
        const sectionInfo = findSectionAncestor(target);
        if (sectionInfo) {
          setEditTarget({
            type: 'asset',
            sectionId: sectionInfo.sectionId,
            el: target,
            rect: target.getBoundingClientRect(),
          });
        }
        return;
      }

      // Check for text field
      const field = detectCopyField(target);
      if (field) {
        const sectionInfo = findSectionAncestor(target);
        if (sectionInfo) {
          const original = target.innerText;
          target.setAttribute('contenteditable', 'true');
          target.focus();

          // Select all text
          const range = (frameDocument as Document).createRange();
          range.selectNodeContents(target);
          const sel = (frameDocument as Document).defaultView?.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);

          setEditTarget({
            type: 'text',
            sectionId: sectionInfo.sectionId,
            field,
            el: target,
            original,
          });
        }
      }
    }

    frameDocument.addEventListener('dblclick', handleDblClick);
    return () => frameDocument.removeEventListener('dblclick', handleDblClick);
  }, [frameDocument]);

  // Handle keydown for text editing (Enter to commit, Escape to revert)
  useEffect(() => {
    if (!frameDocument || !editTarget || editTarget.type !== 'text') return;
    const target = editTarget;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        revertTextEdit(target as Extract<EditTarget, { type: 'text' }>);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitTextEdit(target as Extract<EditTarget, { type: 'text' }>);
      }
    }

    function handleBlur() {
      // Small delay to avoid race with toolbar clicks
      setTimeout(() => {
        commitTextEdit(target as Extract<EditTarget, { type: 'text' }>);
      }, 100);
    }

    // Strip HTML on paste
    function handlePaste(e: ClipboardEvent) {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') || '';
      (frameDocument as Document).execCommand('insertText', false, text);
    }

    const el = target.el;
    el.addEventListener('keydown', handleKeyDown);
    el.addEventListener('blur', handleBlur);
    el.addEventListener('paste', handlePaste);

    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      el.removeEventListener('blur', handleBlur);
      el.removeEventListener('paste', handlePaste);
    };
  }, [frameDocument, editTarget, commitTextEdit, revertTextEdit]);

  // Asset toolbar actions
  const handleRemoveAsset = useCallback(
    (sectionId: string) => {
      onSectionUpdate(sectionId, { image_url: null, svg_code: null });
    },
    [onSectionUpdate],
  );

  // Divider toolbar actions
  const handleChangeDivider = useCallback(
    (sectionId: string, type: SectionDividerType) => {
      onSectionUpdate(sectionId, { divider: type });
    },
    [onSectionUpdate],
  );

  // Render floating toolbars (these are portaled into the iframe body via React)
  if (!editTarget) return null;

  if (editTarget.type === 'asset') {
    return (
      <AssetActionToolbar
        sectionId={editTarget.sectionId}
        rect={editTarget.rect}
        onRegenerateAsset={onRegenerateAsset}
        onUploadAsset={onUploadAsset}
        onRemoveAsset={handleRemoveAsset}
        onDismiss={() => setEditTarget(null)}
      />
    );
  }

  if (editTarget.type === 'divider') {
    const section = sections.find((s) => s.id === editTarget.sectionId);
    return (
      <DividerActionToolbar
        sectionId={editTarget.sectionId}
        currentType={section?.divider}
        rect={editTarget.rect}
        onChangeDivider={handleChangeDivider}
        onDismiss={() => setEditTarget(null)}
      />
    );
  }

  // Text editing is handled entirely by contentEditable + event listeners — no extra UI
  return null;
}
