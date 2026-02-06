import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Users,
  Mail,
  Phone,
  Building2,
  Plus,
  X,
  CheckCircle,
  UserPlus,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { useContacts } from '@/lib/hooks/useContacts';
import { useUser } from '@/lib/hooks/useUser';
import { useCompanies } from '@/lib/hooks/useCompanies';
import { LinkedInEnrichmentService } from '@/lib/services/linkedinEnrichmentService';
import { cn } from '@/lib/utils';
import logger from '@/lib/utils/logger';

interface ContactSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContactSelect: (contact: any) => void;
  prefilledEmail?: string;
  prefilledName?: string;
}

interface NewContactForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company_website: string;
  job_title: string;
}

// Animation variants matching Command Center spring physics
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const panelVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.2 },
  },
};

const createFormVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 350, damping: 30 },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.15 },
  },
};

export function ContactSearchModal({
  isOpen,
  onClose,
  onContactSelect,
  prefilledEmail = '',
  prefilledName = ''
}: ContactSearchModalProps) {
  const { userData } = useUser();
  const { contacts, isLoading, searchContacts, createContact, findContactByEmail, fetchContacts } = useContacts();
  const { createCompany, companies } = useCompanies();


  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [allContacts, setAllContacts] = useState<any[]>([]);

  const [newContactForm, setNewContactForm] = useState<NewContactForm>({
    first_name: '',
    last_name: '',
    email: prefilledEmail,
    phone: '',
    company_website: '',
    job_title: ''
  });

  // List of personal email domains to exclude from website pre-population
  const personalEmailDomains = [
    'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com',
    'aol.com', 'live.com', 'msn.com', 'yahoo.co.uk', 'googlemail.com',
    'me.com', 'mac.com', 'protonmail.com', 'tutanota.com'
  ];

  // Extract website from email domain
  const extractWebsiteFromEmail = (email: string): string => {
    if (!email || !email.includes('@')) return '';

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return '';

    // Don't pre-populate for personal email domains
    if (personalEmailDomains.includes(domain)) return '';

    return `www.${domain}`;
  };

  // Extract first and last name from email username
  const extractNamesFromEmail = (email: string): { firstName: string; lastName: string } => {
    if (!email || !email.includes('@')) return { firstName: '', lastName: '' };

    const username = email.split('@')[0];
    if (!username) return { firstName: '', lastName: '' };

    // Helper function to capitalize first letter
    const capitalize = (str: string): string => {
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    // Remove common prefixes and suffixes
    const cleanedUsername = username
      .replace(/^(mr|mrs|ms|dr|prof)\.?/i, '') // Remove titles
      .replace(/\d+$/, '') // Remove trailing numbers
      .replace(/[_-]+$/, ''); // Remove trailing separators

    // Pattern 1: first.last or first_last
    if (cleanedUsername.includes('.') || cleanedUsername.includes('_')) {
      const separator = cleanedUsername.includes('.') ? '.' : '_';
      const parts = cleanedUsername.split(separator);

      if (parts.length >= 2 && parts[0].length > 0 && parts[1].length > 0) {
        return {
          firstName: capitalize(parts[0]),
          lastName: capitalize(parts.slice(1).join(' ')) // Join remaining parts as last name
        };
      }
    }

    // Pattern 2: firstName + LastName (camelCase)
    const camelCaseMatch = cleanedUsername.match(/^([a-z]+)([A-Z][a-z]+)$/);
    if (camelCaseMatch) {
      return {
        firstName: capitalize(camelCaseMatch[1]),
        lastName: capitalize(camelCaseMatch[2])
      };
    }

    // Pattern 3: firstlast (all lowercase, try to split common names)
    // Only do this for longer usernames to avoid false positives
    if (cleanedUsername.length > 6 && /^[a-z]+$/.test(cleanedUsername)) {
      // Common first names to look for (simplified list)
      const commonFirstNames = [
        'andrew', 'john', 'jane', 'michael', 'sarah', 'david', 'mary', 'chris', 'alex', 'sam',
        'james', 'emma', 'robert', 'lisa', 'william', 'jessica', 'thomas', 'ashley', 'daniel',
        'emily', 'matthew', 'amanda', 'mark', 'melissa', 'paul', 'jennifer', 'kevin', 'nicole'
      ];

      for (const firstName of commonFirstNames) {
        if (cleanedUsername.startsWith(firstName) && cleanedUsername.length > firstName.length) {
          const remainingPart = cleanedUsername.slice(firstName.length);
          if (remainingPart.length > 1) { // Ensure there's something left for last name
            return {
              firstName: capitalize(firstName),
              lastName: capitalize(remainingPart)
            };
          }
        }
      }
    }

    // Pattern 4: Just use the whole username as first name if it's reasonable length
    if (cleanedUsername.length >= 2 && cleanedUsername.length <= 15 && /^[a-zA-Z]+$/.test(cleanedUsername)) {
      return {
        firstName: capitalize(cleanedUsername),
        lastName: ''
      };
    }

    return { firstName: '', lastName: '' };
  };

  // Parse prefilled name into first/last name
  useEffect(() => {
    if (prefilledName && !newContactForm.first_name && !newContactForm.last_name) {
      const nameParts = prefilledName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ');

      setNewContactForm(prev => ({
        ...prev,
        first_name: firstName,
        last_name: lastName
      }));
    }
  }, [prefilledName, newContactForm.first_name, newContactForm.last_name]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      fetchContacts(); // Fetch contacts when modal opens
      setSearchQuery(prefilledEmail || '');
      setShowCreateForm(false);
      const suggestedWebsite = prefilledEmail ? extractWebsiteFromEmail(prefilledEmail) : '';
      const extractedNames = prefilledEmail ? extractNamesFromEmail(prefilledEmail) : { firstName: '', lastName: '' };

      // Use prefilled name if available, otherwise use extracted names from email
      const firstName = prefilledName ? prefilledName.split(' ')[0] || '' : extractedNames.firstName;
      const lastName = prefilledName ? prefilledName.split(' ').slice(1).join(' ') : extractedNames.lastName;

      setNewContactForm({
        first_name: firstName,
        last_name: lastName,
        email: prefilledEmail,
        phone: '',
        company_website: suggestedWebsite,
        job_title: ''
      });

      // Fetch all contacts when modal opens
      fetchAllContacts();

      // Auto-search if we have a prefilled email
      if (prefilledEmail) {
        handleSearch(prefilledEmail);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefilledEmail, prefilledName]); // Intentionally limited dependencies to prevent re-renders

  // Fetch all contacts for initial display
  const fetchAllContacts = async () => {
    if (!isOpen) return;

    // If we already have contacts from the hook, use them
    if (contacts && contacts.length > 0) {
      setAllContacts(contacts);
      if (!searchQuery.trim()) {
        setSearchResults(contacts);
      }
      return;
    }

    setIsSearching(true);
    try {
      // Fetch contacts without search term to get all
      const results = await searchContacts('', true); // Explicitly pass includeCompany: true
      setAllContacts(results || []);
      // If no search query, also set as search results
      if (!searchQuery.trim()) {
        setSearchResults(results || []);
      }
    } catch (error) {
      logger.error('Error fetching all contacts:', error);
      logger.error('Error stack:', error.stack);
      setAllContacts([]);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      // If query is empty, show all contacts
      setSearchResults(allContacts);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchContacts(query.trim(), true); // Explicitly pass includeCompany: true
      logger.log('Search results for', query, ':', results);
      setSearchResults(results || []);
    } catch (error) {
      logger.error('Search error:', error);
      toast.error('Failed to search contacts');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleContactSelect = (contact: any) => {
    onContactSelect(contact);
    onClose();
  };

  // Helper function to auto-create company from website
  const autoCreateCompany = async (website: string, email: string): Promise<any | null> => {
    if (!website || !userData?.id) return null;

    try {
      // Extract domain from website
      const domain = website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];

      // Extract company name from domain (remove .com, .co.uk, etc.)
      const domainParts = domain.split('.');
      const companyName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);

      // Check if company already exists with this domain
      const existingCompany = companies?.find(company =>
        company.domain?.toLowerCase() === domain.toLowerCase() ||
        company.website?.toLowerCase().includes(domain.toLowerCase())
      );

      if (existingCompany) {
        return existingCompany;
      }

      // Create new company
      const companyData = {
        name: companyName,
        domain: domain,
        website: website,
        owner_id: userData.id
      };

      const newCompany = await createCompany(companyData);
      logger.log('Auto-created company:', newCompany);
      return newCompany;
    } catch (error) {
      logger.error('Error auto-creating company:', error);
      return null;
    }
  };

  const handleCreateContact = async () => {
    if (!newContactForm.email || !newContactForm.first_name) {
      toast.error('Email and first name are required');
      return;
    }

    setIsCreating(true);
    try {
      // Check if contact already exists
      const existingContact = await findContactByEmail(newContactForm.email);
      if (existingContact) {
        toast.error('A contact with this email already exists');
        handleContactSelect(existingContact);
        return;
      }

      // Auto-create company if website is provided
      let company = null;
      if (newContactForm.company_website) {
        company = await autoCreateCompany(newContactForm.company_website, newContactForm.email);
      }

      const contactData = {
        first_name: newContactForm.first_name,
        last_name: newContactForm.last_name,
        email: newContactForm.email,
        phone: newContactForm.phone || null,
        title: newContactForm.job_title || null,  // Map job_title to title for API
        company_id: company?.id || null, // Link to auto-created company
        owner_id: userData?.id || ''
      };

      const newContact = await createContact(contactData);

      if (newContact) {
        const successMessage = company
          ? `Contact and company "${company.name}" created successfully!`
          : 'Contact created successfully!';
        toast.success(successMessage);

        // Trigger background enrichment
        const fullName = `${contactData.first_name} ${contactData.last_name || ''}`.trim();
        LinkedInEnrichmentService.enrichContactProfile(
          newContact.id,
          fullName,
          contactData.email,
          company?.name || ''
        ).then(success => {
          if (success) toast.success('Contact profile enriched with LinkedIn data');
        });

        // Attach the website and company information to the contact object
        const enrichedContact = {
          ...newContact,
          company_website: newContactForm.company_website,
          company_name: company?.name,
          company_id: company?.id,
          company: company?.name || '', // Pass just the company name string, not the object to avoid React render errors
          _form_website: newContactForm.company_website // Temporary field for passing website info
        };
        handleContactSelect(enrichedContact);
      }
    } catch (error) {
      logger.error('Error creating contact:', error);
      toast.error('Failed to create contact');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredResults = useMemo(() => {
    // Always use searchResults if we have a search query
    if (searchQuery.trim()) {
      return searchResults;
    }
    // Otherwise show all contacts
    return allContacts?.length > 0 ? allContacts : searchResults;
  }, [searchQuery, searchResults, allContacts]);

  const inputClass = 'w-full px-3 py-2.5 bg-gray-800/60 border border-gray-700/40 rounded-xl text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[80dvh] overflow-hidden shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/50 bg-gray-900/50 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                {showCreateForm ? (
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="p-1.5 -ml-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-all"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-violet-400" />
                  </div>
                )}
                <div>
                  <h2 className="text-base font-semibold text-gray-100">
                    {showCreateForm ? 'Create Contact' : 'Select Contact'}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {showCreateForm ? 'Fill in the details below' : 'Search or create a new contact'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <AnimatePresence mode="wait">
              {showCreateForm ? (
                /* ─── Create Form ─── */
                <motion.div
                  key="create-form"
                  variants={createFormVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="flex flex-col"
                >
                  <div className="overflow-y-auto p-5 max-h-[calc(80dvh-8rem)]">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1.5">First Name *</label>
                          <input
                            type="text"
                            placeholder="John"
                            value={newContactForm.first_name}
                            onChange={(e) => setNewContactForm(prev => ({
                              ...prev,
                              first_name: e.target.value
                            }))}
                            className={inputClass}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1.5">Last Name</label>
                          <input
                            type="text"
                            placeholder="Smith"
                            value={newContactForm.last_name}
                            onChange={(e) => setNewContactForm(prev => ({
                              ...prev,
                              last_name: e.target.value
                            }))}
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Email *</label>
                        <input
                          type="email"
                          placeholder="john@company.com"
                          value={newContactForm.email}
                          onChange={(e) => {
                            const newEmail = e.target.value;
                            const suggestedWebsite = extractWebsiteFromEmail(newEmail);
                            const extractedNames = extractNamesFromEmail(newEmail);

                            setNewContactForm(prev => ({
                              ...prev,
                              email: newEmail,
                              company_website: (!prev.company_website || prev.company_website.startsWith('www.'))
                                ? suggestedWebsite
                                : prev.company_website,
                              first_name: (!prev.first_name && extractedNames.firstName)
                                ? extractedNames.firstName
                                : prev.first_name,
                              last_name: (!prev.last_name && extractedNames.lastName)
                                ? extractedNames.lastName
                                : prev.last_name
                            }));
                          }}
                          className={inputClass}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Phone</label>
                        <input
                          type="tel"
                          placeholder="+44 7911 123456"
                          value={newContactForm.phone}
                          onChange={(e) => setNewContactForm(prev => ({
                            ...prev,
                            phone: e.target.value
                          }))}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Company Website</label>
                        <input
                          type="text"
                          placeholder="www.company.com"
                          value={newContactForm.company_website}
                          onChange={(e) => {
                            let website = e.target.value.trim();

                            // Auto-add www. if user enters a domain without it
                            if (website && !website.startsWith('www.') && !website.startsWith('http')) {
                              // Check if it looks like a domain (has a dot and no spaces)
                              if (website.includes('.') && !website.includes(' ')) {
                                website = `www.${website}`;
                              }
                            }

                            setNewContactForm(prev => ({
                              ...prev,
                              company_website: website
                            }));
                          }}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Job Title</label>
                        <input
                          type="text"
                          placeholder="Sales Director"
                          value={newContactForm.job_title}
                          onChange={(e) => setNewContactForm(prev => ({
                            ...prev,
                            job_title: e.target.value
                          }))}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Create button */}
                  <div className="px-5 py-4 border-t border-gray-800/50">
                    <button
                      type="button"
                      onClick={handleCreateContact}
                      disabled={!newContactForm.email || !newContactForm.first_name || isCreating}
                      className={cn(
                        'w-full px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all',
                        newContactForm.email && newContactForm.first_name && !isCreating
                          ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40'
                          : 'bg-gray-800 text-gray-500 cursor-not-allowed',
                      )}
                    >
                      {isCreating ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Create &amp; Select Contact
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* ─── Search View ─── */
                <motion.div
                  key="search-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
                  className="flex flex-col"
                >
                  {/* Search Input */}
                  <div className="px-5 py-4 border-b border-gray-800/50">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name, email, or company..."
                        className="w-full pl-10 pr-10 py-3 bg-gray-800/60 border border-gray-700/40 rounded-xl text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
                        autoFocus
                      />
                      {isSearching && searchQuery && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-gray-600 border-t-violet-500 rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Search Results */}
                  <div className="overflow-y-auto max-h-[calc(80dvh-14rem)]">
                    {isSearching ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="flex items-center gap-3 text-gray-500 text-sm">
                          <div className="w-5 h-5 border-2 border-gray-700 border-t-violet-500 rounded-full animate-spin" />
                          Searching contacts...
                        </div>
                      </div>
                    ) : filteredResults.length > 0 ? (
                      <div className="p-2 space-y-0.5">
                        {filteredResults.map((contact) => (
                          <button
                            key={contact.id}
                            type="button"
                            onClick={() => handleContactSelect(contact)}
                            className="w-full p-3 text-left rounded-xl transition-all hover:bg-gray-800/50 group"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 bg-violet-500/15 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-violet-500/25 transition-colors">
                                <Users className="w-4 h-4 text-violet-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                                  {contact.full_name ||
                                   `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
                                   contact.email ||
                                   'Unknown Contact'}
                                </h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Mail className="w-3 h-3 text-gray-600" />
                                  <span className="text-xs text-gray-500 truncate">{contact.email}</span>
                                </div>
                                {(contact.company || contact.company_name || contact.companies?.name || contact.companies) && (
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Building2 className="w-3 h-3 text-gray-600" />
                                    <span className="text-xs text-gray-500 truncate">
                                      {typeof contact.company === 'string'
                                        ? contact.company
                                        : contact.company?.name ||
                                          contact.company_name ||
                                          contact.companies?.name ||
                                          (typeof contact.companies === 'object' ? contact.companies?.name : contact.companies)}
                                    </span>
                                  </div>
                                )}
                                {contact.phone && (
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Phone className="w-3 h-3 text-gray-600" />
                                    <span className="text-xs text-gray-500">{contact.phone}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                        <div className="w-14 h-14 bg-gray-800/60 rounded-xl flex items-center justify-center mb-4">
                          <Users className="w-6 h-6 text-gray-600" />
                        </div>
                        <h4 className="font-medium text-gray-300 mb-1 text-sm">
                          {searchQuery ? 'No contacts found' : 'No contacts yet'}
                        </h4>
                        <p className="text-gray-500 text-xs mb-4 max-w-xs">
                          {searchQuery
                            ? `No contacts match "${searchQuery}". Try a different search or create a new contact.`
                            : 'Create your first contact to get started'
                          }
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowCreateForm(true)}
                          className="px-4 py-2 bg-violet-500/20 border border-violet-500/30 text-violet-400 rounded-xl hover:bg-violet-500/30 hover:border-violet-500/40 transition-all flex items-center gap-2 text-sm font-medium"
                        >
                          <UserPlus className="w-4 h-4" />
                          Create New Contact
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Create New Button (when results exist) */}
                  {filteredResults.length > 0 && (
                    <div className="px-5 py-4 border-t border-gray-800/50">
                      <button
                        type="button"
                        onClick={() => setShowCreateForm(true)}
                        className="w-full px-4 py-3 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl hover:bg-violet-500/20 hover:border-violet-500/30 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                      >
                        <Plus className="w-4 h-4" />
                        Create New Contact
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
