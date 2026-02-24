/**
 * SlackBlockKitRenderer — Reusable Slack Block Kit message renderer
 *
 * Renders Slack Block Kit JSON into React components with full visual fidelity.
 * Supports: headers, sections, dividers, context blocks, actions, radio buttons.
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

// =============================================================================
// Types
// =============================================================================

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<{
    type: string;
    text?: { type: string; text: string; emoji?: boolean };
    action_id?: string;
    value?: string;
    style?: string;
    options?: Array<{ text: { type: string; text: string }; value: string }>;
  }>;
  accessory?: {
    type: string;
    action_id?: string;
    options?: Array<{ text: { type: string; text: string }; value: string }>;
  };
}

// =============================================================================
// Components
// =============================================================================

export function SlackMessage({
  blocks,
  botName,
  timestamp,
  visibleBlocks,
}: {
  blocks: SlackBlock[];
  botName: string;
  timestamp: string;
  visibleBlocks?: number;
}) {
  const blocksToShow = visibleBlocks !== undefined ? blocks.slice(0, visibleBlocks) : blocks;
  const isEmpty = visibleBlocks === 0;

  return (
    <div className="bg-white dark:bg-[#1a1d21] border border-gray-200 dark:border-[#383a3f] rounded-lg overflow-hidden">
      {/* Slack message header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-[15px] text-gray-900 dark:text-white">{botName}</span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">{timestamp}</span>
        </div>
      </div>
      {/* Slack message body */}
      <div className="px-4 pb-3 pl-[60px]">
        {isEmpty && (
          <div className="text-sm text-gray-400 dark:text-gray-500 italic py-4">
            Waiting for orchestrator...
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {blocksToShow.map((block, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <SlackBlockRenderer block={block} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function SlackBlockRenderer({ block }: { block: SlackBlock }) {
  switch (block.type) {
    case 'header':
      return (
        <div className="text-[18px] font-bold text-gray-900 dark:text-white mt-1 mb-1">
          {renderMrkdwn(block.text?.text || '')}
        </div>
      );

    case 'divider':
      return <hr className="border-gray-200 dark:border-gray-700 my-2" />;

    case 'section':
      return (
        <div className="my-1.5">
          {block.text && (
            <div className="text-[15px] text-gray-900 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
              {renderMrkdwn(block.text.text)}
            </div>
          )}
          {block.fields && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1">
              {block.fields.map((field, i) => (
                <div key={i} className="text-[15px] text-gray-900 dark:text-gray-200 leading-relaxed">
                  {renderMrkdwn(field.text)}
                </div>
              ))}
            </div>
          )}
          {block.accessory?.type === 'radio_buttons' && block.accessory.options && (
            <div className="mt-2 space-y-1.5">
              {block.accessory.options.map((opt, i) => (
                <label key={i} className="flex items-center gap-2 text-[14px] text-gray-800 dark:text-gray-300 cursor-pointer">
                  <span className={cn(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                    i === 0
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-400 dark:border-gray-500'
                  )}>
                    {i === 0 && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  {opt.text.text}
                </label>
              ))}
            </div>
          )}
        </div>
      );

    case 'context':
      return (
        <div className="text-[12px] text-gray-500 dark:text-gray-400 my-1">
          {block.elements?.map((el, i) => (
            <span key={i}>{renderMrkdwn(el.text?.text || '')}</span>
          ))}
        </div>
      );

    case 'actions':
      return (
        <div className="flex flex-wrap gap-2 mt-2.5 mb-1">
          {block.elements?.map((btn, i) => (
            <button
              key={i}
              className={cn(
                'px-3 py-1.5 text-[13px] font-medium rounded-md border transition-colors',
                btn.style === 'primary'
                  ? 'bg-[#007a5a] text-white border-[#007a5a] hover:bg-[#006b4f]'
                  : btn.style === 'danger'
                  ? 'bg-[#e01e5a] text-white border-[#e01e5a] hover:bg-[#c91652]'
                  : 'bg-white dark:bg-[#2c2d30] text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#3a3b3e]'
              )}
            >
              {renderMrkdwn(btn.text?.text || '')}
            </button>
          ))}
        </div>
      );

    default:
      return null;
  }
}

// =============================================================================
// Utilities
// =============================================================================

export function renderMrkdwn(text: string): string {
  // Simple markdown-like rendering for Slack mrkdwn — return as-is for now
  // Bold: *text* -> keep as visual (CSS handles)
  return text;
}
