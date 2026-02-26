-- Add signup_source to profiles for tracking how users signed up
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "signup_source" TEXT;

COMMENT ON COLUMN "public"."profiles"."signup_source" IS 'How the user signed up: demo-v2, waitlist, organic, invite, etc.';

-- Create a permanent demo access code in waitlist_invite_codes
INSERT INTO "public"."waitlist_invite_codes" ("code", "is_active")
VALUES ('DEMO60', true)
ON CONFLICT ("code") DO NOTHING;
