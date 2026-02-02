import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, 
  Users, 
  Heart, 
  Video,
  Search,
  Plus,
  Filter,
  Download,
  CheckSquare,
  Square,
  X,
  Sparkles,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { OwnerFilterV3 } from '@/components/OwnerFilterV3';
import { VisuallyHidden } from '@/components/calendar/ScreenReaderAnnouncements';
import { toast } from 'sonner';
import ConnectedFilterSidebar from '@/components/ConnectedFilterSidebar';
import ContactsView from '@/components/ContactsView';
import DealsView from '@/components/DealsView';
import MeetingsView from '@/components/MeetingsView';

// Import new components
import CompanyCard from '@/components/CompanyCard';
import ViewSpecificStats from '@/components/ViewSpecificStats';
import ViewModeToggle from '@/components/ViewModeToggle';
import AddCompanyModal from '@/components/AddCompanyModal';
import AddContactModal from '@/components/AddContactModal';
import { DealForm } from '@/components/Pipeline/DealForm';

// Import existing hooks
import { useUser } from '@/lib/hooks/useUser';
import { useCompanies } from '@/lib/hooks/useCompanies';
import { useContacts } from '@/lib/hooks/useContacts';
import { useDeals } from '@/lib/hooks/useDeals';
import type { Company } from '@/lib/database/models';
import { isUserAdmin, canEditDeal, canDeleteDeal } from '@/lib/utils/adminUtils';
import logger from '@/lib/utils/logger';

type SortField = 'name' | 'domain' | 'size' | 'industry' | 'contactCount' | 'dealsCount' | 'dealsValue' | 'created_at' | 'updated_at';
type SortDirection = 'asc' | 'desc';

type IconComponent = React.ComponentType<{ className?: string }>;

const TabButton = ({ active, onClick, icon: Icon, label, count }: {
  active: boolean;
  onClick: () => void;
  icon: IconComponent;
  label: string;
  count?: number;
}) => (
  <motion.button
    onClick={onClick}
    className={`
      relative px-4 py-2.5 rounded-xl flex items-center gap-2.5 transition-all duration-300
      ${active
        ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/20'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50'
      }
    `}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
  >
    <Icon className="w-4 h-4" />
    <span className="font-medium">{label}</span>
    {count && (
      <span className={`
        text-xs px-2 py-0.5 rounded-full
        ${active ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}
      `}>
        {count}
      </span>
    )}
    {active && (
      <motion.div
        layoutId="activeTab"
        className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 rounded-xl -z-10"
        transition={{ type: "spring", duration: 0.5 }}
      />
    )}
  </motion.button>
);

export default function ElegantCRM() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userData, isLoading: isUserLoading } = useUser();
  
  // State management - read initial tab from URL params or default to companies
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab');
    return tabParam && ['companies', 'contacts', 'deals', 'meetings'].includes(tabParam) 
      ? tabParam 
      : 'companies';
  });
  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // Pagination for companies
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => {
      setPage(1); // reset to first page on new search
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => clearTimeout(id);
  }, [searchInput]);
  const [sizeFilter, setSizeFilter] = useState<string[]>([]);
  const [industryFilter, setIndustryFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [dealStageFilter, setDealStageFilter] = useState<string[]>([]);
  // Initialize with undefined, will be set when userData loads
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null | undefined>(undefined);
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Sidebar state - start closed
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Multi-select functionality
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  const [isSelectModeActive, setIsSelectModeActive] = useState(false);
  
  // Deletion state
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  
  // Modal states
  const [addCompanyModalOpen, setAddCompanyModalOpen] = useState(false);
  const [addContactModalOpen, setAddContactModalOpen] = useState(false);
  const [addDealModalOpen, setAddDealModalOpen] = useState(false);

  // Mark initial load complete after mount and set default owner
  useEffect(() => {
    if (isInitialLoad) {
      // Use requestAnimationFrame to ensure rendering is complete
      requestAnimationFrame(() => {
        setIsInitialLoad(false);
      });
    }
  }, []);
  
  // Set default owner when userData loads
  useEffect(() => {
    if (userData?.id && selectedOwnerId === undefined) {
      setSelectedOwnerId(userData.id);
    }
  }, [userData?.id]);

  // Function to handle tab changes and update URL
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  // Use data hooks
  const { 
    companies, 
    isLoading, 
    error: hookError,
    deleteCompany,
    totalCount
  } = useCompanies({
    search: searchQuery,
    includeStats: false,
    page,
    pageSize
  });

  // Fetch contacts and deals data
  const { contacts, isLoading: contactsLoading } = useContacts({
    search: searchQuery,
    includeCompany: true
  });

  // Use selectedOwnerId directly for fetching deals
  const { deals, isLoading: dealsLoading, createDeal } = useDeals(selectedOwnerId || undefined);

  // Convert error object to string for component compatibility
  const error = hookError instanceof Error ? hookError.message : 
                hookError ? String(hookError) : null;

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

      // Authorization check - filter to only companies the user can delete
      const isAdmin = isUserAdmin(userData);
      const authorizedCompanies = filteredAndSortedCompanies.filter(company => 
        selectedIds.includes(company.id) && (isAdmin || company.owner_id === userData?.id)
      );

      if (authorizedCompanies.length !== selectedIds.length) {
        const unauthorizedCount = selectedIds.length - authorizedCompanies.length;
        toast.error(`You do not have permission to delete ${unauthorizedCount} of the selected companies`);
        
        if (authorizedCompanies.length === 0) {
          return;
        }
      }

      // Delete only authorized companies
      const deletePromises = authorizedCompanies.map(company => deleteCompany(company.id));
      await Promise.all(deletePromises);

      setSelectedCompanies(new Set());
      setIsSelectAllChecked(false);
      setBulkDeleteDialogOpen(false);
      
      toast.success(`Successfully deleted ${authorizedCompanies.length} companies`);
    } catch (error) {
      toast.error('Failed to delete selected companies');
    }
  };

  // Filter and sort companies
  const filteredAndSortedCompanies = useMemo(() => {
    let filtered = companies.filter(company => {
      const matchesSize = sizeFilter.length === 0 || sizeFilter.includes(company.size || '');
      const matchesIndustry = industryFilter.length === 0 || industryFilter.includes(company.industry || '');
      const matchesLocation = locationFilter.length === 0 || locationFilter.includes(company.location || '');
      
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
  }, [companies, sizeFilter, industryFilter, locationFilter, selectedOwnerId, sortField, sortDirection, searchQuery]);

  // Update select all checkbox state
  useEffect(() => {
    setIsSelectAllChecked(
      selectedCompanies.size > 0 && 
      selectedCompanies.size === filteredAndSortedCompanies.length && 
      filteredAndSortedCompanies.length > 0
    );
  }, [selectedCompanies.size, filteredAndSortedCompanies.length]);

  // Get unique values for filters with counts
  const getFilterOptions = (field: keyof Company, data: Company[] = companies) => {
    const counts: { [key: string]: number } = {};
    data.forEach(item => {
      const value = item[field];
      if (value) {
        const stringValue = String(value);
        counts[stringValue] = (counts[stringValue] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([label, count]) => ({ label, count }));
  };

  const sizeOptions = getFilterOptions('size');
  const industryOptions = getFilterOptions('industry');
  const locationOptions = getFilterOptions('location');
  
  // Get unique values for backward compatibility
  const uniqueSizes = [...new Set(companies.map(c => c.size).filter(Boolean))];
  const uniqueIndustries = [...new Set(companies.map(c => c.industry).filter(Boolean))];

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

  // Navigation and action handlers
  const handleCompanyNavigate = (company: Company) => {
    navigate(`/companies/${company.id}`);
  };

  const handleEditCompany = (company: Company) => {
    // Authorization check - users can edit companies they own or admins can edit any
    const isAdmin = isUserAdmin(userData);
    const isOwner = company.owner_id === userData?.id;
    
    if (!isAdmin && !isOwner) {
      toast.error('You do not have permission to edit this company');
      return;
    }
    
    navigate(`/companies/${company.id}`);
  };

  const handleDeleteCompany = (company: Company) => {
    // Authorization check - users can delete companies they own or admins can delete any  
    const isAdmin = isUserAdmin(userData);
    const isOwner = company.owner_id === userData?.id;
    
    if (!isAdmin && !isOwner) {
      toast.error('You do not have permission to delete this company');
      return;
    }
    
    setDeletingCompany(company);
  };

  const confirmDelete = async () => {
    if (!deletingCompany) return;
    
    try {
      await deleteCompany(deletingCompany.id);
      toast.success(`Company "${deletingCompany.name}" deleted successfully`);
      setDeletingCompany(null);
    } catch (error) {
      toast.error('Failed to delete company');
    }
  };

  const handleAddCompany = () => {
    setAddCompanyModalOpen(true);
  };

  const handleAddContact = () => {
    setAddContactModalOpen(true);
  };

  const handleAddDeal = () => {
    setAddDealModalOpen(true);
  };

  const handleSaveDeal = async (formData: any) => {
    try {
      await createDeal(formData);
      setAddDealModalOpen(false);
      toast.success('Deal created successfully!');
    } catch (error) {
      toast.error('Failed to create deal');
    }
  };

  // Get the appropriate add button based on active tab
  const getAddButton = () => {
    switch (activeTab) {
      case 'companies':
        return (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAddCompany}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 border border-emerald-400/20 hover:border-emerald-400/40 transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            Add Company
          </motion.button>
        );
      case 'contacts':
        return (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAddContact}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 border border-blue-400/20 hover:border-blue-400/40 transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </motion.button>
        );
      case 'deals':
        return (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAddDeal}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 border border-purple-400/20 hover:border-purple-400/40 transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            Add Deal
          </motion.button>
        );
      case 'meetings':
        return (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => toast.info('Meeting creation coming soon!')}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 border border-orange-400/20 hover:border-orange-400/40 transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            Add Meeting
          </motion.button>
        );
      default:
        return null;
    }
  };

  // Tab definitions with real data counts
  const tabs = [
    { id: 'companies', label: 'Companies', icon: Building2, count: companies.length },
    { id: 'contacts', label: 'Contacts', icon: Users, count: contacts.length },
    { id: 'deals', label: 'Deals', icon: Heart, count: deals.length },
    { id: 'meetings', label: 'Meetings', icon: Video, count: 0 }, // Will be implemented later
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gradient-to-br dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 text-gray-900 dark:text-gray-100 flex">
        <ConnectedFilterSidebar
          activeTab={activeTab}
          sizeFilter={sizeFilter}
          setSizeFilter={setSizeFilter}
          industryFilter={industryFilter}
          setIndustryFilter={setIndustryFilter}
          locationFilter={locationFilter}
          setLocationFilter={setLocationFilter}
          dealStageFilter={dealStageFilter}
          setDealStageFilter={setDealStageFilter}
          sizeOptions={[]}
          industryOptions={[]}
          locationOptions={[]}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          skipInitialAnimation={isInitialLoad}
          className="flex-shrink-0"
        />
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="bg-white/95 dark:bg-gray-900/50 backdrop-blur-sm rounded-xl p-8 border border-gray-200 dark:border-gray-800/50">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/4"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2"></div>
              <div className="space-y-3 mt-6">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800/50 rounded-lg"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-gradient-to-br dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 text-gray-900 dark:text-gray-100 flex">
        <ConnectedFilterSidebar
          activeTab={activeTab}
          sizeFilter={sizeFilter}
          setSizeFilter={setSizeFilter}
          industryFilter={industryFilter}
          setIndustryFilter={setIndustryFilter}
          locationFilter={locationFilter}
          setLocationFilter={setLocationFilter}
          dealStageFilter={dealStageFilter}
          setDealStageFilter={setDealStageFilter}
          sizeOptions={[]}
          industryOptions={[]}
          locationOptions={[]}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          skipInitialAnimation={isInitialLoad}
          className="flex-shrink-0"
        />
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-xl p-6">
            <h3 className="text-red-600 dark:text-red-400 font-medium mb-2">Error loading data</h3>
            <p className="text-red-500 dark:text-red-300 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-900 dark:text-gray-100">
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 rounded-xl border border-emerald-500/20">
              <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
              Customer Relationship Management
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 ml-12">Build lasting relationships and close more deals</p>
        </motion.div>

        {/* View-Specific Stats - Show for all tabs */}
        <ViewSpecificStats 
          activeTab={activeTab}
          companies={companies}
          contacts={contacts}
          deals={deals}
          meetings={[]} // Empty array for now since meetings are not implemented
        />

        {/* Navigation and Controls */}
        <div className="bg-white/95 dark:bg-gray-900/50 backdrop-blur-xl rounded-2xl p-4 border border-gray-200 dark:border-gray-800/50 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto">
              {tabs.map((tab) => (
                <TabButton
                  key={tab.id}
                  active={activeTab === tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  icon={tab.icon}
                  label={tab.label}
                  count={tab.count}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder={activeTab === 'contacts' ? 'Search contacts...' : activeTab === 'companies' ? 'Search companies...' : activeTab === 'deals' ? 'Search deals...' : activeTab === 'meetings' ? 'Search meetings...' : 'Search...'}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-8 pl-10 pr-4 py-1.5 text-xs bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 w-64"
                />
              </div>

              {/* View mode toggle */}
              <ViewModeToggle
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                variant="compact"
              />

              {/* Filter button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all duration-200"
              >
                <Filter className="w-4 h-4" />
              </button>

              {/* Dynamic Add button */}
              {getAddButton()}

              
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800/50">
            {/* Other Filters */}
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <OwnerFilterV3
                defaultToCurrentUser={true}
                showQuickFilters={false}
                compact={true}
                selectedOwnerId={selectedOwnerId}
                onOwnerChange={(newOwnerId) => {
                  // Only update if actually changed
                  if (newOwnerId !== selectedOwnerId) {
                    setSelectedOwnerId(newOwnerId);
                  }
                }}
                className="w-full sm:w-[180px]"
              />

              <Select
                value={sizeFilter.length === 0 ? 'all' : sizeFilter[0]}
                onValueChange={(value) => setSizeFilter(value === 'all' ? [] : [value])}
              >
                <SelectTrigger className="h-8 w-full sm:w-[180px] bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-xs px-3 py-1.5">
                  <SelectValue placeholder="All Sizes" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="all">All Sizes</SelectItem>
                  {uniqueSizes.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={industryFilter.length === 0 ? 'all' : industryFilter[0]}
                onValueChange={(value) => setIndustryFilter(value === 'all' ? [] : [value])}
              >
                <SelectTrigger className="h-8 w-full sm:w-[180px] bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-xs px-3 py-1.5">
                  <SelectValue placeholder="All Industries" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="all">All Industries</SelectItem>
                  {uniqueIndustries.map(industry => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={exportToCSV}
                variant="outline"
                size="sm"
                className="border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700/70 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600/80 hover:text-gray-900 dark:hover:text-white hover:border-gray-400 shadow-sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button
                onClick={toggleSelectMode}
                variant={isSelectModeActive ? "default" : "outline"}
                className={isSelectModeActive ? "bg-violet-600 hover:bg-violet-700 text-white" : "border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700/70 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600/80 hover:text-gray-900 dark:hover:text-white hover:border-gray-400 shadow-sm"}
                size="sm"
              >
                {isSelectModeActive ? <CheckSquare className="w-4 h-4 mr-2" /> : <Square className="w-4 h-4 mr-2" />}
                {isSelectModeActive ? 'Exit Select' : 'Select Mode'}
              </Button>
            </div>
          </div>
        </div>

        {/* Bulk Actions - Only show when select mode is active and companies are selected */}
        {activeTab === 'companies' && (
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
              className="bg-gradient-to-r from-violet-600/10 via-purple-600/10 to-violet-600/10 backdrop-blur-xl border border-violet-500/20 rounded-xl p-4 shadow-2xl shadow-violet-500/10 mb-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30">
                    <CheckSquare className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {selectedCompanies.size} selected
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setBulkDeleteDialogOpen(true)}
                    variant="outline"
                    size="sm"
                    className="border-red-300 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/10 hover:border-red-400 dark:hover:border-red-500/50 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
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
                    className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/50"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        )}

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'companies' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`${viewMode === 'grid' 
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' 
                : 'space-y-3'} pb-20`}
            >
              {filteredAndSortedCompanies.map((company, index) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  viewMode={viewMode}
                  isSelected={selectedCompanies.has(company.id)}
                  isSelectMode={isSelectModeActive}
                  onSelect={handleSelectCompany}
                  onEdit={handleEditCompany}
                  onDelete={handleDeleteCompany}
                  onNavigate={handleCompanyNavigate}
                />
              ))}
              
              {filteredAndSortedCompanies.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Building2 className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No companies found</h3>
                  <p className="text-gray-500 text-sm">
                    {searchQuery || sizeFilter !== 'all' || industryFilter !== 'all'
                      ? 'Try adjusting your search criteria or filters'
                      : 'Get started by adding your first company'
                    }
                  </p>
                </div>
              )}
              {/* Bottom pagination, centered */}
              {filteredAndSortedCompanies.length > 0 && (
                <div className="col-span-full flex flex-col items-center justify-center gap-2 pt-4 pb-2">
                  <div className="text-xs text-gray-500">
                    Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount || (page * pageSize))} of {totalCount || 'many'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 disabled:opacity-50"
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <div className="px-2 text-xs text-gray-600 dark:text-gray-400 select-none">
                      Page {page}
                    </div>
                    <button
                      className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 disabled:opacity-50"
                      disabled={totalCount !== 0 && page * pageSize >= (totalCount || 0)}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Next
                    </button>
                    <select
                      className="ml-2 h-8 text-xs bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded px-2"
                      value={pageSize}
                      onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }}
                      aria-label="Page size"
                    >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'contacts' && (
            <ContactsView 
              showControls={false} 
              contacts={contacts}
              isLoading={contactsLoading}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          )}

          {activeTab === 'deals' && (
            <DealsView 
              showControls={false}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          )}

          {activeTab === 'meetings' && (
            <MeetingsView 
              showControls={false}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          )}
        </AnimatePresence>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deletingCompany} onOpenChange={() => setDeletingCompany(null)}>
          <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white">
            <DialogHeader>
              <DialogTitle className="text-red-600 dark:text-red-400">Delete Company</DialogTitle>
              <DialogDescription className="text-gray-600 dark:text-gray-400">
                Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-white">"{deletingCompany?.name}"</span>?
                This action cannot be undone and will also remove all associated contacts, deals, and activities.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setDeletingCompany(null)}
                className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete Company
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Dialog */}
        <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white">
            <DialogHeader>
              <DialogTitle className="text-red-600 dark:text-red-400">Delete Selected Companies</DialogTitle>
              <DialogDescription className="text-gray-600 dark:text-gray-400">
                Are you sure you want to delete <strong>{selectedCompanies.size}</strong> selected companies? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setBulkDeleteDialogOpen(false)}
                className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete {selectedCompanies.size} Companies
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Filter Sidebar */}
        <ConnectedFilterSidebar
          activeTab={activeTab}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          skipInitialAnimation={isInitialLoad}
          sizeFilter={sizeFilter}
          setSizeFilter={setSizeFilter}
          industryFilter={industryFilter}
          setIndustryFilter={setIndustryFilter}
          locationFilter={locationFilter}
          setLocationFilter={setLocationFilter}
          dealStageFilter={dealStageFilter}
          setDealStageFilter={setDealStageFilter}
          sizeOptions={sizeOptions}
          industryOptions={industryOptions}
          locationOptions={locationOptions}
        />
        
        {/* Add Modals */}
        <AddCompanyModal
          isOpen={addCompanyModalOpen}
          onClose={() => setAddCompanyModalOpen(false)}
          onSuccess={() => {
            // Optionally refetch companies data here
            toast.success('Company added successfully!');
          }}
        />
        
        <AddContactModal
          isOpen={addContactModalOpen}
          onClose={() => setAddContactModalOpen(false)}
          onSuccess={() => {
            // Optionally refetch contacts data here
            toast.success('Contact added successfully!');
          }}
        />
        
        {/* Deal Form Modal */}
        {addDealModalOpen && (
          <Dialog open={addDealModalOpen} onOpenChange={setAddDealModalOpen}>
            <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
              <VisuallyHidden>
                <DialogTitle>Add Deal</DialogTitle>
              </VisuallyHidden>
              <DealForm
                onSave={handleSaveDeal}
                onCancel={() => setAddDealModalOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}