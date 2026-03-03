import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTypewriterResult {
  displayText: string;
  isComplete: boolean;
  reset: () => void;
}

export function useTypewriter(
  text: string,
  speed = 30,
  delay = 0
): UseTypewriterResult {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);

  const cleanup = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setDisplayText('');
    setIsComplete(false);
    indexRef.current = 0;
    setResetKey(k => k + 1);
  }, [cleanup]);

  useEffect(() => {
    setDisplayText('');
    setIsComplete(false);
    indexRef.current = 0;

    if (!text) {
      setIsComplete(true);
      return;
    }

    const startTyping = () => {
      intervalRef.current = setInterval(() => {
        const currentIndex = indexRef.current;
        if (currentIndex >= text.length) {
          cleanup();
          setIsComplete(true);
          return;
        }
        setDisplayText(text.slice(0, currentIndex + 1));
        indexRef.current += 1;
      }, speed);
    };

    if (delay > 0) {
      timeoutRef.current = setTimeout(startTyping, delay);
    } else {
      startTyping();
    }

    return cleanup;
  }, [text, speed, delay, resetKey, cleanup]);

  return { displayText, isComplete, reset };
}
