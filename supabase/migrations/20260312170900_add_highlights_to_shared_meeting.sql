CREATE OR REPLACE FUNCTION public.get_shared_meeting(p_share_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_meeting record;
  v_attendees jsonb;
  v_voice_recording jsonb;
  v_action_items jsonb;
  v_highlights jsonb;
BEGIN
  SELECT id, title, start_time, duration_minutes, summary,
         transcript_text, source_type, share_url, share_token, share_views,
         share_options, share_mode, voice_recording_id, recording_id, video_url
  INTO v_meeting
  FROM meetings
  WHERE share_token = p_share_token
    AND is_public = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', ma.name,
    'email', ma.email
  )), '[]'::jsonb)
  INTO v_attendees
  FROM meeting_attendees ma
  WHERE ma.meeting_id = v_meeting.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', mai.id,
    'text', mai.title,
    'completed', mai.completed,
    'owner', mai.assignee_name,
    'due_date', mai.deadline_at
  ) ORDER BY mai.created_at), '[]'::jsonb)
  INTO v_action_items
  FROM meeting_action_items mai
  WHERE mai.meeting_id = v_meeting.id;

  IF v_meeting.voice_recording_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', vr.id,
      'duration_seconds', vr.duration_seconds,
      'transcript_segments', vr.transcript_segments,
      'speakers', vr.speakers,
      'share_token', vr.share_token
    )
    INTO v_voice_recording
    FROM voice_recordings vr
    WHERE vr.id = v_meeting.voice_recording_id;
  END IF;

  IF v_meeting.recording_id IS NOT NULL THEN
    SELECT r.highlights
    INTO v_highlights
    FROM recordings r
    WHERE r.id = v_meeting.recording_id;
  END IF;

  UPDATE meetings SET share_views = COALESCE(share_views, 0) + 1
  WHERE id = v_meeting.id;

  RETURN jsonb_build_object(
    'found', true,
    'meeting', jsonb_build_object(
      'id', v_meeting.id,
      'title', v_meeting.title,
      'start_time', v_meeting.start_time,
      'duration_minutes', v_meeting.duration_minutes,
      'summary', v_meeting.summary,
      'action_items', v_action_items,
      'transcript_text', v_meeting.transcript_text,
      'source_type', v_meeting.source_type,
      'share_url', v_meeting.share_url,
      'share_token', v_meeting.share_token,
      'share_views', v_meeting.share_views,
      'share_options', v_meeting.share_options,
      'share_mode', v_meeting.share_mode,
      'voice_recording_id', v_meeting.voice_recording_id,
      'recording_id', v_meeting.recording_id,
      'video_url', v_meeting.video_url,
      'highlights', COALESCE(v_highlights, '[]'::jsonb)
    ),
    'attendees', v_attendees,
    'voice_recording', v_voice_recording
  );
END;
$function$;
