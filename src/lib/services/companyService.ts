import type { Company } from '@/lib/database/models';
import { API_BASE_URL } from '@/lib/config';
import logger from '@/lib/utils/logger';

export class CompanyService {
  
  /**
   * Get all companies for the current user with optional search and filters
   */
  static async getCompanies(options?: {
    search?: string;
    domain?: string;
    size?: string;
    industry?: string;
    includeStats?: boolean;
  }) {
    try {
      const params = new URLSearchParams();
      
      if (options?.search) params.append('search', options.search);
      if (options?.includeStats) params.append('includeStats', 'true');
      if (options?.domain) params.append('domain', options.domain);
      if (options?.size) params.append('size', options.size);
      if (options?.industry) params.append('industry', options.industry);

      const response = await fetch(`${API_BASE_URL}/companies?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.data as Company[];
    } catch (error) {
      logger.error('Error fetching companies:', error);
      throw error;
    }
  }

  /**
   * Get a single company by ID with full details
   */
  static async getCompanyById(id: string, includeRelationships = true) {
    try {
      const response = await fetch(`${API_BASE_URL}/companies/${id}?includeRelationships=${includeRelationships}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json() as Company;
    } catch (error) {
      logger.error('Error fetching company:', error);
      throw error;
    }
  }

  /**
   * Find company by domain (for auto-matching)
   */
  static async findCompanyByDomain(domain: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/companies?domain=${encodeURIComponent(domain.toLowerCase())}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.data.length > 0 ? result.data[0] as Company : null;
    } catch (error) {
      logger.error('Error finding company by domain:', error);
      return null;
    }
  }

  /**
   * Extract domain from email address
   */
  static extractDomainFromEmail(email: string): string | null {
    if (!email || !email.includes('@')) return null;
    
    const domain = email.split('@')[1]?.toLowerCase();
    
    // Filter out common personal email domains
    const personalDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
      'icloud.com', 'me.com', 'aol.com', 'live.com'
    ];
    
    if (personalDomains.includes(domain)) return null;
    
    return domain;
  }

  /**
   * Suggest company name from domain
   */
  static suggestCompanyNameFromDomain(domain: string): string {
    if (!domain) return '';
    
    // Remove common TLDs and format as company name
    const name = domain
      .replace(/\.(com|org|net|co\.uk|io|ai|tech)$/i, '')
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    
    return name;
  }

  /**
   * Create a new company with improved error handling and fallback
   */
  static async createCompany(companyData: Omit<Company, 'id' | 'created_at' | 'updated_at'>) {
    try {
      // Validate required data
      if (!companyData.name || !companyData.owner_id) {
        throw new Error('Company name and owner_id are required');
      }

      // Ensure domain is lowercase
      if (companyData.domain) {
        companyData.domain = companyData.domain.toLowerCase();
      }

      logger.log('🏢 Attempting to create company:', companyData.name);

      // Try API endpoint first
      try {
        const { supabase } = await import('@/lib/supabase/clientV2');
        const { data: { session } } = await supabase.auth.getSession();
        
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const response = await fetch(`${API_BASE_URL}/companies`, {
          method: 'POST',
          headers,
          body: JSON.stringify(companyData),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        logger.log('✅ Company created via API:', result.data?.name || result.name);
        return result.data || result;
      } catch (apiError) {
        logger.warn('⚠️ Company API call failed, falling back to Supabase:', apiError);
        
        // Fallback to direct Supabase client
        const { supabase } = await import('@/lib/supabase/clientV2');
        const { data: company, error } = await supabase
          .from('companies')
          .insert(companyData)
          .select()
          .single();
        
        if (error) {
          logger.error('❌ Supabase fallback also failed:', error);
          throw error;
        }
        
        logger.log('✅ Company created via Supabase fallback:', company?.name);
        return company;
      }
    } catch (error) {
      logger.error('🏢 Error creating company:', companyData.name, error);
      throw error;
    }
  }

  /**
   * Update an existing company
   */
  static async updateCompany(id: string, updates: Partial<Company>) {
    try {
      // Ensure domain is lowercase
      if (updates.domain) {
        updates.domain = updates.domain.toLowerCase();
      }

      const response = await fetch(`${API_BASE_URL}/companies/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json() as Company;
    } catch (error) {
      logger.error('Error updating company:', error);
      throw error;
    }
  }

  /**
   * Delete a company
   */
  static async deleteCompany(id: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/companies/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return true;
    } catch (error) {
      logger.error('Error deleting company:', error);
      throw error;
    }
  }

  /**
   * Auto-create company from email domain with improved error handling
   */
  static async autoCreateCompanyFromEmail(
    email: string, 
    owner_id: string,
    suggestedName?: string
  ): Promise<Company | null> {
    try {
      const domain = this.extractDomainFromEmail(email);
      if (!domain) {
        logger.log('🏢 No domain extracted from email - likely personal email:', email);
        return null;
      }

      logger.log('🏢 Checking for existing company with domain:', domain);

      // Check if company already exists
      const existing = await this.findCompanyByDomain(domain);
      if (existing) {
        logger.log('🏢 Found existing company:', existing.name);
        return existing;
      }

      // Create new company — prefer domain-derived name over suggestedName which
      // may be a person's name forwarded from the attendee/contact field.
      const companyName = this.suggestCompanyNameFromDomain(domain) || suggestedName;
      
      logger.log('🏢 Creating new company:', { name: companyName, domain });
      
      const newCompany = await this.createCompany({
        name: companyName,
        domain,
        owner_id: owner_id || 'dev-user-123' // Provide default for development
      });

      if (newCompany) {
        logger.log('🏢 Company created successfully:', newCompany.name);
      } else {
        logger.warn('🏢 Company creation returned null');
      }
      
      return newCompany;
    } catch (error) {
      logger.error('🏢 Error auto-creating company from email:', email, error);
      // Don't throw error - just return null to allow contact creation without company
      return null;
    }
  }

  /**
   * Get company statistics
   */
  static async getCompanyStats(companyId: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/companies/${companyId}/stats`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      logger.error('Error fetching company stats:', error);
      throw error;
    }
  }
} 