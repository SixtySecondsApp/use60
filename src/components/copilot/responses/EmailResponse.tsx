/**
 * Email Response Component
 * Displays email drafts with context and suggestions
 * US-010: Added tone selector UI for email generation
 * Compact design with collapsible context
 * In-place tone regeneration without new chat messages
 */

import React, { useState, useCallback } from 'react';
import { Lightbulb, Clock, Briefcase, Smile, Zap, ChevronDown, ChevronUp, Copy, Mail, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmailResponse as EmailResponseData } from '../types';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

interface EmailResponseProps {
  data: EmailResponseData;
  onActionClick?: (action: any) => void;
}

// US-010: Tone options for email generation
const toneOptions = [
  {
    value: 'professional' as const,
    label: 'Professional',
    icon: Briefcase,
    description: 'More formal than your usual style'
  },
  {
    value: 'friendly' as const,
    label: 'Friendly',
    icon: Smile,
    description: 'More casual and warm'
  },
  {
    value: 'concise' as const,
    label: 'Concise',
    icon: Zap,
    description: 'Brief and to the point'
  },
] as const;

type EmailTone = 'professional' | 'friendly' | 'concise';

const formatTime = (timeString: string): string => {
  const date = new Date(timeString);
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const EmailResponse: React.FC<EmailResponseProps> = ({ data, onActionClick }) => {
  const [showContext, setShowContext] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [currentTone, setCurrentTone] = useState<EmailTone>(data.data.email.tone || 'professional');
  const [emailSubject, setEmailSubject] = useState(data.data.email.subject);
  const [emailBody, setEmailBody] = useState(data.data.email.body);

  // Handle tone change - regenerate in-place using the API
  const handleToneChange = useCallback(async (newTone: EmailTone) => {
    if (newTone === currentTone || isRegenerating) return;

    setIsRegenerating(true);
    setCurrentTone(newTone); // Optimistically update UI
    
    try {
      // Call API to regenerate email with new tone
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-copilot/actions/regenerate-email-tone`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.session.access_token}`
          },
          body: JSON.stringify({
            currentEmail: {
              subject: data.data.email.subject,
              body: data.data.email.body,
              to: data.data.email.to
            },
            newTone,
            context: data.data.context
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to regenerate email');
      }

      const result = await response.json();
      if (result.subject && result.body) {
        setEmailSubject(result.subject);
        setEmailBody(result.body);
        toast.success(`Email adjusted to ${newTone} tone`);
      }
    } catch (error) {
      console.error('Failed to regenerate email:', error);
      toast.error('Failed to regenerate email. Please try again.');
      setCurrentTone(data.data.email.tone || 'professional'); // Revert
    } finally {
      setIsRegenerating(false);
    }
  }, [currentTone, isRegenerating, data.data.email, data.data.context]);

  // Handle suggestion click - all actions happen in-place
  const handleSuggestionClick = useCallback(async (suggestion: { action: string; label: string; description: string }) => {
    if (suggestion.action === 'change_tone') {
      // For change_tone suggestions, cycle to the next tone
      const currentIndex = toneOptions.findIndex(t => t.value === currentTone);
      const nextIndex = (currentIndex + 1) % toneOptions.length;
      handleToneChange(toneOptions[nextIndex].value);
    } else if (suggestion.action === 'shorten') {
      // Shorten is just "concise" tone
      handleToneChange('concise');
    } else if (suggestion.action === 'add_calendar_link') {
      // Add calendar link - append to body
      const calendarLink = '\n\nFeel free to book a time that works for you: [Your Calendar Link]';
      setEmailBody(prev => prev + calendarLink);
      toast.success('Calendar link placeholder added - replace with your actual link');
    }
    // Note: We don't call onActionClick for email actions - all handled in-component
  }, [currentTone, handleToneChange]);

  // Copy email to clipboard
  const handleCopy = useCallback(() => {
    const emailText = `Subject: ${emailSubject}\n\n${emailBody}`;
    navigator.clipboard.writeText(emailText).then(() => {
      toast.success('Email copied to clipboard');
    });
  }, [emailSubject, emailBody]);

  // Open in Gmail
  const handleOpenGmail = useCallback(() => {
    const to = data.data.email.to?.join(',') || '';
    const subject = encodeURIComponent(emailSubject || '');
    const body = encodeURIComponent(emailBody || '');
    window.open(`https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}`, '_blank');
  }, [data.data.email.to, emailSubject, emailBody]);

  return (
    <div className="space-y-3">
      {/* Compact Header with Tone Selector */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {toneOptions.map((tone) => {
            const Icon = tone.icon;
            const isActive = currentTone === tone.value;
            return (
              <button
                key={tone.value}
                type="button"
                onClick={() => handleToneChange(tone.value)}
                disabled={isRegenerating}
                title={tone.description}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                  isActive
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800/40 text-gray-400 hover:bg-gray-800/60 hover:text-gray-300',
                  isRegenerating && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{tone.label}</span>
              </button>
            );
          })}
          {isRegenerating && (
            <div className="flex items-center gap-1.5 px-2 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Adjusting...</span>
            </div>
          )}
        </div>
        
        {/* Quick Actions */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy to clipboard"
            className="p-1.5 rounded-md bg-gray-800/40 text-gray-400 hover:bg-gray-800/60 hover:text-gray-300 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleOpenGmail}
            title="Open in Gmail"
            className="p-1.5 rounded-md bg-gray-800/40 text-gray-400 hover:bg-gray-800/60 hover:text-gray-300 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Email Preview - Compact */}
      <div className={cn(
        "bg-gray-900/60 border border-gray-800/50 rounded-lg overflow-hidden transition-opacity",
        isRegenerating && "opacity-60"
      )}>
        {/* Header */}
        <div className="px-3 py-2 border-b border-gray-800/50 space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-12">To:</span>
            <span className="text-gray-300">{data.data.email.to.join(', ') || 'No recipient'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-12">Subject:</span>
            <span className="text-gray-200 font-medium">{emailSubject}</span>
          </div>
        </div>
        
        {/* Body */}
        <div className="px-3 py-3">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
            {emailBody}
          </pre>
        </div>
      </div>

      {/* Collapsible Context */}
      {data.data.context.keyPoints && data.data.context.keyPoints.length > 0 && (
        <button
          type="button"
          onClick={() => setShowContext(!showContext)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-900/40 border border-gray-800/40 rounded-lg text-xs text-gray-400 hover:bg-gray-900/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Lightbulb className="w-3.5 h-3.5 text-blue-400" />
            <span>Context used ({data.data.context.keyPoints.length} points)</span>
          </div>
          {showContext ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}
      
      {showContext && data.data.context.keyPoints && (
        <div className="px-3 py-2 bg-gray-900/30 border border-gray-800/30 rounded-lg text-xs space-y-1">
          {data.data.context.keyPoints.map((point, i) => (
            <div key={i} className="text-gray-400">• {point}</div>
          ))}
          {data.data.context.warnings && data.data.context.warnings.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-800/30">
              {data.data.context.warnings.map((warning, i) => (
                <div key={i} className="text-amber-400/80">⚠ {warning}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggestion Pills - Compact */}
      {data.data.suggestions && data.data.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.data.suggestions.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              title={suggestion.description}
              className="px-2.5 py-1 bg-gray-800/40 border border-gray-700/40 rounded-md text-xs text-gray-400 hover:bg-gray-800/60 hover:text-gray-300 hover:border-gray-600/50 transition-colors"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}

      {/* Send Time - Inline */}
      {data.data.email.sendTime && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>Best time: {formatTime(data.data.email.sendTime)}</span>
        </div>
      )}
    </div>
  );
};

export default EmailResponse;

