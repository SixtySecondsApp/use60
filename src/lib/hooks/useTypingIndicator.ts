import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface TypingUser {
  userId: string;
  displayName: string;
}

const DEBOUNCE_MS = 500;
const CLEAR_TIMEOUT_MS = 3000;

export function useTypingIndicator(ticketId: string) {
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef<number>(0);
  const clearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearUser = useCallback((userId: string) => {
    setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    clearTimersRef.current.delete(userId);
  }, []);

  useEffect(() => {
    if (!ticketId || !user) return;

    const currentUserId = user.id;

    const channel = supabase.channel(`typing:${ticketId}`);

    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { userId, displayName } = payload as TypingUser;

      if (userId === currentUserId) return;

      setTypingUsers((prev) => {
        const exists = prev.some((u) => u.userId === userId);
        if (exists) return prev;
        return [...prev, { userId, displayName }];
      });

      const existing = clearTimersRef.current.get(userId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => clearUser(userId), CLEAR_TIMEOUT_MS);
      clearTimersRef.current.set(userId, timer);
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      for (const timer of clearTimersRef.current.values()) {
        clearTimeout(timer);
      }
      clearTimersRef.current.clear();

      supabase.removeChannel(channel);
      channelRef.current = null;
      setTypingUsers([]);
    };
  }, [ticketId, user, clearUser]);

  const sendTyping = useCallback(() => {
    if (!channelRef.current || !user) return;

    const now = Date.now();
    if (now - lastSentRef.current < DEBOUNCE_MS) return;
    lastSentRef.current = now;

    const displayName =
      user.user_metadata?.first_name ||
      user.user_metadata?.full_name ||
      'Someone';

    channelRef.current
      .send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId: user.id,
          displayName,
        },
      })
      .catch(() => {
        // Silently ignore broadcast errors
      });
  }, [user]);

  return { typingUsers, sendTyping };
}
