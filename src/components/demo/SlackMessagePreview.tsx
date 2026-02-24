// src/components/demo/SlackMessagePreview.tsx
// Renders a simplified Slack Block Kit message as a Slack-like DM card.
// Used in the demo experience to preview bot messages.

import React from 'react';
import { Bot } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (exported for reuse)
// ---------------------------------------------------------------------------

export type SlackBlock =
  | { type: 'header'; text: string }
  | { type: 'section'; text: string; fields?: Array<{ label: string; value: string }> }
  | { type: 'context'; text: string }
  | { type: 'divider' }
  | {
      type: 'actions';
      buttons: Array<{
        text: string;
        style?: 'primary' | 'danger' | 'default';
        onClick?: () => void;
      }>;
    }
  | { type: 'rich_text'; content: string };

export interface SlackMessage {
  botName?: string;
  botAvatar?: string;
  timestamp: string;
  blocks: SlackBlock[];
}

// ---------------------------------------------------------------------------
// Inline text parser
// ---------------------------------------------------------------------------

const ACCENT = '#6C5CE7';

/**
 * Parses a limited subset of inline formatting:
 *  - **bold** -> <strong>
 *  - `code`  -> <code>
 *  - Newlines -> <br />
 */
function renderInlineText(raw: string): React.ReactNode[] {
  // Split on **bold**, `code`, and newlines, preserving delimiters
  const tokens = raw.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g);

  return tokens.map((token, i) => {
    if (token === '\n') {
      return <br key={i} />;
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1 py-0.5 rounded bg-gray-100 text-pink-600 text-[0.85em] font-mono"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{token}</React.Fragment>;
  });
}

/**
 * Parses rich text content that may contain bullet lines (prefixed with `\u2022` or `-`).
 * Returns a mix of paragraph nodes and <ul> groups.
 */
function renderRichContent(content: string): React.ReactNode {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  function flushBullets() {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-0.5 my-1">
        {bulletBuffer.map((b, j) => (
          <li key={j} className="text-sm text-gray-700">
            {renderInlineText(b)}
          </li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[\u2022\-]\s/.test(trimmed)) {
      bulletBuffer.push(trimmed.replace(/^[\u2022\-]\s*/, ''));
    } else {
      flushBullets();
      if (trimmed) {
        elements.push(
          <p key={`p-${elements.length}`} className="text-sm text-gray-700 my-0.5">
            {renderInlineText(trimmed)}
          </p>,
        );
      }
    }
  }
  flushBullets();

  return <>{elements}</>;
}

// ---------------------------------------------------------------------------
// Block renderers
// ---------------------------------------------------------------------------

function HeaderBlock({ text }: { text: string }) {
  return <p className="text-base font-bold text-gray-900 mt-1 mb-1">{renderInlineText(text)}</p>;
}

function SectionBlock({
  text,
  fields,
}: {
  text: string;
  fields?: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="my-1">
      <p className="text-sm text-gray-700">{renderInlineText(text)}</p>
      {fields && fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
          {fields.map((f) => (
            <div key={f.label}>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {f.label}
              </span>
              <p className="text-sm text-gray-800">{renderInlineText(f.value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContextBlock({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 my-1">{renderInlineText(text)}</p>;
}

function DividerBlock() {
  return <hr className="my-2 border-gray-200" />;
}

function ActionsBlock({
  buttons,
}: {
  buttons: Array<{
    text: string;
    style?: 'primary' | 'danger' | 'default';
    onClick?: () => void;
  }>;
}) {
  return (
    <div className="flex flex-wrap gap-2 my-2">
      {buttons.map((btn) => {
        const isPrimary = btn.style === 'primary';
        const isDanger = btn.style === 'danger';

        let classes =
          'px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer';
        if (isPrimary) {
          classes += ' text-white';
        } else if (isDanger) {
          classes += ' text-red-600 border border-red-300 bg-white hover:bg-red-50';
        } else {
          classes += ' text-gray-700 border border-gray-300 bg-white hover:bg-gray-50';
        }

        return (
          <button
            key={btn.text}
            onClick={btn.onClick}
            className={classes}
            style={isPrimary ? { backgroundColor: ACCENT } : undefined}
          >
            {btn.text}
          </button>
        );
      })}
    </div>
  );
}

function RichTextBlock({ content }: { content: string }) {
  return <div className="my-1">{renderRichContent(content)}</div>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SlackMessagePreview({ botName, botAvatar, timestamp, blocks }: SlackMessage) {
  const displayName = botName ?? '60 Sales Copilot';

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-[600px] overflow-hidden"
      style={{ borderLeft: `3px solid ${ACCENT}` }}
    >
      <div className="p-4">
        {/* Bot header */}
        <div className="flex items-center gap-2 mb-3">
          {/* Avatar */}
          {botAvatar ? (
            <img
              src={botAvatar}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: ACCENT }}
            >
              <Bot className="w-4 h-4" />
            </div>
          )}
          <span className="font-bold text-sm text-gray-900">{displayName}</span>
          <span className="text-xs text-gray-400">{timestamp}</span>
        </div>

        {/* Blocks */}
        <div className="space-y-0.5">
          {blocks.map((block, idx) => {
            switch (block.type) {
              case 'header':
                return <HeaderBlock key={idx} text={block.text} />;
              case 'section':
                return <SectionBlock key={idx} text={block.text} fields={block.fields} />;
              case 'context':
                return <ContextBlock key={idx} text={block.text} />;
              case 'divider':
                return <DividerBlock key={idx} />;
              case 'actions':
                return <ActionsBlock key={idx} buttons={block.buttons} />;
              case 'rich_text':
                return <RichTextBlock key={idx} content={block.content} />;
              default:
                return null;
            }
          })}
        </div>
      </div>
    </div>
  );
}
