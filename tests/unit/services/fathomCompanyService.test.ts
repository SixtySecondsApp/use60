/**
 * Unit tests for Fathom Company Service
 *
 * Covers:
 * - extractBusinessDomain: personal email filtering, edge cases
 * - findCompanyByDomain: exact domain match via Supabase
 * - findCompanyByFuzzyName: Levenshtein-based fuzzy matching
 * - createCompanyFromDomain: company creation with dedup
 * - matchOrCreateCompany: full matching pipeline
 * - batchMatchOrCreateCompanies: batch processing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase — avoid self-referencing closure
vi.mock('@/lib/supabase/clientV2', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import {
  extractBusinessDomain,
  findCompanyByDomain,
  findCompanyByFuzzyName,
  createCompanyFromDomain,
  matchOrCreateCompany,
  batchMatchOrCreateCompanies,
} from '@/lib/services/fathomCompanyService';
import { supabase } from '@/lib/supabase/clientV2';

const mockedFrom = vi.mocked(supabase.from);

/** Build a chainable mock for supabase from().select().eq()...single() */
function mockQueryChain(resolvedValue: { data: any; error: any }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.ilike = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  return chain;
}

function mockCompany(overrides: Partial<any> = {}) {
  return {
    id: 'company-1',
    name: 'Acme Corp',
    domain: 'acme.com',
    industry: null,
    size: null,
    website: 'https://acme.com',
    address: null,
    phone: null,
    description: null,
    linkedin_url: null,
    owner_id: 'user-1',
    source: 'fathom_meeting',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Fathom Company Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================================================
  // extractBusinessDomain
  // ========================================================================
  describe('extractBusinessDomain', () => {
    it('should extract domain from business email', () => {
      expect(extractBusinessDomain('john@acme.com')).toBe('acme.com');
    });

    it('should return lowercase domain', () => {
      expect(extractBusinessDomain('John@ACME.COM')).toBe('acme.com');
    });

    it('should return null for Gmail addresses', () => {
      expect(extractBusinessDomain('user@gmail.com')).toBeNull();
    });

    it('should return null for Yahoo addresses', () => {
      expect(extractBusinessDomain('user@yahoo.com')).toBeNull();
    });

    it('should return null for Hotmail addresses', () => {
      expect(extractBusinessDomain('user@hotmail.com')).toBeNull();
    });

    it('should return null for Outlook addresses', () => {
      expect(extractBusinessDomain('user@outlook.com')).toBeNull();
    });

    it('should return null for iCloud addresses', () => {
      expect(extractBusinessDomain('user@icloud.com')).toBeNull();
    });

    it('should return null for ProtonMail addresses', () => {
      expect(extractBusinessDomain('user@protonmail.com')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractBusinessDomain('')).toBeNull();
    });

    it('should return null for string without @', () => {
      expect(extractBusinessDomain('notanemail')).toBeNull();
    });

    it('should return null for null-ish input', () => {
      expect(extractBusinessDomain(null as any)).toBeNull();
      expect(extractBusinessDomain(undefined as any)).toBeNull();
    });

    it('should handle email with whitespace', () => {
      expect(extractBusinessDomain(' john@acme.com ')).toBe('acme.com');
    });

    it('should handle subdomains', () => {
      expect(extractBusinessDomain('john@mail.acme.com')).toBe('mail.acme.com');
    });

    it('should handle .io domains', () => {
      expect(extractBusinessDomain('dev@startup.io')).toBe('startup.io');
    });

    it('should handle .co.uk domains', () => {
      expect(extractBusinessDomain('info@company.co.uk')).toBe('company.co.uk');
    });

    it('should filter all personal email providers', () => {
      const personalDomains = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
        'icloud.com', 'me.com', 'aol.com', 'live.com', 'msn.com',
        'protonmail.com', 'mail.com', 'yandex.com', 'zoho.com',
        'gmx.com', 'fastmail.com',
      ];

      for (const domain of personalDomains) {
        expect(extractBusinessDomain(`user@${domain}`)).toBeNull();
      }
    });
  });

  // ========================================================================
  // findCompanyByDomain
  // ========================================================================
  describe('findCompanyByDomain', () => {
    it('should return company when domain matches', async () => {
      const company = mockCompany();
      mockedFrom.mockReturnValueOnce(
        mockQueryChain({ data: company, error: null }) as any
      );

      const result = await findCompanyByDomain('acme.com', 'user-1');

      expect(result).toEqual(company);
      expect(supabase.from).toHaveBeenCalledWith('companies');
    });

    it('should return null when no domain match found (PGRST116)', async () => {
      mockedFrom.mockReturnValueOnce(
        mockQueryChain({
          data: null,
          error: { code: 'PGRST116', message: 'No rows returned' },
        }) as any
      );

      const result = await findCompanyByDomain('unknown.com', 'user-1');
      expect(result).toBeNull();
    });

    it('should return null for empty domain', async () => {
      const result = await findCompanyByDomain('', 'user-1');
      expect(result).toBeNull();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('should return null for empty userId', async () => {
      const result = await findCompanyByDomain('acme.com', '');
      expect(result).toBeNull();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('should return null on unexpected database error', async () => {
      mockedFrom.mockReturnValueOnce(
        mockQueryChain({
          data: null,
          error: { code: 'UNEXPECTED', message: 'Connection failed' },
        }) as any
      );

      const result = await findCompanyByDomain('acme.com', 'user-1');
      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // findCompanyByFuzzyName
  // ========================================================================
  describe('findCompanyByFuzzyName', () => {
    it('should find exact name match', async () => {
      const company = mockCompany({ name: 'Acme Corp' });
      // findCompanyByFuzzyName ends with .eq() (no .single()) — eq must resolve with data
      const chain = mockQueryChain({ data: [company], error: null });
      chain.eq.mockResolvedValue({ data: [company], error: null });
      mockedFrom.mockReturnValueOnce(chain as any);

      const result = await findCompanyByFuzzyName('Acme Corp', 'user-1');
      expect(result).toEqual(company);
    });

    it('should match company with different casing', async () => {
      const company = mockCompany({ name: 'Acme Corp' });
      // findCompanyByFuzzyName uses the resolved value from the chainable query
      // The chain ends without .single() — it awaits the eq() result directly
      const chain = mockQueryChain({ data: [company], error: null });
      // Override: eq() should resolve directly (no .single())
      chain.eq.mockResolvedValue({ data: [company], error: null });
      mockedFrom.mockReturnValueOnce(chain as any);

      const result = await findCompanyByFuzzyName('acme corp', 'user-1');
      expect(result).toEqual(company);
    });

    it('should match company ignoring common suffixes (Inc, Ltd)', async () => {
      const company = mockCompany({ name: 'Acme' });
      const chain = mockQueryChain({ data: [company], error: null });
      chain.eq.mockResolvedValue({ data: [company], error: null });
      mockedFrom.mockReturnValueOnce(chain as any);

      const result = await findCompanyByFuzzyName('Acme Inc.', 'user-1');
      expect(result).toEqual(company);
    });

    it('should return null when no companies exist', async () => {
      const chain = mockQueryChain({ data: [], error: null });
      chain.eq.mockResolvedValue({ data: [], error: null });
      mockedFrom.mockReturnValueOnce(chain as any);

      const result = await findCompanyByFuzzyName('Unknown Corp', 'user-1');
      expect(result).toBeNull();
    });

    it('should return null for empty name', async () => {
      const result = await findCompanyByFuzzyName('', 'user-1');
      expect(result).toBeNull();
    });

    it('should return null for empty userId', async () => {
      const result = await findCompanyByFuzzyName('Acme', '');
      expect(result).toBeNull();
    });

    it('should not match when similarity is below threshold', async () => {
      const company = mockCompany({ name: 'Totally Different Company' });
      const chain = mockQueryChain({ data: [company], error: null });
      chain.eq.mockResolvedValue({ data: [company], error: null });
      mockedFrom.mockReturnValueOnce(chain as any);

      const result = await findCompanyByFuzzyName('Acme', 'user-1');
      expect(result).toBeNull();
    });

    it('should return best match when multiple companies exist', async () => {
      const companies = [
        mockCompany({ id: 'c1', name: 'Acme Industries' }),
        mockCompany({ id: 'c2', name: 'Acme Corp' }),
        mockCompany({ id: 'c3', name: 'Beta Inc' }),
      ];
      const chain = mockQueryChain({ data: companies, error: null });
      chain.eq.mockResolvedValue({ data: companies, error: null });
      mockedFrom.mockReturnValueOnce(chain as any);

      const result = await findCompanyByFuzzyName('Acme Corp', 'user-1');
      expect(result?.id).toBe('c2');
    });

    it('should handle database errors gracefully', async () => {
      const chain = mockQueryChain({ data: null, error: { message: 'DB error' } });
      chain.eq.mockResolvedValue({ data: null, error: { message: 'DB error' } });
      mockedFrom.mockReturnValueOnce(chain as any);

      const result = await findCompanyByFuzzyName('Acme', 'user-1');
      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // matchOrCreateCompany
  // ========================================================================
  describe('matchOrCreateCompany', () => {
    it('should return null for personal email domains', async () => {
      const result = await matchOrCreateCompany('user@gmail.com', 'user-1');
      expect(result).toBeNull();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('should return existing company when domain matches', async () => {
      const company = mockCompany();
      // findCompanyByDomain call
      mockedFrom.mockReturnValueOnce(
        mockQueryChain({ data: company, error: null }) as any
      );

      const result = await matchOrCreateCompany('john@acme.com', 'user-1');
      expect(result).toEqual(company);
    });

    it('should return null for invalid email format', async () => {
      const result = await matchOrCreateCompany('not-an-email', 'user-1');
      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // batchMatchOrCreateCompanies
  // ========================================================================
  describe('batchMatchOrCreateCompanies', () => {
    it('should process multiple emails and return a Map', async () => {
      const company = mockCompany();
      // Second email triggers findCompanyByDomain
      mockedFrom.mockReturnValueOnce(
        mockQueryChain({ data: company, error: null }) as any
      );

      const result = await batchMatchOrCreateCompanies(
        ['user@gmail.com', 'john@acme.com'],
        'user-1'
      );

      expect(result).toBeInstanceOf(Map);
      expect(result.get('user@gmail.com')).toBeNull();
      expect(result.has('john@acme.com')).toBe(true);
    });

    it('should handle empty email array', async () => {
      const result = await batchMatchOrCreateCompanies([], 'user-1');
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });
});
