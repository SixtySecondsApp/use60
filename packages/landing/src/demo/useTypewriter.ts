/**
 * useTypewriter
 *
 * Reveals text character-by-character at a given speed.
 * Returns the visible portion of the string.
 */

import { useState, useEffect, useRef } from 'react';

export function useTypewriter(
  text: string | undefined | null,
  charMs: number = 18,
  enabled: boolean = true
): { displayed: string; isDone: boolean } {
  const safeText = text ?? '';
  const [index, setIndex] = useState(0);
  const frameRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) {
      setIndex(0);
      return;
    }

    if (index >= safeText.length) return;

    frameRef.current = setTimeout(() => {
      setIndex((prev) => prev + 1);
    }, charMs);

    return () => clearTimeout(frameRef.current);
  }, [index, safeText, charMs, enabled]);

  // Reset when text changes
  useEffect(() => {
    setIndex(0);
  }, [safeText]);

  return {
    displayed: safeText.slice(0, index),
    isDone: index >= safeText.length,
  };
}
