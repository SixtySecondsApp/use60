/**
 * Join Meeting Modal
 *
 * Modal for manually starting a recording by pasting a meeting link.
 * Supports Zoom, Google Meet, and Microsoft Teams.
 *
 * Attendees are automatically detected from MeetingBaaS webhook (bot.completed)
 * so no manual input is needed here.
 */

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Video, Link2, Bot, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MeetingPlatform } from '@/lib/types/meetingBaaS'

interface JoinMeetingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onJoin: (meetingUrl: string, meetingTitle?: string) => Promise<{ success: boolean; error?: string }>
  isLoading?: boolean
}

// Platform detection helper
const detectPlatform = (url: string): MeetingPlatform | null => {
  if (/zoom\.us\/j\/\d+/i.test(url) || /zoom\.us\/my\//i.test(url)) {
    return 'zoom'
  }
  if (/meet\.google\.com\//i.test(url)) {
    return 'google_meet'
  }
  if (/teams\.microsoft\.com\/l\/meetup-join\//i.test(url) || /teams\.live\.com\/meet\//i.test(url)) {
    return 'microsoft_teams'
  }
  return null
}

// Platform display config
const platformConfig: Record<MeetingPlatform, { label: string; color: string }> = {
  zoom: { label: 'Zoom', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  google_meet: { label: 'Google Meet', color: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
  microsoft_teams: { label: 'Teams', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' },
}

export const JoinMeetingModal: React.FC<JoinMeetingModalProps> = ({
  open,
  onOpenChange,
  onJoin,
  isLoading = false,
}) => {
  const [meetingUrl, setMeetingUrl] = useState('')
  const [meetingTitle, setMeetingTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const detectedPlatform = meetingUrl ? detectPlatform(meetingUrl) : null
  const isValidUrl = !!detectedPlatform

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!meetingUrl.trim()) {
      setError('Please enter a meeting URL')
      return
    }

    if (!detectedPlatform) {
      setError('Please enter a valid Zoom, Google Meet, or Microsoft Teams URL')
      return
    }

    const result = await onJoin(
      meetingUrl.trim(),
      meetingTitle.trim() || undefined
    )

    if (result.success) {
      setMeetingUrl('')
      setMeetingTitle('')
      onOpenChange(false)
    } else {
      setError(result.error || 'Failed to join meeting')
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setMeetingUrl('')
      setMeetingTitle('')
      setError(null)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600/10 dark:bg-emerald-500/20 rounded-xl border border-emerald-600/20 dark:border-emerald-500/20">
              <Bot className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <DialogTitle>Join Meeting</DialogTitle>
              <DialogDescription className="mt-1">
                Paste a meeting link to send the 60 Notetaker bot
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Meeting URL Input */}
          <div className="space-y-2">
            <Label htmlFor="meeting-url" className="text-sm font-medium">
              Meeting URL <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="meeting-url"
                type="url"
                placeholder="https://zoom.us/j/123456789 or meet.google.com/abc-defg-hij"
                value={meetingUrl}
                onChange={(e) => {
                  setMeetingUrl(e.target.value)
                  setError(null)
                }}
                className={cn(
                  'pl-9 pr-24',
                  error && !isValidUrl && 'border-red-500 focus-visible:ring-red-500'
                )}
                disabled={isLoading}
                autoFocus
              />
              {meetingUrl && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {detectedPlatform ? (
                    <Badge
                      variant="outline"
                      className={cn('text-xs gap-1', platformConfig[detectedPlatform].color)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {platformConfig[detectedPlatform].label}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-gray-500 gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Invalid
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Meeting Title Input */}
          <div className="space-y-2">
            <Label htmlFor="meeting-title" className="text-sm font-medium">
              Meeting Title <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <div className="relative">
              <Video className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="meeting-title"
                type="text"
                placeholder="e.g., Weekly Sales Sync"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                className="pl-9"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Supported Platforms Info */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
          >
            <span>Supported:</span>
            <div className="flex gap-1.5">
              <Badge variant="outline" className={cn('text-[10px] py-0', platformConfig.zoom.color)}>
                Zoom
              </Badge>
              <Badge variant="outline" className={cn('text-[10px] py-0', platformConfig.google_meet.color)}>
                Google Meet
              </Badge>
              <Badge variant="outline" className={cn('text-[10px] py-0', platformConfig.microsoft_teams.color)}>
                Teams
              </Badge>
            </div>
          </motion.div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !isValidUrl}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <Bot className="h-4 w-4" />
                  Join Meeting
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default JoinMeetingModal
