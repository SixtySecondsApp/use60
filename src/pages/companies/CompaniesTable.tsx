import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Search,
  Plus,
  Users,
  Globe,
  Edit,
  Trash2,
  ExternalLink,
  Download,
  ArrowUpDown,
  CheckSquare,
  X
} from 'lucide-react';
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
import { OwnerFilter } from '@/components/OwnerFilter';
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
import { CompanyDealsModal } from '@/components/CompanyDealsModal';
import { CRMNavigation } from '@/components/CRMNavigation';
import { useUser } from '@/lib/hooks/useUser';
import { useCompanies } from '@/lib/hooks/useCompanies';
import logger from '@/lib/utils/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';

interface Company {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  website?: string;
  address?: string;
  phone?: string;
  description?: string;
  linkedin_url?: string;
  owner_id?: string;
  contactCount?: number;
  dealsCount?: number;
  dealsValue?: number;
  created_at: string;
  updated_at: string;
}

interface CompaniesResponse {
  data: Company[];
  error: string | null;
  count: number;
}

type SortField = 'name' | 'domain' | 'size' | 'industry' | 'contactCount' | 'dealsCount' | 'dealsValue' | 'created_at' | 'updated_at';
type SortDirection = 'asc' | 'desc';

export default function CompaniesTable() {
  const navigate = useNavigate();
  const { userData } = useUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | undefined>(userData?.id);
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [viewingCompanyDeals, setViewingCompanyDeals] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  
  // Multi-select functionality
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  const [isSelectModeActive, setIsSelectModeActive] = useState(false);

  // Set default owner when user data loads
  useEffect(() => {
    if (userData?.id && selectedOwnerId === undefined) {
      setSelectedOwnerId(userData.id);
    }
  }, [userData?.id, selectedOwnerId]);

  // Use the useCompanies hook instead of manual fetch
  const { 
    companies, 
    isLoading, 
    error: hookError 
  } = useCompanies({
    search: searchTerm,
    includeStats: true
  });

  // Convert error object to string for component compatibility
  const error = hookError?.message || null;

  // Companies data is now handled by the useCompanies hook
  // Removed old fetch logic - using useCompanies hook instead
  /*useEffect(() => {
    const fetchCompanies = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const params = new URLSearchParams({
          includeStats: 'true'
        });
        
        if (searchTerm) {
          params.append('search', searchTerm);
        }
        
        if (selectedOwnerId) {
          params.append('ownerId', selectedOwnerId);
        }

        // Try the companies endpoint
        try {
          const response = await fetch(`${API_BASE_URL}/companies?${params}`);
          
          if (response.status === 401) {
            setError('Authentication required. Please log in to view companies.');
            return;
          }
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const result = await response.json();
          setCompanies(result.data || []);
          return;
        } catch (apiError) {
          logger.warn('Companies API failed:', apiError);
        }

        // Fallback: Check if companies table exists
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
          setError('Supabase configuration missing. Please check environment variables.');
          return;
        }
        
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setError('Please log in to view companies.');
          return;
        }

        // Try to query companies table directly with deals aggregation
        const { data: companiesData, error: supabaseError } = await supabase
          .from('companies')
          .select(`
            *,
            deals!company_id(
              id,
              value,
              status
            )
          `)
          .order('created_at', { ascending: false });

        if (supabaseError) {
          if (supabaseError.message.includes('does not exist')) {
            setError('Companies table needs to be created. Please contact your administrator or run the setup script.');
          } else if (supabaseError.message.includes('JWT') || supabaseError.message.includes('auth')) {
            setError('Session expired. Please log in again.');
          } else {
            throw supabaseError;
          }
          return;
        }

        // Process companies data to include deals count and value
        const processedCompanies = (companiesData || []).map(company => {
          const deals = company.deals || [];
          const dealsCount = deals.length;
          const dealsValue = deals.reduce((sum: number, deal: any) => {
            return sum + (deal.value || 0);
          }, 0);
          
          return {
            ...company,
            dealsCount,
            dealsValue
          };
        });
        
        setCompanies(processedCompanies);
      } catch (error) {
        logger.error('❌ Companies Edge Function failed:', error);
        
        // Fallback to direct Supabase client
        logger.log('🛡️ Companies fallback: Using direct Supabase client...');
        try {
          const { createClient: createClientFallback } = await import('@supabase/supabase-js');
          const fallbackUrl = import.meta.env.VITE_SUPABASE_URL;
          const fallbackKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          
          if (!fallbackUrl || !fallbackKey) {
            throw new Error('Missing Supabase configuration');
          }
          
          const fallbackSupabase = createClientFallback(fallbackUrl, fallbackKey);
          
          const { data: companiesData, error: supabaseError } = await (fallbackSupabase as any)
            .from('companies')
            .select(`
              *,
              deals!company_id(
                id,
                value,
                status
              )
            `)
            .order('created_at', { ascending: false });
          
          if (supabaseError) {
            logger.error('❌ Companies fetch failed:', supabaseError);
            throw supabaseError;
          }
          
          logger.log(`✅ Companies fallback successful: Retrieved ${companiesData?.length || 0} companies`);
          
          // Process companies data to include deals count and value
          const processedFallbackCompanies = (companiesData || []).map(company => {
            const deals = company.deals || [];
            const dealsCount = deals.length;
            const dealsValue = deals.reduce((sum: number, deal: any) => {
              return sum + (deal.value || 0);
            }, 0);
            
            return {
              ...company,
              dealsCount,
              dealsValue
            };
          });
          
          setCompanies(processedFallbackCompanies);
        } catch (fallbackError) {
          logger.error('❌ All companies fallback methods failed:', fallbackError);
          setError('Failed to load companies. Please try again.');
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchCompanies();
  }, [searchTerm, selectedOwnerId]); */

  // Multi-select handlers
  const handleSelectCompany = (companyId: string, isSelected: boolean) => {
    const newSelected = new Set(selectedCompanies);
    if (isSelected) {
      newSelected.add(companyId);
    } else {
      newSelected.delete(companyId);
    }
    setSelectedCompanies(newSelected);
  };

  const handleSelectAll = (isSelected: boolean, filteredCompanies: Company[]) => {
    if (isSelected) {
      const allIds = new Set(filteredCompanies.map(company => company.id));
      setSelectedCompanies(allIds);
    } else {
      setSelectedCompanies(new Set());
    }
    setIsSelectAllChecked(isSelected);
  };

  const toggleSelectMode = () => {
    setIsSelectModeActive(!isSelectModeActive);
    if (isSelectModeActive) {
      setSelectedCompanies(new Set());
      setIsSelectAllChecked(false);
    }
  };

  const handleBulkDelete = async () => {
    try {
      const selectedIds = Array.from(selectedCompanies);
      
      if (selectedIds.length === 0) {
        toast.error('No companies selected');
        return;
      }

      // Delete each company using the deleteCompany function
      const deletePromises = selectedIds.map(id => deleteCompany(id));
      await Promise.all(deletePromises);

      setSelectedCompanies(new Set());
      setIsSelectAllChecked(false);
      setBulkDeleteDialogOpen(false);
      
      toast.success(`Successfully deleted ${selectedIds.length} companies`);
    } catch (error) {
      toast.error('Failed to delete selected companies');
    }
  };

  // Filter and sort companies
  const filteredAndSortedCompanies = useMemo(() => {
    let filtered = companies.filter(company => {
      const matchesSize = sizeFilter === 'all' || company.size === sizeFilter;
      const matchesIndustry = industryFilter === 'all' || company.industry === industryFilter;
      const matchesLocation = locationFilter === 'all' || company.address === locationFilter;

      // Owner filtering
      const matchesOwner = !selectedOwnerId || company.owner_id === selectedOwnerId;

      return matchesSize && matchesIndustry && matchesLocation && matchesOwner;
    });

    // Sort companies
    filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

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
  }, [companies, sizeFilter, industryFilter, locationFilter, selectedOwnerId, sortField, sortDirection]);

  // Update select all checkbox state
  useEffect(() => {
    setIsSelectAllChecked(
      selectedCompanies.size > 0 && 
      selectedCompanies.size === filteredAndSortedCompanies.length && 
      filteredAndSortedCompanies.length > 0
    );
  }, [selectedCompanies.size, filteredAndSortedCompanies.length]);

  // Get unique values for filters
  const uniqueSizes = [...new Set(companies.map(c => c.size).filter(Boolean))];
  const uniqueIndustries = [...new Set(companies.map(c => c.industry).filter(Boolean))];
  const uniqueLocations = [...new Set(companies.map(c => c.address).filter(Boolean))];

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatDomain = (domain: string) => {
    return domain?.startsWith('www.') ? domain.slice(4) : domain;
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Name', 'Domain', 'Size', 'Industry', 'Contacts', 'Deals', 'Value', 'Created'].join(','),
      ...filteredAndSortedCompanies.map(company => [
        `"${company.name}"`,
        `"${company.domain || ''}"`,
        `"${company.size || ''}"`,
        `"${company.industry || ''}"`,
        company.contactCount || 0,
        company.dealsCount || 0,
        company.dealsValue || 0,
        new Date(company.created_at).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `companies_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Companies exported successfully');
  };

  // Handle row click to navigate to company detail
  const handleRowClick = (company: Company) => {
    navigate(`/companies/${company.id}`);
  };

  // Handle edit company
  const handleEditCompany = (e: React.MouseEvent, company: Company) => {
    e.stopPropagation(); // Prevent row click
    setEditingCompany(company);
  };

  // Handle delete company
  const handleDeleteCompany = (e: React.MouseEvent, company: Company) => {
    e.stopPropagation(); // Prevent row click
    setDeletingCompany(company);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!deletingCompany) return;
    
    // TODO: Implement actual delete logic
    toast.success(`Company "${deletingCompany.name}" deleted successfully`);
    setDeletingCompany(null);
    // Refresh companies list
    // refreshCompanies();
  };

  // Handle add new company
  const handleAddCompany = () => {
    navigate('/companies/new');
  };

  // Filter companies description text
  const getFilterDescription = () => {
    let description = `${filteredAndSortedCompanies.length} of ${companies.length} companies`;
    
    if (selectedOwnerId) {
      description += ' • Filtered by owner';
    }
    
    return description;
  };

  if (isLoading) {
    return (
      <div className="overflow-x-hidden">
        <CRMNavigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          {/* Header skeleton */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Skeleton className="w-8 h-8 rounded-md" />
              <Skeleton className="h-9 w-40" />
            </div>
            <Skeleton className="h-4 w-48 mt-1" />
          </div>

          {/* Search bar skeleton */}
          <div className="bg-white dark:bg-gray-900/50 rounded-xl p-6 mb-6 border border-[#E2E8F0] dark:border-gray-800 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-44" />
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex gap-4 flex-1">
                  <Skeleton className="h-10 w-44" />
                  <Skeleton className="h-10 w-44" />
                  <Skeleton className="h-10 w-44" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-10 w-32" />
                </div>
              </div>
            </div>
          </div>

          {/* Table skeleton — real headers + 6 row placeholders */}
          <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-[#E2E8F0] dark:border-gray-800 overflow-x-auto shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none">
            <div className="min-w-[900px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0] dark:border-gray-800 hover:bg-transparent">
                    <TableHead className="text-[#64748B] dark:text-gray-300">
                      <div className="flex items-center gap-2">Company <ArrowUpDown className="w-4 h-4 text-gray-400" /></div>
                    </TableHead>
                    <TableHead className="text-[#64748B] dark:text-gray-300">
                      <div className="flex items-center gap-2">Domain <ArrowUpDown className="w-4 h-4 text-gray-400" /></div>
                    </TableHead>
                    <TableHead className="text-[#64748B] dark:text-gray-300">
                      <div className="flex items-center gap-2">Size <ArrowUpDown className="w-4 h-4 text-gray-400" /></div>
                    </TableHead>
                    <TableHead className="text-[#64748B] dark:text-gray-300">
                      <div className="flex items-center gap-2">Industry <ArrowUpDown className="w-4 h-4 text-gray-400" /></div>
                    </TableHead>
                    <TableHead className="text-[#64748B] dark:text-gray-300 text-center">
                      <div className="flex items-center justify-center gap-2">Contacts <ArrowUpDown className="w-4 h-4 text-gray-400" /></div>
                    </TableHead>
                    <TableHead className="text-[#64748B] dark:text-gray-300 text-center">
                      <div className="flex items-center justify-center gap-2">Deals <ArrowUpDown className="w-4 h-4 text-gray-400" /></div>
                    </TableHead>
                    <TableHead className="text-[#64748B] dark:text-gray-300 text-right">
                      <div className="flex items-center justify-end gap-2">Value <ArrowUpDown className="w-4 h-4 text-gray-400" /></div>
                    </TableHead>
                    <TableHead className="text-[#64748B] dark:text-gray-300 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <TableRow key={i} className="border-[#E2E8F0] dark:border-gray-800 hover:bg-transparent">
                      {/* Company name + optional description */}
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-3 w-52 opacity-60" />
                        </div>
                      </TableCell>
                      {/* Domain */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-4 rounded-sm" />
                          <Skeleton className="h-4 w-28" />
                        </div>
                      </TableCell>
                      {/* Size badge */}
                      <TableCell>
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </TableCell>
                      {/* Industry badge */}
                      <TableCell>
                        <Skeleton className="h-5 w-24 rounded-full" />
                      </TableCell>
                      {/* Contacts count */}
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Skeleton className="h-4 w-4 rounded-sm" />
                          <Skeleton className="h-4 w-6" />
                        </div>
                      </TableCell>
                      {/* Deals count */}
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-6 mx-auto" />
                      </TableCell>
                      {/* Value */}
                      <TableCell className="text-right">
                        <Skeleton className="h-4 w-16 ml-auto" />
                      </TableCell>
                      {/* Actions */}
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Skeleton className="h-8 w-8 rounded-md" />
                          <Skeleton className="h-8 w-8 rounded-md" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
          <h3 className="text-red-400 font-medium mb-2">Error loading companies</h3>
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
            <Building2 className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-[#1E293B] dark:text-white">Companies</h1>
          </div>
          <p className="text-[#64748B] dark:text-gray-400">
            {getFilterDescription()}
          </p>
        </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-gray-900/50 rounded-xl p-6 mb-6 border border-[#E2E8F0] dark:border-gray-800 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none">
        <div className="flex flex-col gap-4">
          {/* Top row: Search and Owner Filter */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#64748B] dark:text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search companies by name or domain..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-50 dark:bg-gray-800/50 border-[#E2E8F0] dark:border-gray-700 text-[#1E293B] dark:text-white placeholder-[#94A3B8] dark:placeholder-gray-400"
              />
            </div>
            
            {/* Owner Filter */}
            <OwnerFilter
              selectedOwnerId={selectedOwnerId}
              onOwnerChange={setSelectedOwnerId}
              className="w-full sm:w-[180px]"
            />
          </div>
          
          {/* Bottom row: Other filters and actions */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Other Filters */}
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <Select value={sizeFilter} onValueChange={setSizeFilter}>
                <SelectTrigger className="w-full sm:w-[180px] bg-slate-50 dark:bg-gray-800/50 border-[#E2E8F0] dark:border-gray-700 text-[#1E293B] dark:text-white">
                  <SelectValue placeholder="All Sizes" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-[#E2E8F0] dark:border-gray-700">
                  <SelectItem value="all">All Sizes</SelectItem>
                  {uniqueSizes.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={industryFilter} onValueChange={setIndustryFilter}>
                <SelectTrigger className="w-full sm:w-[180px] bg-slate-50 dark:bg-gray-800/50 border-[#E2E8F0] dark:border-gray-700 text-[#1E293B] dark:text-white">
                  <SelectValue placeholder="All Industries" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-[#E2E8F0] dark:border-gray-700">
                  <SelectItem value="all">All Industries</SelectItem>
                  {uniqueIndustries.map(industry => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-full sm:w-[180px] bg-slate-50 dark:bg-gray-800/50 border-[#E2E8F0] dark:border-gray-700 text-[#1E293B] dark:text-white">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-[#E2E8F0] dark:border-gray-700">
                  <SelectItem value="all">All Locations</SelectItem>
                  {uniqueLocations.map(location => (
                    <SelectItem key={location} value={location}>{location}</SelectItem>
                  ))}
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
                onClick={handleAddCompany}
                variant="default"
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Company
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions - Only show when select mode is active and companies are selected */}
      <AnimatePresence>
        {isSelectModeActive && selectedCompanies.size > 0 && (
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
                  {selectedCompanies.size} selected
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
                    setSelectedCompanies(new Set());
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
                    onChange={(e) => handleSelectAll(e.target.checked, filteredAndSortedCompanies)}
                    className="w-5 h-5 text-violet-500 bg-gray-800/80 border-2 border-gray-600 rounded-md focus:ring-violet-500 focus:ring-2 focus:ring-offset-0 transition-all duration-200 hover:border-violet-500/60 checked:bg-violet-500 checked:border-violet-500 cursor-pointer"
                  />
                </TableHead>
              )}
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-2">
                  Company {getSortIcon('name')}
                </div>
              </TableHead>
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white"
                onClick={() => handleSort('domain')}
              >
                <div className="flex items-center gap-2">
                  Domain {getSortIcon('domain')}
                </div>
              </TableHead>
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white"
                onClick={() => handleSort('size')}
              >
                <div className="flex items-center gap-2">
                  Size {getSortIcon('size')}
                </div>
              </TableHead>
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white"
                onClick={() => handleSort('industry')}
              >
                <div className="flex items-center gap-2">
                  Industry {getSortIcon('industry')}
                </div>
              </TableHead>
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white text-center"
                onClick={() => handleSort('contactCount')}
              >
                <div className="flex items-center justify-center gap-2">
                  Contacts {getSortIcon('contactCount')}
                </div>
              </TableHead>
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white text-center"
                onClick={() => handleSort('dealsCount')}
              >
                <div className="flex items-center justify-center gap-2">
                  Deals {getSortIcon('dealsCount')}
                </div>
              </TableHead>
              <TableHead 
                className="text-[#64748B] dark:text-gray-300 cursor-pointer hover:text-[#1E293B] dark:hover:text-white text-right"
                onClick={() => handleSort('dealsValue')}
              >
                <div className="flex items-center justify-end gap-2">
                  Value {getSortIcon('dealsValue')}
                </div>
              </TableHead>
              <TableHead className="text-[#64748B] dark:text-gray-300 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedCompanies.map((company) => (
              <TableRow
                key={company.id}
                className={`border-[#E2E8F0] dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${
                  selectedCompanies.has(company.id) && isSelectModeActive
                    ? 'border-violet-500/40 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-violet-500/10 shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/20'
                    : ''
                }`}
                onClick={() => handleRowClick(company)}
              >
                {/* Select Checkbox - Only show when in select mode */}
                {isSelectModeActive && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <motion.div
                      initial={false}
                      animate={{
                        scale: selectedCompanies.has(company.id) ? [1, 1.1, 1] : 1,
                        opacity: selectedCompanies.has(company.id) ? 1 : 0.7
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCompanies.has(company.id)}
                        onChange={(e) => handleSelectCompany(company.id, e.target.checked)}
                        className="w-5 h-5 text-violet-500 bg-gray-800/80 border-2 border-gray-600 rounded-md focus:ring-violet-500 focus:ring-2 focus:ring-offset-0 transition-all duration-200 hover:border-violet-500/60 checked:bg-violet-500 checked:border-violet-500 cursor-pointer"
                      />
                    </motion.div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex flex-col">
                    <div className="font-medium text-[#1E293B] dark:text-white">{company.name}</div>
                    {company.description && (
                      <div className="text-sm text-[#64748B] dark:text-gray-400 truncate max-w-xs">
                        {company.description}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {company.domain && (
                      <>
                        <Globe className="w-4 h-4 text-[#64748B] dark:text-gray-400" />
                        <span className="text-[#64748B] dark:text-gray-300">{formatDomain(company.domain)}</span>
                        {company.website && (
                          <a
                            href={company.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {company.size && (
                    <Badge variant="outline" className="text-xs">
                      {company.size}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {company.industry && (
                    <Badge variant="outline" className="text-xs">
                      {company.industry}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1 text-[#64748B] dark:text-gray-300">
                    <Users className="w-4 h-4 text-[#64748B] dark:text-gray-400" />
                    {company.contactCount || 0}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {(company.dealsCount || 0) > 0 ? (
                    <button
                      onClick={() => setViewingCompanyDeals({ id: company.id, name: company.name })}
                      className="text-blue-400 hover:text-blue-300 font-medium hover:underline transition-colors"
                    >
                      {company.dealsCount}
                    </button>
                  ) : (
                    <span className="text-gray-500">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-emerald-400 font-medium">
                  {formatCurrency(company.dealsValue || 0)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleEditCompany(e, company)}
                      title="Edit company"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="danger"
                      size="icon"
                      onClick={(e) => handleDeleteCompany(e, company)}
                      title="Delete company"
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

        {filteredAndSortedCompanies.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[#64748B] dark:text-gray-400 mb-2">No companies found</h3>
            <p className="text-[#94A3B8] dark:text-gray-500 text-sm">
              {searchTerm || sizeFilter !== 'all' || industryFilter !== 'all' || locationFilter !== 'all'
                ? 'Try adjusting your search criteria or filters'
                : 'Get started by adding your first company'
              }
            </p>
          </div>
        )}
      </div>

      {/* Company Deals Modal */}
      <CompanyDealsModal
        isOpen={!!viewingCompanyDeals}
        onClose={() => setViewingCompanyDeals(null)}
        companyId={viewingCompanyDeals?.id || null}
        companyName={viewingCompanyDeals?.name || ''}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingCompany} onOpenChange={() => setDeletingCompany(null)}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Company</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete <span className="font-semibold text-white">"{deletingCompany?.name}"</span>? 
              This action cannot be undone and will also remove all associated contacts, deals, and activities.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={() => setDeletingCompany(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
            >
              Delete Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog - Simple for now */}
      <Dialog open={!!editingCompany} onOpenChange={() => setEditingCompany(null)}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-blue-400">Edit Company</DialogTitle>
            <DialogDescription className="text-gray-400">
              Editing company: <span className="font-semibold text-white">"{editingCompany?.name}"</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-400 text-sm">
              Full edit functionality coming soon. Click on the company row to view the complete company profile where you can edit all details.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={() => setEditingCompany(null)}
            >
              Close
            </Button>
            <Button
              variant="default"
              onClick={() => {
                if (editingCompany) {
                  navigate(`/companies/${editingCompany.id}`);
                  setEditingCompany(null);
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
            <DialogTitle className="text-red-400">Delete Selected Companies</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete <strong>{selectedCompanies.size}</strong> selected companies? This action cannot be undone.
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
              Delete {selectedCompanies.size} Companies
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
} 