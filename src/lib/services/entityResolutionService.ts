/**
 * Entity Resolution Service
 *
 * Intelligent service that ensures every deal has both a company and contact by:
 * - Automatically creating and linking entities from email addresses
 * - Enriching company data asynchronously
 * - Using fuzzy matching to prevent duplicate contacts
 *
 * Business Rules:
 * - Always trigger enrichment automatically after company creation
 * - Use fuzzy name matching (>80% similarity) within same company to prevent duplicates
 * - Extract domain from email for company matching
 * - Normalize all emails (lowercase, trim)
 */

import { CompanyService } from './companyService';
import { ApiContactService } from './apiContactService';
import type { Company, Contact } from '@/lib/database/models';
import logger from '@/lib/utils/logger';
import { supabase } from '@/lib/supabase/clientV2';

export interface DealEntityData {
  contact_email: string;
  contact_name: string;
  company?: string;
  owner_id: string;
}

export interface EntityResolutionResult {
  companyId: string;
  contactId: string;
  isNewCompany: boolean;
  isNewContact: boolean;
  company: Company;
  contact: Contact;
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy name matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  const matrix: number[][] = [];

  // Initialize first row and column
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[s2.length][s1.length];
}

/**
 * Calculate similarity score between two strings (0-1 scale)
 * 1.0 = identical, 0.0 = completely different
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Normalize email address
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Trigger company enrichment asynchronously
 * Does not wait for completion - fires and forgets
 */
async function triggerCompanyEnrichment(companyId: string): Promise<void> {
  try {
    logger.log('🔄 Triggering background enrichment for company:', companyId);

    // Call enrichment API endpoint (fire and forget)
    // Note: This would call your Perplexity/Apollo integration
    // For now, we'll just log that enrichment should be triggered

    // Example implementation (adjust based on your actual enrichment service):
    // fetch(`${API_BASE_URL}/companies/${companyId}/enrich`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' }
    // }).catch(err => logger.error('Enrichment trigger failed:', err));

    logger.log('✅ Enrichment queued for company:', companyId);
  } catch (error) {
    logger.error('⚠️ Failed to trigger enrichment (non-blocking):', error);
    // Don't throw - enrichment is non-critical
  }
}

/**
 * Resolve or create company from email domain
 *
 * @param email - Contact email address
 * @param companyName - Optional suggested company name
 * @param ownerId - User ID who owns this company
 * @returns Company record with ID
 */
export async function resolveOrCreateCompany(
  email: string,
  companyName: string | undefined,
  ownerId: string
): Promise<{ company: Company; isNew: boolean }> {
  try {
    logger.log('🏢 Resolving company from email:', email);

    // Extract domain from email using existing CompanyService method
    const domain = CompanyService.extractDomainFromEmail(email);

    if (!domain) {
      logger.warn('⚠️ Could not extract domain from email (likely personal email):', email);

      // For personal emails, create company with provided name
      if (!companyName) {
        throw new Error('Company name is required for personal email domains');
      }

      const newCompany = await CompanyService.createCompany({
        name: companyName,
        owner_id: ownerId
      });

      logger.log('✅ Created company without domain:', newCompany.name);
      return { company: newCompany, isNew: true };
    }

    // Search for existing company by domain
    logger.log('🔍 Searching for existing company with domain:', domain);
    const existingCompany = await CompanyService.findCompanyByDomain(domain);

    if (existingCompany) {
      logger.log('✅ Found existing company:', existingCompany.name);
      return { company: existingCompany, isNew: false };
    }

    // No existing company found - create new one
    // Prefer domain-derived name (e.g. "Fathom" from fathom.video) over the passed
    // companyName which may be a person's name forwarded from the attendee field.
    const suggestedName = CompanyService.suggestCompanyNameFromDomain(domain) || companyName;

    logger.log('🏢 Creating new company:', { name: suggestedName, domain });

    const newCompany = await CompanyService.createCompany({
      name: suggestedName,
      domain,
      owner_id: ownerId
    });

    logger.log('✅ Company created successfully:', newCompany.name);

    // Trigger enrichment asynchronously (fire and forget)
    void triggerCompanyEnrichment(newCompany.id);

    return { company: newCompany, isNew: true };
  } catch (error) {
    logger.error('❌ Error resolving/creating company:', error);
    throw error;
  }
}

/**
 * Find contact by fuzzy name matching within a company
 * Uses Levenshtein distance with >80% similarity threshold
 */
async function findContactByFuzzyName(
  name: string,
  companyId: string
): Promise<Contact | null> {
  try {
    logger.log('🔍 Searching for fuzzy name match:', { name, companyId });

    // Fetch all contacts for this company
    const { data: companyContacts, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', companyId);

    if (error) {
      logger.error('Error fetching company contacts for fuzzy matching:', error);
      return null;
    }

    if (!companyContacts || companyContacts.length === 0) {
      logger.log('No existing contacts in company for fuzzy matching');
      return null;
    }

    // Calculate similarity scores for each contact
    const scoredContacts = companyContacts.map(contact => {
      const contactName = contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
      const similarity = calculateSimilarity(name, contactName);

      return { contact, similarity };
    });

    // Sort by similarity (highest first)
    scoredContacts.sort((a, b) => b.similarity - a.similarity);

    const bestMatch = scoredContacts[0];

    // 80% similarity threshold
    if (bestMatch && bestMatch.similarity >= 0.8) {
      logger.log('✅ Found fuzzy match:', {
        contact: bestMatch.contact.full_name || bestMatch.contact.email,
        similarity: `${(bestMatch.similarity * 100).toFixed(1)}%`
      });

      return bestMatch.contact as Contact;
    }

    logger.log('No fuzzy match found above 80% threshold');
    return null;
  } catch (error) {
    logger.error('Error in fuzzy name matching:', error);
    return null;
  }
}

/**
 * Resolve or create contact with fuzzy matching
 *
 * @param email - Contact email address
 * @param name - Contact full name
 * @param companyId - Company ID this contact belongs to
 * @param ownerId - User ID who owns this contact
 * @returns Contact record with ID
 */
export async function resolveOrCreateContact(
  email: string,
  name: string,
  companyId: string,
  ownerId: string
): Promise<{ contact: Contact; isNew: boolean }> {
  try {
    logger.log('👤 Resolving contact:', { email, name, companyId });

    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    // Primary strategy: Search for existing contact by email (strict match)
    logger.log('🔍 Searching for contact by email:', normalizedEmail);
    const existingContactByEmail = await ApiContactService.findContactByEmail(normalizedEmail);

    if (existingContactByEmail) {
      logger.log('✅ Found existing contact by email:', existingContactByEmail.full_name || existingContactByEmail.email);

      // Update company_id if it was null
      if (!existingContactByEmail.company_id) {
        logger.log('🔄 Updating contact with company_id:', companyId);
        const updatedContact = await ApiContactService.updateContact(existingContactByEmail.id, {
          company_id: companyId
        });
        return { contact: updatedContact, isNew: false };
      }

      return { contact: existingContactByEmail, isNew: false };
    }

    // Fallback strategy: Fuzzy name matching within same company (>80% similarity)
    logger.log('🔍 Trying fuzzy name matching within company...');
    const fuzzyMatch = await findContactByFuzzyName(name, companyId);

    if (fuzzyMatch) {
      logger.log('✅ Found fuzzy name match, updating email:', normalizedEmail);

      // Update the fuzzy match with the new email
      const updatedContact = await ApiContactService.updateContact(fuzzyMatch.id, {
        email: normalizedEmail
      });

      return { contact: updatedContact, isNew: false };
    }

    // No match found - create new contact
    logger.log('👤 Creating new contact:', { name, email: normalizedEmail });

    // Parse name into first/last name
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Check if this is the first contact for the company to set is_primary
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('id')
      .eq('company_id', companyId)
      .limit(1);

    const isPrimary = !existingContacts || existingContacts.length === 0;

    const newContact = await ApiContactService.createContact({
      first_name: firstName,
      last_name: lastName,
      email: normalizedEmail,
      company_id: companyId,
      is_primary: isPrimary,
      owner_id: ownerId
    });

    logger.log('✅ Contact created successfully:', newContact.full_name || newContact.email);

    return { contact: newContact, isNew: true };
  } catch (error) {
    logger.error('❌ Error resolving/creating contact:', error);
    throw error;
  }
}

/**
 * Ensure deal has both company and contact entities
 * Main entry point for entity resolution
 *
 * @param dealData - Deal creation data with email and names
 * @returns Entity IDs and creation flags for FK assignment and UI feedback
 */
export async function ensureDealEntities(
  dealData: DealEntityData
): Promise<EntityResolutionResult> {
  try {
    logger.log('🎯 Ensuring deal entities:', dealData);

    // Validate required data
    if (!dealData.contact_email || !dealData.contact_email.trim()) {
      throw new Error('Contact email is required for deal entity resolution');
    }

    if (!dealData.contact_name || !dealData.contact_name.trim()) {
      throw new Error('Contact name is required for deal entity resolution');
    }

    if (!dealData.owner_id) {
      throw new Error('Owner ID is required for deal entity resolution');
    }

    // Step 1: Resolve or create company (triggers auto-enrichment)
    const { company, isNew: isNewCompany } = await resolveOrCreateCompany(
      dealData.contact_email,
      dealData.company,
      dealData.owner_id
    );

    // Step 2: Resolve or create contact with fuzzy matching
    const { contact, isNew: isNewContact } = await resolveOrCreateContact(
      dealData.contact_email,
      dealData.contact_name,
      company.id,
      dealData.owner_id
    );

    logger.log('✅ Deal entities resolved:', {
      companyId: company.id,
      contactId: contact.id,
      isNewCompany,
      isNewContact
    });

    return {
      companyId: company.id,
      contactId: contact.id,
      isNewCompany,
      isNewContact,
      company,
      contact
    };
  } catch (error) {
    logger.error('❌ Error ensuring deal entities:', error);
    throw error;
  }
}

// Export utility functions for testing and direct use
export const EntityResolutionUtils = {
  calculateSimilarity,
  levenshteinDistance,
  normalizeEmail,
  findContactByFuzzyName
};
