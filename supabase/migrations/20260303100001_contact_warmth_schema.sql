-- Migration: RG-001 — Contact Warmth Schema
-- Purpose: Creates 3 tables for the Relationship Graph warmth system:
--          contact_warmth_scores (pre-computed scores), contact_warmth_signals
--          (append-only signal log), and contact_graph_positions (cached graph positions).
-- Date: 2026-03-03

BEGIN;

-- ============================================================================
-- 1. contact_warmth_scores
--    Pre-computed warmth scores per contact, updated by the scoring engine.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contact_warmth_scores (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id              uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    org_id                  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    warmth_score            numeric(4,3) DEFAULT 0.000,
    warmth_score_previous   numeric(4,3) DEFAULT 0.000,
    warmth_delta            numeric(4,3) DEFAULT 0.000,
    tier                    text DEFAULT 'cold' CHECK (tier IN ('hot', 'warm', 'cool', 'cold')),
    recency_score           numeric(4,3) DEFAULT 0.000,
    engagement_score        numeric(4,3) DEFAULT 0.000,
    deal_momentum_score     numeric(4,3) DEFAULT 0.000,
    multi_thread_score      numeric(4,3) DEFAULT 0.000,
    sentiment_score         numeric(4,3) DEFAULT 0.000,
    last_interaction_at     timestamptz,
    last_interaction_type   text,
    signal_count_30d        integer DEFAULT 0,
    trending_direction      text DEFAULT 'stable' CHECK (trending_direction IN ('up', 'down', 'stable')),
    calculated_at           timestamptz DEFAULT now(),
    created_at              timestamptz DEFAULT now(),

    CONSTRAINT uq_warmth_scores_contact_org UNIQUE (contact_id, org_id)
);

-- ============================================================================
-- 2. contact_warmth_signals
--    Append-only log of interaction signals that feed into score computation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contact_warmth_signals (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id      uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    signal_type     text NOT NULL CHECK (signal_type IN (
                        'email_sent', 'email_received', 'email_opened',
                        'meeting_held', 'meeting_booked', 'call_completed',
                        'linkedin_message', 'linkedin_engaged',
                        'page_view', 'proposal_opened', 'form_filled',
                        'event_attended', 'deal_stage_change', 'video_viewed'
                    )),
    signal_weight   numeric(3,2) DEFAULT 1.00,
    metadata        jsonb DEFAULT '{}',
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 3. contact_graph_positions
--    Cached polar coordinates for each contact node in the relationship graph.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contact_graph_positions (
    contact_id  uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
    org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    angle       numeric DEFAULT 0,
    radius      numeric DEFAULT 1,
    cluster_id  uuid,
    updated_at  timestamptz DEFAULT now()
);

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_warmth_scores_contact_org
    ON public.contact_warmth_scores (contact_id, org_id);

CREATE INDEX IF NOT EXISTS idx_warmth_scores_org_tier
    ON public.contact_warmth_scores (org_id, tier);

CREATE INDEX IF NOT EXISTS idx_warmth_signals_contact
    ON public.contact_warmth_signals (contact_id);

CREATE INDEX IF NOT EXISTS idx_warmth_signals_org_occurred
    ON public.contact_warmth_signals (org_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_graph_positions_org
    ON public.contact_graph_positions (org_id);

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.contact_warmth_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_warmth_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_graph_positions ENABLE ROW LEVEL SECURITY;

-- contact_warmth_scores policies
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'contact_warmth_scores' AND policyname = 'warmth_scores_select'
    ) THEN
        CREATE POLICY warmth_scores_select ON public.contact_warmth_scores
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'contact_warmth_scores' AND policyname = 'warmth_scores_insert'
    ) THEN
        CREATE POLICY warmth_scores_insert ON public.contact_warmth_scores
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'contact_warmth_scores' AND policyname = 'warmth_scores_update'
    ) THEN
        CREATE POLICY warmth_scores_update ON public.contact_warmth_scores
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;

-- contact_warmth_signals policies
-- Signals have no user_id column; scope by org membership via scores table.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'contact_warmth_signals' AND policyname = 'warmth_signals_select'
    ) THEN
        CREATE POLICY warmth_signals_select ON public.contact_warmth_signals
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.contact_warmth_scores s
                    WHERE s.org_id = contact_warmth_signals.org_id
                      AND s.user_id = auth.uid()
                )
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'contact_warmth_signals' AND policyname = 'warmth_signals_insert'
    ) THEN
        CREATE POLICY warmth_signals_insert ON public.contact_warmth_signals
            FOR INSERT WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.contact_warmth_scores s
                    WHERE s.org_id = contact_warmth_signals.org_id
                      AND s.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- contact_graph_positions policies
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'contact_graph_positions' AND policyname = 'graph_positions_select'
    ) THEN
        CREATE POLICY graph_positions_select ON public.contact_graph_positions
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'contact_graph_positions' AND policyname = 'graph_positions_insert'
    ) THEN
        CREATE POLICY graph_positions_insert ON public.contact_graph_positions
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'contact_graph_positions' AND policyname = 'graph_positions_update'
    ) THEN
        CREATE POLICY graph_positions_update ON public.contact_graph_positions
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;

-- ============================================================================
-- 6. COLUMN DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.contact_warmth_scores IS 'Pre-computed warmth scores per contact, refreshed by the scoring engine after new signals arrive.';
COMMENT ON COLUMN public.contact_warmth_scores.warmth_score IS 'Composite warmth score in range [0,1]; weighted blend of sub-scores.';
COMMENT ON COLUMN public.contact_warmth_scores.warmth_score_previous IS 'Score value from the prior calculation run, used to compute delta.';
COMMENT ON COLUMN public.contact_warmth_scores.warmth_delta IS 'Change in warmth_score since the last calculation (positive = warming, negative = cooling).';
COMMENT ON COLUMN public.contact_warmth_scores.tier IS 'Human-readable warmth bucket derived from score: hot (≥0.75), warm (≥0.5), cool (≥0.25), cold (<0.25).';
COMMENT ON COLUMN public.contact_warmth_scores.trending_direction IS 'Short-term momentum: up (delta > threshold), down (delta < −threshold), stable otherwise.';
COMMENT ON COLUMN public.contact_warmth_scores.signal_count_30d IS 'Number of signals recorded for this contact in the rolling 30-day window.';

COMMENT ON TABLE public.contact_warmth_signals IS 'Append-only log of interaction events that feed into warmth score computation. Never update or delete rows.';
COMMENT ON COLUMN public.contact_warmth_signals.signal_weight IS 'Override weight for this specific signal instance (defaults to 1.00; higher = stronger impact on score).';
COMMENT ON COLUMN public.contact_warmth_signals.metadata IS 'Arbitrary event metadata (e.g. email subject, meeting title, deal stage names).';

COMMENT ON TABLE public.contact_graph_positions IS 'Cached polar-coordinate positions for contact nodes in the relationship graph UI.';
COMMENT ON COLUMN public.contact_graph_positions.angle IS 'Polar angle (radians) of the contact node relative to the graph centre.';
COMMENT ON COLUMN public.contact_graph_positions.radius IS 'Polar radius; smaller = closer to the user (warmer relationship).';
COMMENT ON COLUMN public.contact_graph_positions.cluster_id IS 'Optional cluster UUID for grouping related contacts (e.g. same company).';

-- ============================================================================
-- Done
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
