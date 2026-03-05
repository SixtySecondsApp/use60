/**
 * MeetingTypeBadge
 *
 * IMP-UI-001: Badge for meeting types shown on calendar events and meetings list.
 * Re-exports InternalMeetingTypeBadge for use in calendar contexts.
 *
 * External meetings use CallTypeBadge.
 * Internal meetings (1:1, Pipeline Review, QBR, Standup) use this component.
 */

export {
  InternalMeetingTypeBadge as MeetingTypeBadge,
  INTERNAL_TYPE_CONFIG as MEETING_TYPE_CONFIG,
} from '@/components/meetings/InternalMeetingTypeBadge';
export type {} from '@/components/meetings/InternalMeetingTypeBadge';
