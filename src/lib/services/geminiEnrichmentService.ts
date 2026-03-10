/**
 * Gemini Enrichment Service
 * 
 * Provides AI-powered enrichment for contacts and companies using Google Gemini 2.5 Flash.
 * This service calls a server-side edge function to avoid exposing API keys.
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { Contact, Company } from '../database/models';
import logger from '../utils/logger';

/**
 * Enriched contact data structure
 */
export interface EnrichedContactData {
  title?: string;
  linkedin_url?: string;
  industry?: string;
  summary?: string;
  confidence?: number;
}

/**
 * Enriched company data structure
 */
export interface EnrichedCompanyData {
  industry?: string;
  size?: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
  description?: string;
  linkedin_url?: string;
  address?: string;
  phone?: string;
  confidence?: number;
}

/**
 * Enrichment result with metadata
 */
export interface EnrichmentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  confidence?: number;
}

/**
 * Enrich a contact with AI-generated data
 * 
 * @param contact - The contact to enrich
 * @returns Enrichment result with enriched data
 */
export async function enrichContact(
  contact: Contact
): Promise<EnrichmentResult<EnrichedContactData>> {
  try {
    const { data, error } = await supabase.functions.invoke('enrich-router', {
      body: {
        action: 'crm_record',
        type: 'contact',
        id: contact.id,
        contact_data: {
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          company_name: contact.company_name,
          company_id: contact.company_id,
        },
      },
    });

    if (error) {
      logger.error('Error enriching contact:', error);
      return {
        success: false,
        error: error.message || 'Failed to enrich contact',
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        error: data?.error || 'Enrichment failed',
      };
    }

    return {
      success: true,
      data: data.enriched_data,
      confidence: data.confidence,
    };
  } catch (error) {
    logger.error('Exception enriching contact:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Enrich a company with AI-generated data
 * 
 * @param company - The company to enrich
 * @returns Enrichment result with enriched data
 */
export async function enrichCompany(
  company: Company
): Promise<EnrichmentResult<EnrichedCompanyData>> {
  try {
    const { data, error } = await supabase.functions.invoke('enrich-router', {
      body: {
        action: 'crm_record',
        type: 'company',
        id: company.id,
        company_data: {
          name: company.name,
          domain: company.domain,
          website: company.website,
          industry: company.industry,
          size: company.size,
        },
      },
    });

    if (error) {
      logger.error('Error enriching company:', error);
      return {
        success: false,
        error: error.message || 'Failed to enrich company',
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        error: data?.error || 'Enrichment failed',
      };
    }

    return {
      success: true,
      data: data.enriched_data,
      confidence: data.confidence,
    };
  } catch (error) {
    logger.error('Exception enriching company:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Bulk enrich multiple contacts
 * 
 * @param contacts - Array of contacts to enrich
 * @param onProgress - Optional progress callback
 * @returns Array of enrichment results
 */
export async function bulkEnrichContacts(
  contacts: Contact[],
  onProgress?: (completed: number, total: number) => void
): Promise<EnrichmentResult<EnrichedContactData>[]> {
  const results: EnrichmentResult<EnrichedContactData>[] = [];
  
  for (let i = 0; i < contacts.length; i++) {
    const result = await enrichContact(contacts[i]);
    results.push(result);
    
    if (onProgress) {
      onProgress(i + 1, contacts.length);
    }
    
    // Rate limiting: wait 500ms between requests to avoid hitting API limits
    if (i < contacts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

/**
 * Bulk enrich multiple companies
 * 
 * @param companies - Array of companies to enrich
 * @param onProgress - Optional progress callback
 * @returns Array of enrichment results
 */
export async function bulkEnrichCompanies(
  companies: Company[],
  onProgress?: (completed: number, total: number) => void
): Promise<EnrichmentResult<EnrichedCompanyData>[]> {
  const results: EnrichmentResult<EnrichedCompanyData>[] = [];
  
  for (let i = 0; i < companies.length; i++) {
    const result = await enrichCompany(companies[i]);
    results.push(result);
    
    if (onProgress) {
      onProgress(i + 1, companies.length);
    }
    
    // Rate limiting: wait 500ms between requests to avoid hitting API limits
    if (i < companies.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

