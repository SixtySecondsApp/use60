-- Seed staging database with sample deals
-- This is a one-time data seed for testing the pipeline intelligence feature
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING)

-- Temporary disable RLS for seeding
ALTER TABLE deals DISABLE ROW LEVEL SECURITY;

-- Insert sample deals with fixed UUIDs to avoid duplicates
-- Using actual deal_stage IDs from staging database
INSERT INTO deals (
  id,
  name,
  company,
  value,
  stage_id,
  clerk_org_id,
  owner_id,
  created_at,
  updated_at
) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Enterprise SaaS Platform',
    'Acme Corporation',
    250000,
    '8be6a854-e7d0-41b5-9057-03b2213e7697', -- Opportunity
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    NOW(),
    NOW()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Cloud Migration Project',
    'TechStart Inc',
    150000,
    '603b5020-aafc-4646-9195-9f041a9a3f14', -- SQL
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'API Integration Suite',
    'DataFlow Systems',
    75000,
    'e23859a1-50bd-45c0-8790-974d0aab00dd', -- Verbal
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '1 day'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Security Audit & Compliance',
    'FinanceHub Ltd',
    180000,
    '8be6a854-e7d0-41b5-9057-03b2213e7697', -- Opportunity
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '3 days'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'Custom CRM Development',
    'SalesForce Pro',
    320000,
    '207a94db-abd8-43d8-ba21-411be66183d2', -- Signed
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    NOW() - INTERVAL '30 days',
    NOW()
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    'Mobile App Redesign',
    'RetailMax',
    95000,
    '603b5020-aafc-4646-9195-9f041a9a3f14', -- SQL
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '1 day'
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    'Data Analytics Platform',
    'InsightCorp',
    420000,
    '8be6a854-e7d0-41b5-9057-03b2213e7697', -- Opportunity
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '5 days'
  ),
  (
    '88888888-8888-8888-8888-888888888888',
    'E-commerce Integration',
    'ShopStream',
    65000,
    'e23859a1-50bd-45c0-8790-974d0aab00dd', -- Verbal
    '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c',
    'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    NOW() - INTERVAL '12 days',
    NOW() - INTERVAL '2 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Re-enable RLS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

-- Verify insertion
DO $$
DECLARE
  deal_count INTEGER;
  total_value NUMERIC;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(value), 0)
  INTO deal_count, total_value
  FROM deals
  WHERE clerk_org_id = '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';

  RAISE NOTICE 'Seeded % deals with total value of $%', deal_count, total_value;
END $$;
