-- Add deal_id to copilot_conversations for per-deal session persistence
ALTER TABLE copilot_conversations
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL;

-- Unique constraint: one conversation per user per deal
CREATE UNIQUE INDEX IF NOT EXISTS idx_copilot_conversations_user_deal
  ON copilot_conversations(user_id, deal_id) WHERE deal_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
