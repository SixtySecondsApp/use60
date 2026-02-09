import React, { useEffect, useRef, useState } from 'react'

interface FathomPlayerV2Props {
  shareUrl?: string
  id?: string
  recordingId?: string
  autoplay?: boolean
  startSeconds?: number
  aspectRatio?: string | number
  className?: string
  title?: string
  timeoutMs?: number
  onLoad?: () => void
  onError?: () => void
}

export interface FathomPlayerV2Handle {
  seekToTimestamp: (seconds: number) => void
}

export function extractId(input?: string): string | null {
  if (!input) return null

  try {
    if (/^https?:\/\//i.test(input)) {
      const u = new URL(input)
      const parts = u.pathname.split('/').filter(Boolean)
      return parts.pop() || null
    }
    return input.trim()
  } catch {
    return null
  }
}

export function toEmbedSrc(id: string, opts?: { autoplay?: boolean; timestamp?: number; recordingId?: string }) {
  // Use the fathom.video/embed format for better compatibility
  // Fall back to app.fathom.video/recording if recordingId is provided
  const embedPath = opts?.recordingId
    ? `https://app.fathom.video/recording/${opts.recordingId}`
    : `https://fathom.video/embed/${id}`

  const url = new URL(embedPath)

  if (opts && typeof opts.autoplay === 'boolean') {
    url.searchParams.set('autoplay', opts.autoplay ? '1' : '0')
  }

  if (opts && typeof opts.timestamp === 'number' && !Number.isNaN(opts.timestamp) && opts.timestamp > 0) {
    url.searchParams.set('timestamp', String(Math.floor(opts.timestamp)))
  }

  return url.toString()
}

/**
 * FathomPlayerV2 - Improved version with timeout handling and fallback UI
 *
 * Key improvements over FathomPlayer:
 * - Timeout detection (default 6 seconds)
 * - Loading state indicator
 * - Fallback UI when iframe fails to load
 * - "Open in Fathom" button as escape hatch
 * - onLoad and onError callbacks for debugging
 */
const FathomPlayerV2 = React.forwardRef<FathomPlayerV2Handle, FathomPlayerV2Props>(({
  shareUrl,
  id,
  recordingId,
  autoplay = false,
  startSeconds = 0,
  aspectRatio = '16 / 9',
  className = '',
  title = 'Fathom video',
  timeoutMs = 6000,
  onLoad,
  onError
}, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const timeoutRef = useRef<number | null>(null)
  const [currentSrc, setCurrentSrc] = useState<string>('')
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [seekKey, setSeekKey] = useState(0)

  const resolvedId = id ?? extractId(shareUrl)

  useEffect(() => {
    if (resolvedId || recordingId) {
      // Build embed URL; append #t=SECONDS for timestamp seeking
      // Fathom uses the #t= hash fragment format (per their API docs)
      let src = toEmbedSrc(resolvedId || '', { autoplay, recordingId })
      if (startSeconds > 0) {
        src += `#t=${Math.floor(startSeconds)}`
      }
      setCurrentSrc(src)
      setLoaded(false)
      setFailed(false)
    }
  }, [resolvedId, recordingId, autoplay, startSeconds, seekKey])

  // Timeout handler
  useEffect(() => {
    if (!resolvedId && !recordingId) return

    // Clear any existing timeout
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // Set new timeout
    timeoutRef.current = window.setTimeout(() => {
      if (!loaded) {
        setFailed(true)
        onError?.()
      }
    }, timeoutMs)

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [resolvedId, recordingId, timeoutMs, onError])

  // Seek by rebuilding the embed URL with #t= and forcing iframe remount via key
  const seekToTimestamp = (seconds: number) => {
    if (resolvedId || recordingId) {
      let src = toEmbedSrc(resolvedId || '', { autoplay: true, recordingId })
      if (seconds > 0) {
        src += `#t=${Math.floor(seconds)}`
      }
      setCurrentSrc(src)
      setSeekKey(prev => prev + 1) // Force iframe remount for clean load
      setLoaded(false)
      setFailed(false)
    }
  }

  // Expose seekToTimestamp method via ref to parent components
  React.useImperativeHandle(ref, () => ({ seekToTimestamp }), [resolvedId, recordingId])

  const handleIframeLoad = () => {
    setLoaded(true)
    setFailed(false)

    // Clear timeout when loaded successfully
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    onLoad?.()
  }

  const openInFathom = () => {
    const q = startSeconds ? `?timestamp=${Math.floor(startSeconds)}` : ''
    const url = `https://fathom.video/share/${resolvedId}${q}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (!resolvedId && !recordingId && !shareUrl) return null

  return (
    <div
      className={`relative w-full bg-black rounded-2xl overflow-hidden ${className}`}
      style={{
        aspectRatio: typeof aspectRatio === 'number'
          ? String(aspectRatio)
          : aspectRatio
      }}
    >
      {!failed && (
        <iframe
          key={seekKey}
          ref={iframeRef}
          src={currentSrc || (shareUrl ? toEmbedSrc(extractId(shareUrl) || '', { autoplay, recordingId }) : '')}
          title={title}
          className="absolute inset-0 w-full h-full border-0"
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          onLoad={handleIframeLoad}
        />
      )}

      {/* Loading State */}
      {!loaded && !failed && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-200 dark:text-gray-300 text-sm bg-gray-900/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 dark:border-gray-400"></div>
            <div className="text-sm">Loading video…</div>
          </div>
        </div>
      )}

      {/* Fallback UI */}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-950 text-gray-200 dark:text-gray-300 p-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <svg
              className="w-12 h-12 text-gray-500 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="text-base font-medium">Couldn't load the embedded video</div>
          </div>

          <div className="text-xs text-gray-400 max-w-md">
            Some environments block third-party iframes. The video failed to load within {timeoutMs / 1000} seconds.
          </div>

          <button
            onClick={openInFathom}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-sm transition-colors flex items-center gap-2"
          >
            <span>Open in Fathom</span>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </button>

          {resolvedId && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono">
              ID: {resolvedId}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

FathomPlayerV2.displayName = 'FathomPlayerV2'

export default FathomPlayerV2
