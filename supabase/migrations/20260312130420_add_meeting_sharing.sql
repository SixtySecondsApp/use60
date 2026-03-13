-- Add sharing columns to meetings table
-- Enables public link sharing with granular content controls
-- Source: _migrations_archive/20260103000050_add_meeting_sharing.sql (was never applied)

ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS share_token uuid DEFAULT gen_random_uuid() UNIQUE,
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS share_views integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS share_options jsonb DEFAULT '{"include_summary": true, "include_action_items": true, "include_transcript": false, "include_recording": true}'::jsonb;

-- Index for share_token lookups (only for public meetings)
CREATE INDEX IF NOT EXISTS idx_meetings_share_token
ON meetings(share_token) WHERE is_public = true;

-- RPC to increment meeting share views (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION increment_meeting_views(p_share_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE meetings
  SET share_views = share_views + 1
  WHERE share_token = p_share_token AND is_public = true;
END;
$$;

-- Grant access to the RPC
GRANT EXECUTE ON FUNCTION increment_meeting_views(uuid) TO anon;
GRANT EXECUTE ON FUNCTION increment_meeting_views(uuid) TO authenticated;

-- RLS policy: anyone can view a public shared meeting via share_token
DROP POLICY IF EXISTS "Public can view shared meetings" ON meetings;
CREATE POLICY "Public can view shared meetings" ON meetings
FOR SELECT
USING (is_public = true AND share_token IS NOT NULL);

-- Comments
COMMENT ON COLUMN meetings.share_token IS 'Unique token for public sharing URL';
COMMENT ON COLUMN meetings.is_public IS 'Whether the meeting is publicly accessible via share link';
COMMENT ON COLUMN meetings.share_views IS 'Number of times the shared meeting has been viewed';
COMMENT ON COLUMN meetings.share_options IS 'JSON object: include_summary, include_action_items, include_transcript, include_recording';
