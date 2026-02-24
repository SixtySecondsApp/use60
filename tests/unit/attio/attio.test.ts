/**
 * Tests for the shared Attio API client and value adapters.
 *
 * Covers:
 * - toAttioValues: flat → Attio array format conversion
 * - fromAttioValues: Attio array → flat format extraction
 * - extractAttioField: dot-notation field extraction
 * - buildFilter: query filter construction
 * - AttioClient: API request handling, rate limiting, retry
 * - AttioError: error class behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We import the pure utility functions directly.
// AttioClient is tested via mock fetch.
import {
  toAttioValues,
  fromAttioValues,
  extractAttioField,
  buildFilter,
  AttioClient,
  AttioError,
} from '../../../supabase/functions/_shared/attio.ts';

// ─── toAttioValues ──────────────────────────────────────────────────────────

describe('toAttioValues', () => {
  it('wraps simple string values in [{ value: ... }]', () => {
    const result = toAttioValues({ name: 'Acme Corp' });
    expect(result).toEqual({ name: [{ value: 'Acme Corp' }] });
  });

  it('wraps number values', () => {
    const result = toAttioValues({ score: 42 });
    expect(result).toEqual({ score: [{ value: 42 }] });
  });

  it('wraps boolean values', () => {
    const result = toAttioValues({ active: true });
    expect(result).toEqual({ active: [{ value: true }] });
  });

  it('skips null and undefined values', () => {
    const result = toAttioValues({ a: null, b: undefined, c: 'ok' });
    expect(result).toEqual({ c: [{ value: 'ok' }] });
  });

  it('passes through arrays as-is (already Attio format)', () => {
    const existing = [{ email_address: 'a@b.com' }];
    const result = toAttioValues({ email_addresses: existing });
    expect(result).toEqual({ email_addresses: existing });
  });

  it('handles email field type', () => {
    const result = toAttioValues(
      { email_addresses: 'john@acme.com' },
      { email_addresses: 'email' }
    );
    expect(result).toEqual({
      email_addresses: [{ email_address: 'john@acme.com' }],
    });
  });

  it('handles phone field type', () => {
    const result = toAttioValues(
      { phone_numbers: '+1234567890' },
      { phone_numbers: 'phone' }
    );
    expect(result).toEqual({
      phone_numbers: [{ phone_number: '+1234567890' }],
    });
  });

  it('handles domain field type', () => {
    const result = toAttioValues(
      { domains: 'acme.com' },
      { domains: 'domain' }
    );
    expect(result).toEqual({
      domains: [{ domain: 'acme.com' }],
    });
  });

  it('handles location field type with string', () => {
    const result = toAttioValues(
      { address: '123 Main St' },
      { address: 'location' }
    );
    expect(result).toEqual({
      address: [{ line_1: '123 Main St' }],
    });
  });

  it('handles location field type with object', () => {
    const loc = { line_1: '123 Main St', city: 'Austin' };
    const result = toAttioValues({ address: loc }, { address: 'location' });
    expect(result).toEqual({
      address: [loc],
    });
  });

  it('handles record_reference field type', () => {
    const result = toAttioValues(
      { company: 'rec_abc123' },
      { company: 'record_reference' }
    );
    expect(result).toEqual({
      company: [{ target_record_id: 'rec_abc123' }],
    });
  });

  it('handles empty object', () => {
    expect(toAttioValues({})).toEqual({});
  });

  it('handles multiple fields with mixed types', () => {
    const result = toAttioValues(
      {
        name: 'John',
        email_addresses: 'john@acme.com',
        phone_numbers: '+1555',
        score: 85,
      },
      {
        email_addresses: 'email',
        phone_numbers: 'phone',
      }
    );

    expect(result).toEqual({
      name: [{ value: 'John' }],
      email_addresses: [{ email_address: 'john@acme.com' }],
      phone_numbers: [{ phone_number: '+1555' }],
      score: [{ value: 85 }],
    });
  });
});

// ─── fromAttioValues ────────────────────────────────────────────────────────

describe('fromAttioValues', () => {
  it('extracts full_name from name attribute', () => {
    const result = fromAttioValues({
      name: [{ first_name: 'John', last_name: 'Doe', full_name: 'John Doe' }],
    });
    expect(result.name).toBe('John Doe');
  });

  it('extracts value from simple wrappers', () => {
    const result = fromAttioValues({
      score: [{ value: 42 }],
    });
    expect(result.score).toBe(42);
  });

  it('extracts email_address from email attributes', () => {
    const result = fromAttioValues({
      email_addresses: [{ email_address: 'john@acme.com', is_primary: true }],
    });
    expect(result.email_addresses).toBe('john@acme.com');
  });

  it('extracts phone_number from phone attributes', () => {
    const result = fromAttioValues({
      phone_numbers: [{ phone_number: '+1555', country_code: 'US' }],
    });
    expect(result.phone_numbers).toBe('+1555');
  });

  it('extracts domain from domain attributes', () => {
    const result = fromAttioValues({
      domains: [{ domain: 'acme.com', root_domain: 'acme.com' }],
    });
    expect(result.domains).toBe('acme.com');
  });

  it('returns null for empty arrays', () => {
    const result = fromAttioValues({ name: [] });
    expect(result.name).toBeNull();
  });

  it('returns null for missing arrays', () => {
    const result = fromAttioValues({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('falls back to first primitive value if no known key', () => {
    const result = fromAttioValues({
      custom: [{ some_field: 'hello' }],
    });
    expect(result.custom).toBe('hello');
  });

  it('returns the whole first object if no primitives found', () => {
    const nested = { nested_obj: { deep: true } };
    const result = fromAttioValues({
      custom: [nested],
    });
    expect(result.custom).toEqual(nested);
  });

  it('extracts target_record_id from references', () => {
    const result = fromAttioValues({
      company: [{ target_object: 'companies', target_record_id: 'rec_abc' }],
    });
    expect(result.company).toBe('rec_abc');
  });

  it('handles currency values', () => {
    const result = fromAttioValues({
      deal_value: [{ currency_value: 50000, currency_code: 'USD' }],
    });
    expect(result.deal_value).toBe(50000);
  });

  it('handles multiple attributes at once', () => {
    const result = fromAttioValues({
      name: [{ full_name: 'Jane Smith' }],
      email_addresses: [{ email_address: 'jane@co.com' }],
      score: [{ value: 95 }],
    });
    expect(result).toEqual({
      name: 'Jane Smith',
      email_addresses: 'jane@co.com',
      score: 95,
    });
  });
});

// ─── extractAttioField ──────────────────────────────────────────────────────

describe('extractAttioField', () => {
  const sampleValues = {
    name: [{ first_name: 'John', last_name: 'Doe', full_name: 'John Doe' }],
    email_addresses: [{ email_address: 'john@acme.com', is_primary: true }],
    score: [{ value: 42 }],
  };

  it('extracts a simple attribute (uses fromAttioValues logic)', () => {
    expect(extractAttioField(sampleValues, 'name')).toBe('John Doe');
  });

  it('extracts a dot-notation nested field', () => {
    expect(extractAttioField(sampleValues, 'name.first_name')).toBe('John');
  });

  it('extracts email via dot notation', () => {
    expect(extractAttioField(sampleValues, 'email_addresses.email_address')).toBe('john@acme.com');
  });

  it('returns null for missing attribute', () => {
    expect(extractAttioField(sampleValues, 'nonexistent')).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(extractAttioField({ name: [] }, 'name')).toBeNull();
  });

  it('returns null for deeply missing path', () => {
    expect(extractAttioField(sampleValues, 'name.nonexistent')).toBeNull();
  });
});

// ─── buildFilter ────────────────────────────────────────────────────────────

describe('buildFilter', () => {
  it('builds a simple $and filter', () => {
    const result = buildFilter([
      { attribute: 'email_addresses', field: 'email_address', op: '$eq', value: 'john@acme.com' },
    ]);

    expect(result).toEqual({
      $and: [
        { email_addresses: { email_address: { $eq: 'john@acme.com' } } },
      ],
    });
  });

  it('builds a multi-condition $and filter', () => {
    const result = buildFilter([
      { attribute: 'email_addresses', field: 'email_address', op: '$eq', value: 'john@acme.com' },
      { attribute: 'name', field: 'full_name', op: '$contains', value: 'John' },
    ]);

    expect(result.$and).toHaveLength(2);
    expect(result.$and![0]).toEqual({
      email_addresses: { email_address: { $eq: 'john@acme.com' } },
    });
    expect(result.$and![1]).toEqual({
      name: { full_name: { $contains: 'John' } },
    });
  });

  it('builds an $or filter when specified', () => {
    const result = buildFilter(
      [
        { attribute: 'name', field: 'full_name', op: '$contains', value: 'John' },
        { attribute: 'name', field: 'full_name', op: '$contains', value: 'Jane' },
      ],
      '$or'
    );

    expect(result.$or).toHaveLength(2);
    expect(result.$and).toBeUndefined();
  });

  it('handles operators without explicit value (like $is_empty)', () => {
    const result = buildFilter([
      { attribute: 'email_addresses', field: 'email_address', op: '$is_empty' },
    ]);

    expect(result).toEqual({
      $and: [
        { email_addresses: { email_address: { $is_empty: true } } },
      ],
    });
  });

  it('handles empty conditions array', () => {
    const result = buildFilter([]);
    expect(result).toEqual({ $and: [] });
  });
});

// ─── AttioError ─────────────────────────────────────────────────────────────

describe('AttioError', () => {
  it('creates error with status and message', () => {
    const err = new AttioError({ status: 429, message: 'Rate limited' });
    expect(err.message).toBe('Rate limited');
    expect(err.status).toBe(429);
    expect(err.name).toBe('AttioError');
    expect(err).toBeInstanceOf(Error);
  });

  it('includes retryAfterMs when provided', () => {
    const err = new AttioError({ status: 429, message: 'Rate limited', retryAfterMs: 5000 });
    expect(err.retryAfterMs).toBe(5000);
  });

  it('includes responseBody when provided', () => {
    const body = { error: 'too_many_requests' };
    const err = new AttioError({ status: 429, message: 'Rate limited', responseBody: body });
    expect(err.responseBody).toEqual(body);
  });
});

// ─── AttioClient ────────────────────────────────────────────────────────────

describe('AttioClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetch(response: {
    ok?: boolean;
    status?: number;
    body?: any;
    text?: () => Promise<string>;
    headers?: Headers;
  }) {
    const textFn = response.text ?? (() => Promise.resolve(
      response.body !== undefined ? JSON.stringify(response.body) : '{}'
    ));
    const mock = vi.fn().mockResolvedValue({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      text: textFn,
      headers: response.headers ?? new Headers(),
    });
    globalThis.fetch = mock;
    return mock;
  }

  it('creates a client with access token', () => {
    const client = new AttioClient({ accessToken: 'test-token' });
    expect(client).toBeDefined();
  });

  it('sends GET requests with proper headers', async () => {
    const fetchMock = mockFetch({ body: { data: [] } });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    await client.request({ method: 'GET', path: '/v2/objects/people' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.attio.com/v2/objects/people');
    expect(opts.method).toBe('GET');
    expect(opts.headers['Authorization']).toBe('Bearer test-token');
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('sends POST requests with body', async () => {
    const fetchMock = mockFetch({ body: { data: [] } });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    await client.request({
      method: 'POST',
      path: '/objects/people/records/query',
      body: { filter: { $and: [] }, limit: 10 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ filter: { $and: [] }, limit: 10 });
  });

  it('appends query parameters to URL', async () => {
    const fetchMock = mockFetch({ body: { data: [] } });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    await client.request({
      method: 'GET',
      path: '/objects/people',
      query: { limit: '10', offset: '0' },
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=0');
  });

  it('throws AttioError on non-OK response', async () => {
    mockFetch({
      ok: false,
      status: 404,
      text: () => Promise.resolve('{"error":"not_found"}'),
    });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    await expect(
      client.request({ method: 'GET', path: '/objects/invalid', retries: 0 })
    ).rejects.toThrow(AttioError);
  });

  it('retries on 429 with exponential backoff', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: () => Promise.resolve('rate limited'),
          headers: new Headers({ 'retry-after': '0.1' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: 'success' })),
        headers: new Headers(),
      });
    });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    const result = await client.request({ method: 'GET', path: '/test', retries: 2 });
    expect(result).toEqual({ data: 'success' });
    expect(callCount).toBe(2);
  });

  it('retries on 500 server errors', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
          headers: new Headers(),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: 'recovered' })),
        headers: new Headers(),
      });
    });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    const result = await client.request({ method: 'GET', path: '/test', retries: 2 });
    expect(result).toEqual({ data: 'recovered' });
    expect(callCount).toBe(2);
  });

  // ─── Convenience methods ──────────────────────────────────────────────

  it('queryRecords calls POST /objects/{object}/records/query', async () => {
    const fetchMock = mockFetch({ body: { data: [{ id: { record_id: 'r1' } }] } });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    const result = await client.queryRecords('people', { limit: 5 });
    expect(result.data).toHaveLength(1);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/objects/people/records/query');
    expect(opts.method).toBe('POST');
  });

  it('getRecord calls GET /objects/{object}/records/{id}', async () => {
    const fetchMock = mockFetch({ body: { id: { record_id: 'r1' }, values: {} } });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    await client.getRecord('people', 'r1');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/objects/people/records/r1');
  });

  it('assertRecord calls PUT /objects/{object}/records with matching_attribute', async () => {
    const fetchMock = mockFetch({ body: { id: { record_id: 'r1' }, values: {} } });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    await client.assertRecord('people', { email_addresses: [{ email_address: 'a@b.com' }] }, 'email_addresses');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/objects/people/records');
    expect(url).toContain('matching_attribute=email_addresses');
    expect(opts.method).toBe('PUT');
  });

  it('createRecord calls POST /objects/{object}/records', async () => {
    const fetchMock = mockFetch({ body: { id: { record_id: 'new1' }, values: {} } });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    await client.createRecord('companies', { name: [{ value: 'Test Co' }] });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/objects/companies/records');
    expect(opts.method).toBe('POST');
  });

  it('listLists calls GET /lists', async () => {
    const fetchMock = mockFetch({ body: { data: [{ id: { list_id: 'l1' } }] } });

    const client = new AttioClient({
      accessToken: 'test-token',
      readDelayMs: 0,
      writeDelayMs: 0,
    });

    const result = await client.listLists();
    expect(result.data).toHaveLength(1);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/lists');
  });
});

// ─── Round-trip test ────────────────────────────────────────────────────────

describe('toAttioValues ↔ fromAttioValues round-trip', () => {
  it('round-trips simple values', () => {
    const original = { name: 'Acme Corp', score: 42, active: true };
    const attioFormat = toAttioValues(original);
    const restored = fromAttioValues(attioFormat);

    expect(restored.name).toBe('Acme Corp');
    expect(restored.score).toBe(42);
    expect(restored.active).toBe(true);
  });

  it('round-trips typed values', () => {
    const original = { email_addresses: 'john@acme.com', phone_numbers: '+1555' };
    const typeMap = { email_addresses: 'email', phone_numbers: 'phone' };
    const attioFormat = toAttioValues(original, typeMap);
    const restored = fromAttioValues(attioFormat);

    expect(restored.email_addresses).toBe('john@acme.com');
    expect(restored.phone_numbers).toBe('+1555');
  });
});
