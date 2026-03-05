import { supabase } from '@/lib/supabase/clientV2';

/**
 * Session context utility for audit logging
 * Helps track user sessions across different actions for better security context
 */

let currentSessionId: string | null = null;

/**
 * Generate a new session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Set the current session ID for audit logging
 */
export function setSessionId(sessionId: string): void {
  currentSessionId = sessionId;
  
  // Store in localStorage for persistence across page refreshes
  localStorage.setItem('audit_session_id', sessionId);
  
  // Set the session ID in the Supabase client context
  // This will be available in the auth context for the audit trigger
  if (typeof window !== 'undefined') {
    // Set a custom setting that can be accessed in the trigger
    // Safely handle RPC call that may not exist — use void+async to avoid .catch() on query builder
    void (async () => {
      try {
        await supabase.rpc('set_config', {
          setting_name: 'app.session_id',
          setting_value: sessionId,
          is_local: true,
        });
      } catch {
        // Non-critical — silently ignore if set_config RPC doesn't exist
      }
    })();
  }
}

/**
 * Get the current session ID
 */
export function getSessionId(): string | null {
  if (currentSessionId) {
    return currentSessionId;
  }
  
  // Try to get from localStorage
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('audit_session_id');
    if (stored) {
      currentSessionId = stored;
      return stored;
    }
  }
  
  return null;
}

/**
 * Initialize a new session
 */
export function initializeSession(): string {
  const sessionId = generateSessionId();
  setSessionId(sessionId);
  return sessionId;
}

/**
 * Clear the current session
 */
export function clearSession(): void {
  currentSessionId = null;
  
  if (typeof window !== 'undefined') {
    localStorage.removeItem('audit_session_id');
  }
}

/**
 * Hook to ensure we have an active session for audit logging
 */
export function useAuditSession(): string {
  let sessionId = getSessionId();
  
  if (!sessionId) {
    sessionId = initializeSession();
  }
  
  return sessionId;
}

/**
 * Execute a function with session context
 * This ensures that all operations within the function are tracked with the same session ID
 */
export async function withSessionContext<T>(
  sessionId: string,
  operation: () => Promise<T>
): Promise<T> {
  const previousSessionId = getSessionId();
  
  try {
    setSessionId(sessionId);
    return await operation();
  } finally {
    if (previousSessionId) {
      setSessionId(previousSessionId);
    } else {
      clearSession();
    }
  }
}