import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/clientV2';

export interface DocArticle {
  id?: string;
  slug: string;
  title: string;
  category: string;
  content?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sourceArticles?: DocArticle[];
  suggestedFollowUps?: string[];
  timestamp: Date;
}

export interface FeedbackRecord {
  messageId: string;
  helpful: boolean;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseSourcesFromText(text: string): { cleanText: string; sources: DocArticle[]; followUps: string[] } {
  let cleanText = text;
  let sources: DocArticle[] = [];
  let followUps: string[] = [];

  // Extract <sources> block
  const sourcesMatch = text.match(/<sources>\s*([\s\S]*?)\s*<\/sources>/);
  if (sourcesMatch) {
    cleanText = cleanText.replace(sourcesMatch[0], '').trim();
    try {
      sources = JSON.parse(sourcesMatch[1]);
    } catch {
      // Ignore parse errors
    }
  }

  // Extract <follow_ups> block
  const followUpsMatch = text.match(/<follow_ups>\s*([\s\S]*?)\s*<\/follow_ups>/);
  if (followUpsMatch) {
    cleanText = cleanText.replace(followUpsMatch[0], '').trim();
    try {
      followUps = JSON.parse(followUpsMatch[1]);
    } catch {
      // Ignore parse errors
    }
  }

  return { cleanText, sources, followUps };
}

export function useSupportChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, boolean>>({});
  const conversationHistoryRef = useRef<ConversationMessage[]>([]);

  const sendMessage = useCallback(
    async (query: string) => {
      if (!query.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: query,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // Add to conversation history
      conversationHistoryRef.current.push({ role: 'user', content: query });

      const assistantMessageId = `assistant-${Date.now()}`;

      // Add empty assistant message that we'll stream into
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        },
      ]);

      try {
        // Get the session for auth
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Not authenticated');
        }

        // Get the Supabase URL from the client
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        // Call docs-agent with SSE streaming
        const response = await fetch(`${supabaseUrl}/functions/v1/docs-agent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({
            message: query,
            conversationHistory: conversationHistoryRef.current.slice(0, -1), // exclude current message
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Parse SSE stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let accumulatedText = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7);
              continue;
            }
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (currentEvent === 'tool_start') {
                  setIsSearching(true);
                }

                if (currentEvent === 'tool_result') {
                  // Keep searching true — will be cleared when tokens resume
                }

                if (currentEvent === 'token' && data.text) {
                  setIsSearching(false);
                  accumulatedText += data.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId ? { ...m, content: accumulatedText } : m
                    )
                  );
                }

                if (currentEvent === 'done') {
                  setIsSearching(false);
                }

                if (currentEvent === 'error') {
                  throw new Error(data.message || 'Agent error');
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && parseErr.message !== 'Agent error') {
                  continue;
                }
                throw parseErr;
              }
              currentEvent = '';
            }
          }
        }

        // Parse sources and follow-ups from the final text
        const { cleanText, sources, followUps } = parseSourcesFromText(accumulatedText);

        // Update the assistant message with parsed content
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: cleanText,
                  sourceArticles: sources,
                  suggestedFollowUps:
                    followUps.length > 0
                      ? followUps
                      : [
                          'Can you explain that in more detail?',
                          'How do I set this up step by step?',
                          "What if this doesn't work for me?",
                        ],
                }
              : m
          )
        );

        // Add to conversation history
        conversationHistoryRef.current.push({ role: 'assistant', content: cleanText });
      } catch (err) {
        const errorContent =
          'Sorry, something went wrong while searching our docs. Please try again or open a support ticket.';

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: errorContent,
                  suggestedFollowUps: ['Try asking again', 'Open a support ticket'],
                }
              : m
          )
        );

        // Add error to conversation history so context isn't lost
        conversationHistoryRef.current.push({ role: 'assistant', content: errorContent });
      } finally {
        setIsLoading(false);
        setIsSearching(false);
      }
    },
    [isLoading]
  );

  const giveFeedback = useCallback((messageId: string, helpful: boolean) => {
    setFeedbackGiven((prev) => ({ ...prev, [messageId]: helpful }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setFeedbackGiven({});
    conversationHistoryRef.current = [];
  }, []);

  return {
    messages,
    isLoading,
    isSearching,
    feedbackGiven,
    sendMessage,
    giveFeedback,
    clearMessages,
  };
}
