import React from 'react'
import { Routes, Route } from 'react-router-dom'
import UnifiedMeetingsList from '@/components/meetings/UnifiedMeetingsList'
import { MeetingDetail } from '@/pages/MeetingDetail'
import { RecordingDetail } from '@/pages/RecordingDetail'
import { RecordingSettings } from '@/pages/RecordingSettings'

const MeetingsPage: React.FC = () => {
  return (
    <Routes>
      {/* Unified meetings list (Fathom + Fireflies + Voice + 60 Notetaker) */}
      <Route index element={<UnifiedMeetingsList />} />

      {/* Individual meeting detail (Fathom/Fireflies/Voice) */}
      <Route path=":id" element={<MeetingDetail />} />

      {/* 60 Notetaker recording detail & settings */}
      <Route path="recordings/settings" element={<RecordingSettings />} />
      <Route path="recordings/:id" element={<RecordingDetail />} />
    </Routes>
  )
}

export default MeetingsPage