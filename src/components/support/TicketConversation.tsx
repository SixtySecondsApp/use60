import { useRef, useEffect } from 'react';
import { Bot, User, Loader2 } from 'lucide-react';
import { useSupportMessages, type SupportMessage } from '@/lib/hooks/useSupportMessages';
import { useAuth } from '@/lib/contexts/AuthContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TicketConversationProps {
  ticketId: string;
}

function MessageBubble({ message }: { message: SupportMessage }) {
  const { user } = useAuth();
  const isOwn = message.sender_id === user?.id && message.sender_type === 'user';
  const isAgent = message.sender_type === 'agent';
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2.5', isOwn ? 'justify-end' : 'justify-start')}>
      {!isOwn && (
        <div className={cn(
          'p-1.5 rounded-lg h-fit mt-0.5 shrink-0 border',
          isAgent
            ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-100 dark:border-purple-500/20'
            : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        )}>
          {isAgent ? (
            <Bot className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
          ) : (
            <User className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          )}
        </div>
      )}

      <div className={cn('max-w-[75%] space-y-1', isOwn ? 'items-end' : 'items-start')}>
        {!isOwn && (
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium px-1">
            {isAgent ? 'Support Agent' : 'You'}
          </p>
        )}
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-2xl text-sm',
            isOwn
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-sm'
          )}
        >
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
        <p className={cn('text-[11px] text-gray-400 dark:text-gray-500 px-1', isOwn && 'text-right')}>
          {format(new Date(message.created_at), 'MMM d, h:mm a')}
        </p>
      </div>

      {isOwn && (
        <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 h-fit mt-0.5 shrink-0">
          <User className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
        </div>
      )}
    </div>
  );
}

export function TicketConversation({ ticketId }: TicketConversationProps) {
  const { data: messages, isLoading } = useSupportMessages(ticketId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">No messages yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Use the input below to add a reply or more details
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
