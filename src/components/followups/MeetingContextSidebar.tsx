import React from 'react';

interface MeetingContextSidebarProps {
  meetingId: string;
}

export function MeetingContextSidebar({ meetingId }: MeetingContextSidebarProps) {
  return (
    <div className="p-4 text-sm text-gray-500">Meeting context placeholder</div>
  );
}
