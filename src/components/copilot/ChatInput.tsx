/**
 * Chat Input Component
 * Input field with send button for Copilot messages
 */

import React, { useRef, useEffect } from 'react';
import { Send, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  suggestedPrompts?: string[];
  onPromptClick?: (prompt: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onCancel,
  disabled = false,
  isLoading = false,
  placeholder = 'Ask Copilot anything about your pipeline, contacts, or next actions...',
  suggestedPrompts = [],
  onPromptClick
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSend();
      }
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800/50 rounded-2xl p-5 shadow-lg dark:shadow-2xl max-w-3xl mx-auto w-full">
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={disabled}
            data-testid="copilot-input"
            className={cn(
              'w-full px-5 py-4 bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl',
              'text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
              'resize-none overflow-hidden',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-all duration-200'
            )}
          />
        </div>
        {isLoading && onCancel ? (
          <Button
            onClick={onCancel}
            className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl flex-shrink-0 transition-all duration-200 shadow-lg gap-2"
            title="Cancel request"
          >
            <Square className="w-4 h-4 fill-current" />
            <span className="hidden sm:inline text-sm">Stop</span>
          </Button>
        ) : (
          <Button
            onClick={onSend}
            disabled={!value.trim() || disabled}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-blue-500/20"
          >
            <Send className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Suggested Prompts */}
      {suggestedPrompts.length > 0 && onPromptClick && (
        <div className="mt-4 flex flex-wrap gap-2">
          {suggestedPrompts.map((prompt, index) => (
            <button
              key={index}
              onClick={() => onPromptClick(prompt)}
              className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700/50 rounded-lg text-sm text-gray-700 dark:text-gray-300 transition-all hover:scale-105"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatInput;
