/**
 * Tests for Apify Result Normalizer
 */

import {
  normalizeLinkedInResult,
  normalizeMapsResult,
  normalizeSerpResult,
  normalizeApolloResult,
  normalizeAiArkResult,
  normalizeResult,
  normalizeResults,
  type NormalizedResult
} from '@/lib/utils/apifyResultNormalizer';

describe('LinkedIn Normalizer', () => {
  it('normalizes complete LinkedIn profile', () => {
    const raw = {
      firstName: 'John',
      lastName: 'Doe',
      headline: 'Senior Software Engineer at Tech Corp',
      company: { name: 'Tech Corp' },
      location: 'San Francisco, CA',
      profileUrl: 'https://linkedin.com/in/johndoe'
    };

    const result = normalizeLinkedInResult(raw);

    expect(result.source_provider).toBe('linkedin');
    expect(result.name).toBe('John Doe');
    expect(result.title).toBe('Senior Software Engineer at Tech Corp');
    expect(result.company).toBe('Tech Corp');
    expect(result.location).toBe('San Francisco, CA');
    expect(result.linkedin_url).toBe('https://linkedin.com/in/johndoe');
    expect(result.raw_data).toEqual(raw);
  });

  it('handles missing fields gracefully', () => {
    const raw = {
      firstName: 'Jane',
      headline: 'Product Manager'
    };

    const result = normalizeLinkedInResult(raw);

    expect(result.name).toBe('Jane');
    expect(result.title).toBe('Product Manager');
    expect(result.company).toBeUndefined();
    expect(result.location).toBeUndefined();
  });

  it('handles alternative field names', () => {
    const raw = {
      firstName: 'Bob',
      lastName: 'Smith',
      occupation: 'Developer',
      companyName: 'StartupCo',
      geoLocation: 'Austin, TX',
      url: 'https://linkedin.com/in/bobsmith'
    };

    const result = normalizeLinkedInResult(raw);

    expect(result.title).toBe('Developer');
    expect(result.company).toBe('StartupCo');
    expect(result.location).toBe('Austin, TX');
    expect(result.linkedin_url).toBe('https://linkedin.com/in/bobsmith');
  });
});

describe('Google Maps Normalizer', () => {
  it('normalizes complete Maps business', () => {
    const raw = {
      title: 'Acme Coffee Shop',
      address: '123 Main St, San Francisco, CA 94102',
      phone: '+1-415-555-0100',
      website: 'https://acmecoffee.com',
      rating: 4.5,
      reviewsCount: 234,
      description: 'Best coffee in town'
    };

    const result = normalizeMapsResult(raw);

    expect(result.source_provider).toBe('maps');
    expect(result.name).toBe('Acme Coffee Shop');
    expect(result.company).toBe('Acme Coffee Shop');
    expect(result.address).toBe('123 Main St, San Francisco, CA 94102');
    expect(result.location).toBe('San Francisco');
    expect(result.phone).toBe('+1-415-555-0100');
    expect(result.website).toBe('https://acmecoffee.com');
    expect(result.rating).toBe(4.5);
    expect(result.description).toBe('Best coffee in town');
  });

  it('extracts city from address', () => {
    const raw = {
      title: 'Test Business',
      address: '456 Oak Ave, Austin, TX 78701'
    };

    const result = normalizeMapsResult(raw);

    expect(result.location).toBe('Austin');
  });

  it('handles alternative field names', () => {
    const raw = {
      name: 'Tech Store',
      formattedAddress: '789 Elm St, Boston, MA 02108',
      phoneNumber: '+1-617-555-0200',
      url: 'https://techstore.com',
      stars: 4.8,
      about: 'Premium electronics'
    };

    const result = normalizeMapsResult(raw);

    expect(result.name).toBe('Tech Store');
    expect(result.address).toBe('789 Elm St, Boston, MA 02108');
    expect(result.phone).toBe('+1-617-555-0200');
    expect(result.website).toBe('https://techstore.com');
    expect(result.rating).toBe(4.8);
    expect(result.description).toBe('Premium electronics');
  });
});

describe('Google SERP Normalizer', () => {
  it('normalizes complete SERP result', () => {
    const raw = {
      title: 'TechCorp - Leading AI Solutions',
      link: 'https://www.techcorp.com/products',
      snippet: 'TechCorp provides cutting-edge AI solutions for enterprises.',
      displayedLink: 'www.techcorp.com'
    };

    const result = normalizeSerpResult(raw);

    expect(result.source_provider).toBe('serp');
    expect(result.name).toBe('TechCorp - Leading AI Solutions');
    expect(result.company).toBe('Techcorp');
    expect(result.website).toBe('https://www.techcorp.com/products');
    expect(result.description).toBe('TechCorp provides cutting-edge AI solutions for enterprises.');
  });

  it('extracts company name from URL', () => {
    const raw = {
      title: 'About Us',
      link: 'https://www.example.io/about'
    };

    const result = normalizeSerpResult(raw);

    expect(result.company).toBe('Example');
  });

  it('handles alternative field names', () => {
    const raw = {
      title: 'Product Page',
      link: 'https://startup.app',
      description: 'Innovative app for teams'
    };

    const result = normalizeSerpResult(raw);

    expect(result.description).toBe('Innovative app for teams');
  });
});

describe('Apollo Normalizer', () => {
  it('normalizes complete Apollo contact', () => {
    const raw = {
      first_name: 'Sarah',
      last_name: 'Johnson',
      title: 'VP of Sales',
      organization_name: 'SalesCo',
      email: 'sarah.johnson@salesco.com',
      phone: '+1-555-0123',
      linkedin_url: 'https://linkedin.com/in/sarahjohnson',
      city: 'New York',
      state: 'NY',
      country: 'United States'
    };

    const result = normalizeApolloResult(raw);

    expect(result.source_provider).toBe('apollo');
    expect(result.name).toBe('Sarah Johnson');
    expect(result.title).toBe('VP of Sales');
    expect(result.company).toBe('SalesCo');
    expect(result.email).toBe('sarah.johnson@salesco.com');
    expect(result.phone).toBe('+1-555-0123');
    expect(result.linkedin_url).toBe('https://linkedin.com/in/sarahjohnson');
    expect(result.location).toBe('New York');
  });

  it('handles alternative field names', () => {
    const raw = {
      first_name: 'Mike',
      last_name: 'Chen',
      title: 'CTO',
      company: 'TechStartup',
      sanitized_phone: '+1-555-0456',
      state: 'California'
    };

    const result = normalizeApolloResult(raw);

    expect(result.company).toBe('TechStartup');
    expect(result.phone).toBe('+1-555-0456');
    expect(result.location).toBe('California');
  });

  it('handles missing name fields', () => {
    const raw = {
      title: 'Software Engineer',
      organization_name: 'DevCorp'
    };

    const result = normalizeApolloResult(raw);

    expect(result.name).toBeUndefined();
    expect(result.title).toBe('Software Engineer');
    expect(result.company).toBe('DevCorp');
  });
});

describe('AI Ark Normalizer', () => {
  it('normalizes complete AI Ark contact', () => {
    const raw = {
      profile: {
        first_name: 'Emily',
        last_name: 'Davis',
        title: 'Director of Marketing'
      },
      link: {
        linkedin: 'https://linkedin.com/in/emilydavis'
      },
      location: {
        default: 'Seattle, WA'
      },
      contact: {
        email: 'emily.davis@example.com',
        phone: '+1-206-555-0789'
      },
      experiences: [
        {
          company: {
            name: 'MarketingPro'
          }
        }
      ]
    };

    const result = normalizeAiArkResult(raw);

    expect(result.source_provider).toBe('ai_ark');
    expect(result.name).toBe('Emily Davis');
    expect(result.title).toBe('Director of Marketing');
    expect(result.company).toBe('MarketingPro');
    expect(result.linkedin_url).toBe('https://linkedin.com/in/emilydavis');
    expect(result.location).toBe('Seattle, WA');
    expect(result.email).toBe('emily.davis@example.com');
    expect(result.phone).toBe('+1-206-555-0789');
  });

  it('handles deeply nested optional fields', () => {
    const raw = {
      profile: {
        first_name: 'Alex',
        title: 'Engineer'
      }
    };

    const result = normalizeAiArkResult(raw);

    expect(result.name).toBe('Alex');
    expect(result.title).toBe('Engineer');
    expect(result.company).toBeUndefined();
    expect(result.location).toBeUndefined();
    expect(result.email).toBeUndefined();
  });

  it('gets company from first experience', () => {
    const raw = {
      profile: {
        first_name: 'Chris',
        last_name: 'Lee'
      },
      experiences: [
        { company: { name: 'CurrentCo' } },
        { company: { name: 'PreviousCo' } }
      ]
    };

    const result = normalizeAiArkResult(raw);

    expect(result.company).toBe('CurrentCo');
  });
});

describe('Main Normalizer', () => {
  it('routes to correct provider normalizer', () => {
    const linkedinRaw = { firstName: 'John', lastName: 'Doe' };
    const mapsRaw = { title: 'Coffee Shop' };
    const serpRaw = { title: 'Website', link: 'https://example.com' };
    const apolloRaw = { first_name: 'Jane', last_name: 'Smith' };
    const aiArkRaw = { profile: { first_name: 'Bob' } };

    expect(normalizeResult(linkedinRaw, 'linkedin').source_provider).toBe('linkedin');
    expect(normalizeResult(mapsRaw, 'maps').source_provider).toBe('maps');
    expect(normalizeResult(serpRaw, 'serp').source_provider).toBe('serp');
    expect(normalizeResult(apolloRaw, 'apollo').source_provider).toBe('apollo');
    expect(normalizeResult(aiArkRaw, 'ai_ark').source_provider).toBe('ai_ark');
  });

  it('handles unknown provider with fallback', () => {
    const raw = { name: 'Test Item' };
    const result = normalizeResult(raw, 'unknown_provider');

    expect(result.source_provider).toBe('unknown_provider');
    expect(result.name).toBe('Test Item');
    expect(result.raw_data).toEqual(raw);
  });
});

describe('Batch Normalizer', () => {
  it('normalizes multiple results', () => {
    const results = [
      { firstName: 'Alice', lastName: 'A' },
      { firstName: 'Bob', lastName: 'B' },
      { firstName: 'Charlie', lastName: 'C' }
    ];

    const normalized = normalizeResults(results, 'linkedin');

    expect(normalized).toHaveLength(3);
    expect(normalized[0].name).toBe('Alice A');
    expect(normalized[1].name).toBe('Bob B');
    expect(normalized[2].name).toBe('Charlie C');
    expect(normalized.every(r => r.source_provider === 'linkedin')).toBe(true);
  });

  it('handles empty array', () => {
    const normalized = normalizeResults([], 'linkedin');
    expect(normalized).toEqual([]);
  });
});
