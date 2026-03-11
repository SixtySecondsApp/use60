import React from 'react'
import { Routes, Route } from 'react-router-dom'
import UnifiedMeetingsList from '@/components/meetings/UnifiedMeetingsList'
import { MeetingDetail } from '@/pages/MeetingDetail'
import { RecordingDetail } from '@/pages/RecordingDetail'
import { RecordingSettings } from '@/pages/RecordingSettings'
import MeetingSettingsHub from '@/pages/meetings/MeetingSettingsHub'
import MeetingRecorderSettingsPage from '@/pages/meetings/MeetingRecorderSettingsPage'
import TourMeetingDetail from '@/pages/TourMeetingDetail'

const MeetingsPage: React.FC = () => {
  return (
    <Routes>
      {/* Unified meetings list (Fathom + Fireflies + Voice + 60 Notetaker) */}
      <Route index element={<UnifiedMeetingsList />} />

      {/* Meeting recorder settings hub */}
      <Route path="settings" element={<MeetingSettingsHub />} />
      <Route path="settings/:recorder" element={<MeetingRecorderSettingsPage />} />

      {/* Product tour demo — must be BEFORE :id so it is matched first */}
      <Route path="tour-demo" element={<TourMeetingDetail />} />

      {/* Individual meeting detail (Fathom/Fireflies/Voice) */}
      <Route path=":id" element={<MeetingDetail />} />

      {/* 60 Notetaker recording detail & settings */}
      <Route path="recordings/settings" element={<RecordingSettings />} />
      <Route path="recordings/:id" element={<RecordingDetail />} />
    </Routes>
  )
}

export default MeetingsPage