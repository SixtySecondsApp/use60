import type { TypingUser } from '@/lib/hooks/useTypingIndicator';

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((u) => u.displayName);
  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names[0]} and ${names.length - 1} others are typing`;

  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:0ms]" />
        <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:150ms]" />
        <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:300ms]" />
      </span>
    </div>
  );
}
