import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Users, 
  Search, 
  Plus, 
  Mail, 
  Phone,
  Edit,
  Trash2,
  ExternalLink,
  Building2,
  Download,
  ArrowUpDown,
  Star,
  StarOff,
  CheckSquare,
  Square,
  X
} from 'lucide-react';
import { HelpPanel } from '@/components/docs/HelpPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { CRMNavigation } from '@/components/CRMNavigation';
import { useUser } from '@/lib/hooks/useUser';
import { API_BASE_URL } from '@/lib/config';
import { supabase } from '@/lib/supabase/clientV2';
import { getSupabaseHeaders } from '@/lib/utils/apiUtils';
import logger from '@/lib/utils/logger';
import { motion, AnimatePresence } from 'framer-motion';

interface Contact {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  phone?: string | null;
  company_name?: string; // This is a text field, not a foreign key
  created_at: string;
  updated_at: string;
  // Optional fields that may not exist in database
  full_name?: string;
  title?: string;
  company_id?: string;
  owner_id?: string;
  linkedin_url?: string;
  notes?: string;
  is_primary?: boolean;
  // Company relationship (only available when Edge Functions work)
  company?: {
    id: string;
    name: string;
    domain?: string;
    size?: string;
    industry?: string;
    website?: string;
  };
}

interface ContactsResponse {
  data: Contact[];
  error: string | null;
  count: number;
}

type SortField = 'full_name' | 'email' | 'title' | 'company_name' | 'is_primary' | 'created_at' | 'updated_at';
type SortDirection = 'asc' | 'desc';

export default function ContactsTable() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [primaryFilter, setPrimaryFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  
  // Multi-select functionality
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  const [isSelectModeActive, setIsSelectModeActive] = useState(false);

  // Update search term when URL params change
  useEffect(() => {
    const urlSearch = searchParams.get('search');
    if (urlSearch && urlSearch !== searchTerm) {
      setSearchTerm(urlSearch);
    }
  }, [searchParams]);

  // Debounce search term - wait 500ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch contacts from API
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        // Only show main loading spinner on initial load
        if (contacts.length === 0) {
          setIsLoading(true);
        } else {
          setIsSearching(true);
        }
        setError(null);
        
        // Check authentication first
        logger.log('🔍 Checking user authentication for contacts...');
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          logger.log('⚠️ No session found - using service key fallback for contacts...');
          
          // Skip Edge Functions entirely and go straight to service key fallback
          const { supabaseAdmin } = await import('@/lib/supabase/clientV3-optimized');
          const serviceSupabase = supabaseAdmin;
          
          logger.log('🛡️ Using service key fallback for contacts (no auth)...');
          
          // Use the actual database structure - no companies join since relationship doesn't exist
          let query = (serviceSupabase as any)
            .from('contacts')
            .select('*'); // Get all available fields
          
          // Apply search filter if debouncedSearchTerm is provided
          if (debouncedSearchTerm && debouncedSearchTerm.trim()) {
            const searchPattern = `%${debouncedSearchTerm.trim()}%`;
            query = query.or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},company.ilike.${searchPattern}`);
          }
          
          const { data: serviceContactsData, error: serviceError } = await query
            .order('created_at', { ascending: false });
            
          if (serviceError) {
            logger.error('❌ Service key contacts fallback failed:', serviceError);
            throw serviceError;
          }
          
          logger.log(`✅ Service key contacts fallback successful: Retrieved ${serviceContactsData?.length || 0} contacts`);
          
          // Process contacts - no company join available, so use the company text field
          const processedContacts = serviceContactsData?.map((contact: any) => ({
            ...contact,
            is_primary: contact.is_primary || false,
            company: contact.company_name ? { name: contact.company_name } : null // Use company text field
          })) || [];
          
          setContacts(processedContacts);
          setIsLoading(false);
          setIsSearching(false);
          return;
        }

        // If authenticated, try Edge Functions first
        logger.log('🌐 User authenticated - trying Edge Functions for contacts...');
        
        const params = new URLSearchParams({
          includeCompany: 'true'
        });
        
        if (debouncedSearchTerm) {
          params.append('search', debouncedSearchTerm);
        }

        try {
          const response = await fetch(`${API_BASE_URL}/contacts?${params}`, {
            headers: await getSupabaseHeaders(),
          });
          
          if (response.status === 401) {
            setError('Authentication required. Please log in to view contacts.');
            return;
          }
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const result = await response.json();
          setContacts(result.data || []);
          return;
        } catch (edgeFunctionError) {
          logger.warn('Contacts Edge Function failed, falling back to direct Supabase client:', edgeFunctionError);
        }

        // Fallback to direct Supabase client with anon key
        logger.log('🛡️ Contacts fallback: Using direct Supabase client...');
        
        let query = (supabase as any)
          .from('contacts')
          .select('*')
          .order('created_at', { ascending: false });

        if (debouncedSearchTerm && debouncedSearchTerm.trim()) {
          const searchPattern = `%${debouncedSearchTerm.trim()}%`;
          query = query.or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},company.ilike.${searchPattern}`);
        }

        const { data: contactsData, error: supabaseError } = await query;

        if (supabaseError) {
          logger.error('❌ Contacts anon fallback failed:', supabaseError);
          logger.log('🔄 Trying contacts with service role key...');
          
          // Last resort: try with service role key
          const { supabaseAdmin } = await import('@/lib/supabase/clientV3-optimized');
          const serviceSupabase = supabaseAdmin;
          
          let serviceQuery = (serviceSupabase as any)
            .from('contacts')
            .select('*');
          
          // Apply search filter if debouncedSearchTerm is provided
          if (debouncedSearchTerm && debouncedSearchTerm.trim()) {
            const searchPattern = `%${debouncedSearchTerm.trim()}%`;
            serviceQuery = serviceQuery.or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},company.ilike.${searchPattern}`);
          }
          
          const { data: serviceContactsData, error: serviceError } = await serviceQuery
            .order('created_at', { ascending: false });
            
          if (serviceError) {
            logger.error('❌ Service key contacts fallback failed:', serviceError);
            throw serviceError;
          }
          
          logger.log(`✅ Service key contacts fallback successful: Retrieved ${serviceContactsData?.length || 0} contacts`);
          const processedContacts = serviceContactsData?.map((contact: any) => ({
            ...contact,
            is_primary: contact.is_primary || false,
            company: null
          })) || [];
          
          setContacts(processedContacts);
          return;
        }

        logger.log(`✅ Contacts fallback successful: Retrieved ${contactsData?.length || 0} contacts`);
        
        // Process the data to match expected interface
        const processedContacts = contactsData?.map((contact: any) => ({
          ...contact,
          is_primary: contact.is_primary || false,
          company: contact.company_name ? { name: contact.company_name } : null // Use company text field
        })) || [];

        setContacts(processedContacts);
      } catch (err) {
        logger.error('Error fetching contacts:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch contacts');
        toast.error('Failed to load contacts');
      } finally {
        setIsLoading(false);
        setIsSearching(false);
      }
    };

    fetchContacts();
  }, [debouncedSearchTerm]);

  // Handle row click to navigate to contact record
  const handleContactClick = (contactId: string, event: React.MouseEvent) => {
    // Don't navigate if clicking on links or buttons
    const target = event.target as HTMLElement;
    if (target.tagName === 'A' || target.closest('button') || target.closest('a')) {
      return;
    }
    
    navigate(`/crm/contacts/${contactId}`);
  };

  // Multi-select handlers
  const handleSelectContact = (contactId: string, isSelected: boolean) => {
    const newSelected = new Set(selectedContacts);
    if (isSelected) {
      newSelected.add(contactId);
    } else {
      newSelected.delete(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const handleSelectAll = (isSelected: boolean, filteredContacts: Contact[]) => {
    if (isSelected) {
      const allIds = new Set(filteredContacts.map(contact => contact.id));
      setSelectedContacts(allIds);
    } else {
      setSelectedContacts(new Set());
    }
    setIsSelectAllChecked(isSelected);
  };

  const toggleSelectMode = () => {
    setIsSelectModeActive(!isSelectModeActive);
    if (isSelectModeActive) {
      setSelectedContacts(new Set());
      setIsSelectAllChecked(false);
    }
  };

  const handleBulkDelete = async () => {
    try {
      const selectedIds = Array.from(selectedContacts);
      
      if (selectedIds.length === 0) {
        toast.error('No contacts selected');
        return;
      }

      // Delete each contact
      const deletePromises = selectedIds.map(async (id) => {
        const { error } = await supabase
          .from('contacts')
          .delete()
          .eq('id', id);

        if (error) throw error;
      });

      await Promise.all(deletePromises);

      // Remove deleted contacts from state
      setContacts(prev => prev.filter(contact => !selectedIds.includes(contact.id)));
      setSelectedContacts(new Set());
      setIsSelectAllChecked(false);
      setBulkDeleteDialogOpen(false);
      
      toast.success(`Successfully deleted ${selectedIds.length} contacts`);
    } catch (error) {
      toast.error('Failed to delete selected contacts');
    }
  };

  // Filter and sort contacts
  const filteredAndSortedContacts = useMemo(() => {
    let filtered = contacts.filter(contact => {
      const companyName = contact.company_name || contact.company?.name;
      const matchesCompany = companyFilter === 'all' || (companyName === companyFilter);
      const matchesPrimary = primaryFilter === 'all' || 
        (primaryFilter === 'primary' ? contact.is_primary : !contact.is_primary);
      return matchesCompany && matchesPrimary;
    });

    // Sort contacts
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'company_name':
          aValue = a.company?.name || '';
          bValue = b.company?.name || '';
          break;
        default:
          aValue = a[sortField];
          bValue = b[sortField];
      }

      // Handle null/undefined values
      if (aValue == null) aValue = '';
      if (bValue == null) bValue = '';

      // Convert to string for comparison if needed
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [contacts, companyFilter, primaryFilter, sortField, sortDirection]);

  // Update select all checkbox state
  useEffect(() => {
    setIsSelectAllChecked(
      selectedContacts.size > 0 && 
      selectedContacts.size === filteredAndSortedContacts.length && 
      filteredAndSortedContacts.length > 0
    );
  }, [selectedContacts.size, filteredAndSortedContacts.length]);

  // Get unique values for filters
  const uniqueCompanies = [...new Set(contacts
    .filter(c => c.company_name || c.company?.name) // Check both company text field and company relationship
    .map(c => c.company_name || c.company?.name)
    .filter(Boolean)
  )];

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    return <ArrowUpDown className={`w-4 h-4 ${sortDirection === 'asc' ? 'text-blue-400' : 'text-blue-400 rotate-180'}`} />;
  };

  const formatName = (contact: Contact) => {
    // Try full_name first (if it exists)
    if (contact.full_name && contact.full_name.trim()) {
      return contact.full_name.trim();
    }
    
    // Try first_name and last_name combination
    const firstName = contact.first_name?.trim() || '';
    const lastName = contact.last_name?.trim() || '';
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    if (firstName) return firstName;
    if (lastName) return lastName;
    
    // Fallback to email username part (before @)
    if (contact.email) {
      const emailUsername = contact.email.split('@')[0];
      // Make it more readable (replace dots/underscores with spaces, capitalize)
      const readableName = emailUsername
        .replace(/[._-]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return `${readableName} (from email)`;
    }
    
    return 'Unnamed Contact';
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Name', 'Email', 'Phone', 'Title', 'Company', 'Primary', 'Created'].join(','),
      ...filteredAndSortedContacts.map(contact => [
        `"${formatName(contact)}"`,
        `"${contact.email || ''}"`,
        `"${contact.phone || ''}"`,
        `"${contact.title || ''}"`,
        `"${contact.company_name || contact.company?.name || ''}"`,
        contact.is_primary ? 'Yes' : 'No',
        new Date(contact.created_at).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `contacts_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Contacts exported successfully');
  };

  // Handle edit contact
  const handleEditContact = (e: React.MouseEvent, contact: Contact) => {
    e.stopPropagation(); // Prevent row click
    setEditingContact(contact);
  };

  // Handle delete contact
  const handleDeleteContact = (e: React.MouseEvent, contact: Contact) => {
    e.stopPropagation(); // Prevent row click
    setDeletingContact(contact);
  };

  // Confirm delete
  const confirmDeleteContact = async () => {
    if (!deletingContact) return;

    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', deletingContact.id);

      if (error) throw error;

      // Remove the deleted contact from local state
      setContacts(prev => prev.filter(c => c.id !== deletingContact.id));
      setDeletingContact(null);
      toast.success(`Contact "${formatName(deletingContact)}" deleted`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to delete contact: ${message}`);
    }
  };

  // Handle add new contact
  const handleAddContact = () => {
    navigate('/contacts/new');
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-900/50 rounded-xl p-8 border border-[#E2E8F0] dark:border-gray-800 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-200 dark:bg-gray-800 rounded w-1/4"></div>
            <div className="h-4 bg-slate-200 dark:bg-gray-800 rounded w-1/2"></div>
            <div className="space-y-3 mt-6">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 bg-slate-100 dark:bg-gray-800/50 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-900/20 border border-red-700 rounded-xl p-6">
          <h3 className="text-red-400 font-medium mb-2">Error loading contacts</h3>
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden">
      {/* CRM Navigation */}
      <CRMNavigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-8 h-8 text-green-400" />
            <h1 className="text-3xl font-bold text-[#1E293B] dark:text-white">Contacts</h1>
            <HelpPanel docSlug="contacts-crm" tooltip="Contacts help" />
          </div>
          <p className="text-[#64748B] dark:text-gray-400">
            Manage your contact database • {filteredAndSortedContacts.length} of {contacts.length} contacts • Click any row to view details
          </p>
        </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-gray-900/50 rounded-xl p-6 mb-6 border border-[#E2E8F0] dark:border-gray-800 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#64748B] dark:text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search contacts by name, email, or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-50 dark:bg-gray-800/50 border-[#E2E8F0] dark:border-gray-700 text-[#1E293B] dark:text-white placeholder-[#94A3B8] dark:placeholder-gray-400"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-violet-500 rounded-full animate-spin" />
              </div>
            )}
          </div>
          
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-full sm:w-[200px] bg-slate-50 dark:bg-gray-800/50 border-[#E2E8F0] dark:border-gray-700 text-[#1E293B] dark:text-white">
                <SelectValue placeholder="All Companies" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-[#E2E8F0] dark:border-gray-700">
                <SelectItem value="all">All Companies</SelectItem>
                {uniqueCompanies.map(company => (
                  <SelectItem key={company} value={company}>{company}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={primaryFilter} onValueChange={setPrimaryFilter}>
              <SelectTrigger className="w-full sm:w-[150px] bg-slate-50 dark:bg-gray-800/50 border-[#E2E8F0] dark:border-gray-700 text-[#1E293B] dark:text-white">
                <SelectValue placeholder="All Contacts" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-[#E2E8F0] dark:border-gray-700">
                <SelectItem value="all">All Contacts</SelectItem>
                <SelectItem value="primary">Primary Only</SelectItem>
                <SelectItem value="secondary">Secondary Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={exportToCSV}
              variant="success"
              size="sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button
              onClick={toggleSelectMode}
              variant="tertiary"
              size="sm"
            >
              {isSelectModeActive ? <CheckSquare className="w-4 h-4 mr-2" /> : <Square className="w-4 h-4 mr-2" />}
              {isSelectModeActive ? 'Exit Select' : 'Select Mode'}
            </Button>
            <Button
              onClick={handleAddContact}
              variant="success"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Actions - Only show when select mode is active and contacts are selected */}
      <AnimatePresence>
        {isSelectModeActive && selectedContacts.size > 0 && (
          <motion.div 
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.95 }}
            transition={{ 
              duration: 0.2,
              ease: [0.23, 1, 0.32, 1]
            }}
            className="bg-gradient-to-r from-violet-600/10 via-purple-600/10 to-violet-600/10 backdrop-blur-xl border border-violet-500/20 rounded-xl p-4 shadow-2xl shadow-violet-500/10"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30">
                  <CheckSquare className="w-4 h-4 text-violet-400" />
                </div>
                <span className="text-sm font-medium text-[#1E293B] dark:text-white">
                  {selectedContacts.size} selected
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setBulkDeleteDialogOpen(true)}
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected
                </Button>
                <Button
                  onClick={() => {
                    setSelectedContacts(new Set());
                    setIsSelectAllChecked(false);
                  }}
                  variant="ghost"
                  size="sm"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-[#E2E8F0] dark:border-gray-800 overflow-x-auto scrollbar-accent shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none">
        <div className="min-w-[900px]">
          <Table>
          <TableHeader>
            <TableRow className="border-[#E2E8F0] dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800/50">
              {/* Select All Checkbox - Only show when in select mode */}
              {isSelectModeActive && (
                <TableHead className="w-12 text-[#64748B] dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={isSelectAllChecked}
                    onChange={(e) => handleSelectAll(e.target.checked, filteredAndSortedContacts)}
                    className="w-5 h-5 text-violet-500 bg-gray-800/80 border-2 border-gray-600 rounded-md focus:ring-violet-500 focus:ring-2 focus:ring-offset-0 transition-all duration-200 hover:border-violet-500/60 checked:bg-violet-500 checked:border-violet-500 cursor-pointer"
                  />
                </TableHead>
              )}
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white"
                onClick={() => handleSort('full_name')}
              >
                <div className="flex items-center gap-2">
                  Contact {getSortIcon('full_name')}
                </div>
              </TableHead>
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white"
                onClick={() => handleSort('email')}
              >
                <div className="flex items-center gap-2">
                  Email {getSortIcon('email')}
                </div>
              </TableHead>
              <TableHead className="text-[#64748B] dark:text-gray-300">Phone</TableHead>
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white"
                onClick={() => handleSort('title')}
              >
                <div className="flex items-center gap-2">
                  Title {getSortIcon('title')}
                </div>
              </TableHead>
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white"
                onClick={() => handleSort('company_name')}
              >
                <div className="flex items-center gap-2">
                  Company {getSortIcon('company_name')}
                </div>
              </TableHead>
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white text-center"
                onClick={() => handleSort('is_primary')}
              >
                <div className="flex items-center justify-center gap-2">
                  Primary {getSortIcon('is_primary')}
                </div>
              </TableHead>
              <TableHead className="text-[#64748B] dark:text-gray-300 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedContacts.map((contact) => (
              <TableRow
                key={contact.id}
                className={`border-[#E2E8F0] dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800/50 cursor-pointer ${
                  selectedContacts.has(contact.id) && isSelectModeActive
                    ? 'border-violet-500/40 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-violet-500/10 shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/20'
                    : ''
                }`}
                onClick={(e) => handleContactClick(contact.id, e)}
              >
                {/* Select Checkbox - Only show when in select mode */}
                {isSelectModeActive && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <motion.div
                      initial={false}
                      animate={{
                        scale: selectedContacts.has(contact.id) ? [1, 1.1, 1] : 1,
                        opacity: selectedContacts.has(contact.id) ? 1 : 0.7
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedContacts.has(contact.id)}
                        onChange={(e) => handleSelectContact(contact.id, e.target.checked)}
                        className="w-5 h-5 text-violet-500 bg-gray-800/80 border-2 border-gray-600 rounded-md focus:ring-violet-500 focus:ring-2 focus:ring-offset-0 transition-all duration-200 hover:border-violet-500/60 checked:bg-violet-500 checked:border-violet-500 cursor-pointer"
                      />
                    </motion.div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-3">
                    {contact.is_primary && (
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    )}
                    <div className="flex flex-col">
                      <div className="font-medium text-[#1E293B] dark:text-white">{formatName(contact)}</div>
                      {contact.linkedin_url && (
                        <a
                          href={contact.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          LinkedIn <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {contact.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-[#64748B] dark:text-gray-400" />
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-blue-400 hover:text-blue-300"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {contact.email}
                      </a>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {contact.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-[#64748B] dark:text-gray-400" />
                      <a
                        href={`tel:${contact.phone}`}
                        className="text-[#64748B] dark:text-gray-300 hover:text-[#1E293B] dark:hover:text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {contact.phone}
                      </a>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {contact.title && (
                    <Badge variant="outline" className="text-xs">
                      {contact.title}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {contact.company && (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[#64748B] dark:text-gray-400" />
                      <span className="text-[#64748B] dark:text-gray-300">{contact.company.name}</span>
                      {contact.company.website && (
                        <a
                          href={contact.company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {contact.is_primary ? (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                      Primary
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-400">
                      Secondary
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleEditContact(e, contact)}
                      title="Edit contact"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="danger"
                      size="icon"
                      onClick={(e) => handleDeleteContact(e, contact)}
                      title="Delete contact"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        {filteredAndSortedContacts.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[#64748B] dark:text-gray-400 mb-2">No contacts found</h3>
            <p className="text-[#94A3B8] dark:text-gray-500 text-sm">
              {searchTerm || companyFilter !== 'all' || primaryFilter !== 'all' 
                ? 'Try adjusting your search criteria or filters'
                : 'Get started by adding your first contact'
              }
            </p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingContact} onOpenChange={() => setDeletingContact(null)}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Contact</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete <span className="font-semibold text-white">"{deletingContact ? formatName(deletingContact) : ''}"</span>? 
              This action cannot be undone and will remove all contact information and associated activities.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={() => setDeletingContact(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteContact}
            >
              Delete Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog - Simple for now */}
      <Dialog open={!!editingContact} onOpenChange={() => setEditingContact(null)}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-blue-400">Edit Contact</DialogTitle>
            <DialogDescription className="text-gray-400">
              Editing contact: <span className="font-semibold text-white">"{editingContact ? formatName(editingContact) : ''}"</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-400 text-sm">
              Full edit functionality coming soon. Click on the contact row to view the complete contact profile where you can edit all details.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={() => setEditingContact(null)}
            >
              Close
            </Button>
            <Button
              variant="default"
              onClick={() => {
                if (editingContact) {
                  navigate(`/crm/contacts/${editingContact.id}`);
                  setEditingContact(null);
                }
              }}
            >
              Open Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Selected Contacts</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete <strong>{selectedContacts.size}</strong> selected contacts? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={() => setBulkDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
            >
              Delete {selectedContacts.size} Contacts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
} 