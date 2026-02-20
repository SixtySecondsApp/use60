import React, { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoPlayerProps {
  src: string
  poster?: string
  className?: string
  onTimeUpdate?: (currentTime: number) => void
}

export interface VideoPlayerHandle {
  seek: (seconds: number) => void
  play: () => void
  pause: () => void
  get currentTime(): number
  get videoElement(): HTMLVideoElement | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

// Brand gradient (blue → violet)
const BRAND_GRADIENT = 'linear-gradient(90deg, #2A5EDB, #8129D7)'

// Glassmorphism controls background matching the app's .glassmorphism class
const CONTROLS_BG: React.CSSProperties = {
  background: 'rgba(14, 20, 28, 0.82)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderTop: '1px solid rgba(45, 62, 78, 0.5)',
}

// ─── Component ───────────────────────────────────────────────────────────────

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ src, poster, className, onTimeUpdate }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [isPlaying, setIsPlaying] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [volume, setVolume] = useState(1)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [buffered, setBuffered] = useState(0)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [isLoading, setIsLoading] = useState(true)
    const [playbackRate, setPlaybackRate] = useState(1)
    const [showSpeedMenu, setShowSpeedMenu] = useState(false)
    const [isScrubbing, setIsScrubbing] = useState(false)
    const [isHoveringProgress, setIsHoveringProgress] = useState(false)
    const [hoverTime, setHoverTime] = useState(0)
    const [hoverX, setHoverX] = useState(0)

    // Expose imperative handle for external seeking (transcript clicks)
    useImperativeHandle(ref, () => ({
      seek(seconds: number) {
        if (videoRef.current) {
          videoRef.current.currentTime = seconds
          videoRef.current.play().catch(() => {})
        }
      },
      play() { videoRef.current?.play() },
      pause() { videoRef.current?.pause() },
      get currentTime() { return videoRef.current?.currentTime ?? 0 },
      get videoElement() { return videoRef.current },
    }))

    // ── Controls visibility ──────────────────────────────────────────────────

    const resetHideTimer = useCallback(() => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        if (!isScrubbing) setShowControls(false)
      }, 3000)
    }, [isScrubbing])

    const revealControls = useCallback(() => {
      setShowControls(true)
      resetHideTimer()
    }, [resetHideTimer])

    useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }, [])

    // ── Video event handlers ─────────────────────────────────────────────────

    const handlePlay = () => { setIsPlaying(true); resetHideTimer() }
    const handlePause = () => { setIsPlaying(false); setShowControls(true) }
    const handleEnded = () => { setIsPlaying(false); setShowControls(true) }
    const handleWaiting = () => setIsLoading(true)
    const handleCanPlay = () => setIsLoading(false)

    const handleTimeUpdate = useCallback(() => {
      const video = videoRef.current
      if (!video) return
      setCurrentTime(video.currentTime)
      onTimeUpdate?.(video.currentTime)
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
      }
    }, [onTimeUpdate])

    const handleLoadedData = () => {
      if (videoRef.current) {
        setDuration(videoRef.current.duration)
        setIsLoading(false)
      }
    }

    // ── Playback controls ────────────────────────────────────────────────────

    const togglePlay = useCallback(() => {
      const video = videoRef.current
      if (!video) return
      if (video.paused) {
        video.play().catch(() => {})
        revealControls()
      } else {
        video.pause()
      }
    }, [revealControls])

    const skip = useCallback((delta: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + delta))
        revealControls()
      }
    }, [duration, revealControls])

    const toggleMute = useCallback(() => {
      if (videoRef.current) {
        videoRef.current.muted = !videoRef.current.muted
        setIsMuted(videoRef.current.muted)
      }
    }, [])

    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value)
      if (videoRef.current) {
        videoRef.current.volume = v
        videoRef.current.muted = v === 0
      }
      setVolume(v)
      setIsMuted(v === 0)
    }, [])

    const setSpeed = useCallback((speed: number) => {
      if (videoRef.current) videoRef.current.playbackRate = speed
      setPlaybackRate(speed)
      setShowSpeedMenu(false)
    }, [])

    const toggleFullscreen = useCallback(async () => {
      const el = containerRef.current
      if (!el) return
      if (!document.fullscreenElement) {
        await el.requestFullscreen?.()
      } else {
        await document.exitFullscreen?.()
      }
    }, [])

    useEffect(() => {
      const handler = () => setIsFullscreen(!!document.fullscreenElement)
      document.addEventListener('fullscreenchange', handler)
      return () => document.removeEventListener('fullscreenchange', handler)
    }, [])

    // ── Progress bar scrubbing + hover preview ───────────────────────────────

    const getProgressRatio = useCallback((clientX: number) => {
      const bar = progressRef.current
      if (!bar || !duration) return 0
      const rect = bar.getBoundingClientRect()
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    }, [duration])

    const handleProgressMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current
      if (!bar) return
      const rect = bar.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      setHoverTime(ratio * duration)
      setHoverX(e.clientX - rect.left)
      if (isScrubbing && videoRef.current) {
        videoRef.current.currentTime = ratio * duration
        setCurrentTime(ratio * duration)
      }
    }, [duration, isScrubbing])

    const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      setIsScrubbing(true)
      const ratio = getProgressRatio(e.clientX)
      if (videoRef.current) {
        videoRef.current.currentTime = ratio * duration
        setCurrentTime(ratio * duration)
      }
      const onMove = (ev: MouseEvent) => {
        const r = getProgressRatio(ev.clientX)
        if (videoRef.current) {
          videoRef.current.currentTime = r * duration
          setCurrentTime(r * duration)
        }
      }
      const onUp = () => {
        setIsScrubbing(false)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }, [duration, getProgressRatio])

    // ── Keyboard shortcuts ───────────────────────────────────────────────────

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        if (e.code === 'Space') { e.preventDefault(); togglePlay() }
        if (e.code === 'ArrowLeft') { e.preventDefault(); skip(-10) }
        if (e.code === 'ArrowRight') { e.preventDefault(); skip(10) }
        if (e.code === 'KeyM') toggleMute()
        if (e.code === 'KeyF') toggleFullscreen()
      }
      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }, [togglePlay, skip, toggleMute, toggleFullscreen])

    // ── Derived values ───────────────────────────────────────────────────────

    const progress = duration > 0 ? currentTime / duration : 0
    const bufferedProgress = duration > 0 ? buffered / duration : 0
    const controlsVisible = showControls || !isPlaying

    return (
      <div
        ref={containerRef}
        className={cn('relative group bg-black rounded-2xl overflow-hidden select-none', className)}
        onMouseMove={revealControls}
        onMouseLeave={() => { if (isPlaying && !isScrubbing) setShowControls(false) }}
      >
        {/* ── Video element ── */}
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className="w-full h-full block"
          onClick={togglePlay}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          onLoadedData={handleLoadedData}
          onWaiting={handleWaiting}
          onCanPlay={handleCanPlay}
          preload="metadata"
          playsInline
        />

        {/* ── Buffering spinner ── */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(14,20,28,0.7)' }}>
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          </div>
        )}

        {/* ── Center play/pause overlay ── */}
        {!isLoading && (
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center transition-opacity duration-200 pointer-events-none',
              controlsVisible ? 'opacity-100' : 'opacity-0'
            )}
            style={{ pointerEvents: controlsVisible ? 'auto' : 'none' }}
            onClick={togglePlay}
          >
            {/* Only show big button when paused */}
            {!isPlaying && (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-110 cursor-pointer"
                style={{ background: BRAND_GRADIENT, boxShadow: '0 8px 32px rgba(42,94,219,0.4)' }}
              >
                <Play className="h-7 w-7 text-white ml-1" fill="currentColor" />
              </div>
            )}
          </div>
        )}

        {/* ── Bottom gradient fade ── */}
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 h-24 pointer-events-none transition-opacity duration-300',
            controlsVisible ? 'opacity-100' : 'opacity-0'
          )}
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }}
        />

        {/* ── Controls panel ── */}
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 px-4 pb-3 pt-3 transition-opacity duration-300',
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          style={CONTROLS_BG}
        >
          {/* ── Progress bar ── */}
          <div
            ref={progressRef}
            className="relative h-1 rounded-full overflow-visible cursor-pointer mb-3 group/bar"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            onMouseDown={handleProgressMouseDown}
            onMouseMove={handleProgressMouseMove}
            onMouseEnter={() => setIsHoveringProgress(true)}
            onMouseLeave={() => setIsHoveringProgress(false)}
          >
            {/* Buffered */}
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all"
              style={{ width: `${bufferedProgress * 100}%`, background: 'rgba(255,255,255,0.2)' }}
            />
            {/* Played — brand gradient */}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${progress * 100}%`, background: BRAND_GRADIENT }}
            />
            {/* Hover time tooltip */}
            {isHoveringProgress && duration > 0 && (
              <div
                className="absolute -top-7 text-[10px] font-mono text-white px-1.5 py-0.5 rounded pointer-events-none -translate-x-1/2"
                style={{ left: hoverX, background: 'rgba(14,20,28,0.9)' }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
            {/* Thumb dot */}
            <div
              className={cn(
                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full shadow-lg transition-opacity',
                isHoveringProgress || isScrubbing ? 'opacity-100' : 'opacity-0'
              )}
              style={{ left: `${progress * 100}%`, background: 'white', boxShadow: '0 0 0 2px rgba(42,94,219,0.5)' }}
            />
          </div>

          {/* ── Controls row ── */}
          <div className="flex items-center gap-1.5">

            {/* Rewind 10s */}
            <button
              onClick={() => skip(-10)}
              className="text-white/60 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title="Rewind 10s (←)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying
                ? <Pause className="h-4 w-4" fill="currentColor" />
                : <Play className="h-4 w-4 ml-px" fill="currentColor" />
              }
            </button>

            {/* Forward 10s */}
            <button
              onClick={() => skip(10)}
              className="text-white/60 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title="Forward 10s (→)"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>

            {/* Time display */}
            <span className="text-white/50 text-[11px] font-mono tabular-nums ml-0.5">
              {formatTime(currentTime)}
              <span className="text-white/25 mx-1">/</span>
              {formatTime(duration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Volume */}
            <div className="flex items-center gap-1 group/vol">
              <button
                onClick={toggleMute}
                className="text-white/60 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted || volume === 0
                  ? <VolumeX className="h-3.5 w-3.5" />
                  : <Volume2 className="h-3.5 w-3.5" />
                }
              </button>
              <div className="overflow-hidden w-0 group-hover/vol:w-16 transition-all duration-200">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 cursor-pointer"
                  style={{ accentColor: '#2A5EDB' }}
                />
              </div>
            </div>

            {/* Playback speed */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(v => !v)}
                className={cn(
                  'text-[11px] font-mono px-2 py-0.5 rounded-md border transition-colors',
                  playbackRate !== 1
                    ? 'text-white border-blue-500/60 bg-blue-600/20'
                    : 'text-white/60 border-white/20 hover:text-white hover:border-white/40'
                )}
                title="Playback speed"
              >
                {playbackRate === 1 ? '1×' : `${playbackRate}×`}
              </button>

              {showSpeedMenu && (
                <div
                  className="absolute bottom-8 right-0 rounded-xl overflow-hidden shadow-2xl z-10 min-w-[110px]"
                  style={{ background: 'rgba(14,20,28,0.96)', border: '1px solid rgba(45,62,78,0.6)' }}
                >
                  {SPEEDS.map(speed => (
                    <button
                      key={speed}
                      onClick={() => setSpeed(speed)}
                      className={cn(
                        'flex items-center justify-between w-full px-3 py-2 text-xs font-mono transition-colors',
                        speed === playbackRate
                          ? 'text-white bg-blue-600/30'
                          : 'text-white/60 hover:text-white hover:bg-white/8'
                      )}
                    >
                      <span>{speed === 1 ? 'Normal' : `${speed}×`}</span>
                      {speed === playbackRate && (
                        <div className="w-1.5 h-1.5 rounded-full ml-2" style={{ background: BRAND_GRADIENT }} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white/60 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen
                ? <Minimize className="h-3.5 w-3.5" />
                : <Maximize className="h-3.5 w-3.5" />
              }
            </button>
          </div>
        </div>

        {/* Speed menu backdrop */}
        {showSpeedMenu && (
          <div className="fixed inset-0 z-[5]" onClick={() => setShowSpeedMenu(false)} />
        )}
      </div>
    )
  }
)

VideoPlayer.displayName = 'VideoPlayer'
