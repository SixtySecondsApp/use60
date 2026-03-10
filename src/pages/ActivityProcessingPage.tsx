import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useOriginalActivities } from '@/lib/hooks/useOriginalActivities';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'; // Import Tabs
import { format } from 'date-fns';
import { Loader2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import type { OriginalActivity } from '@/lib/hooks/useOriginalActivities';
import { supabase } from '@/lib/supabase/clientV2';
import { EditActivityEmailModal } from '@/components/activities/EditActivityEmailModal';
import logger from '@/lib/utils/logger';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Define types for the filter state
type ActivityView = 'missing-email' | 'process-ready';

// Define type for User profile data needed for filter
interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

// Get user initials from a full name string
const getInitialsFromName = (name?: string | null) => {
  if (!name) return '??';
  return name.split(' ').map((n) => n?.[0] || '').join('').toUpperCase();
};

export function ActivityProcessingPage() {
  const [currentView, setCurrentView] = useState<ActivityView>('missing-email');
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined); // State for user filter
  const [userList, setUserList] = useState<UserProfile[]>([]); // State for user list
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [showAutoProcessInfo, setShowAutoProcessInfo] = useState(true);

  // Fetch user list for the dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('id, first_name, last_name')
          .order('first_name', { ascending: true });
        
        if (error) throw error;
        setUserList(data || []);
      } catch (error) {
        logger.error("Error fetching users:", error);
        toast.error("Failed to load user list for filtering.");
        setUserList([]); // Set empty list on error
      } finally {
        setIsLoadingUsers(false);
      }
    };
    fetchUsers();
  }, []);

  // Filters based on the current view AND selected user
  const filters = useMemo(() => {
    let baseFilters: any = {}; // Define baseFilters type
    if (currentView === 'missing-email') {
      baseFilters = {
        contact_identifier: 'IS_NULL' as const,
        type_neq: 'Outbound'
      };
    } else { // process-ready view
      baseFilters = {
        contact_identifier: 'IS_NOT_NULL' as const,
        is_processed: false,
        type_neq: 'Outbound Activity'
      };
    }
    // Add user_id filter if selected
    if (selectedUserId) {
      baseFilters.user_id = selectedUserId;
    }
    return baseFilters;
  }, [currentView, selectedUserId]); // Add selectedUserId dependency

  // Fetch activities using the dynamic filters
  const {
    activities,
    isLoading: isHookLoading, // Rename to avoid conflict
    error,
    refreshActivities,
    updateActivity // Needed for missing-email view
  } = useOriginalActivities(filters);

  // State for the edit modal (for missing-email view)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<OriginalActivity | null>(null);

  // State to track processing activity (for process-ready view)
  const [processingActivityId, setProcessingActivityId] = useState<string | null>(null);

  // State to track processing all activities
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  // --- Handlers for Missing Email View ---
  const handleEditClick = (activity: OriginalActivity) => {
    setEditingActivity(activity);
    setIsEditModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsEditModalOpen(false);
    setEditingActivity(null);
  };

  const handleSaveEmail = async (activityId: string, email: string) => {
    if (!updateActivity) return false;
    const success = await updateActivity(activityId, { contact_identifier: email });
    if (success) {
      refreshActivities(); // Refresh to potentially move activity to 'process-ready'
      return true;
    } else {
      return false;
    }
  };

  // --- Handler for Process Ready View ---
  const handleProcessClick = async (activityId: string) => {
    setProcessingActivityId(activityId);
    logger.log(`[ActivityProcessingPage] Attempting to process activity: ${activityId}`);
    const toastId = toast.loading(`Processing activity ${activityId}...`);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('process-jobs-router', {
        body: { action: 'single_activity', activityId },
      });

      if (functionError) {
          if (functionError.message.includes('already processed')) {
              toast.info(`Activity ${activityId} was already processed.`, { id: toastId });
              refreshActivities();
          } else {
              throw functionError;
          }
      } else {
          logger.log('[ActivityProcessingPage] Function response:', data);
          toast.success(`Successfully processed activity ${activityId}.`, { id: toastId });
          refreshActivities();
      }
    } catch (err: any) {
      logger.error(`Error processing activity ${activityId}:`, err);
      const context = err.context ? ` (${err.context.status || 'unknown status'})` : '';
      toast.error('Failed to process activity', {
          id: toastId,
          description: `${err.message || 'Unknown error'}${context}`
      });
    } finally {
      setProcessingActivityId(null);
    }
  };

  // Handler to process all ready activities
  const handleProcessAllReady = async () => {
    if (!activities || activities.length === 0) return;
    setIsProcessingAll(true);
    let processedCount = 0;
    let errorCount = 0;
    const toastId = toast.loading('Processing all ready activities...');
    for (const activity of activities) {
      try {
        await handleProcessClick(activity.id);
        processedCount++;
      } catch (err) {
        errorCount++;
        // Optionally, log or handle individual errors
      }
    }
    setIsProcessingAll(false);
    if (errorCount === 0) {
      toast.success(`Successfully processed all (${processedCount}) activities.`, { id: toastId });
    } else {
      toast.error(`Processed ${processedCount} activities, but ${errorCount} failed.`, { id: toastId });
    }
    refreshActivities();
  };

  // Determine overall loading state
  const isLoading = isHookLoading || (processingActivityId !== null && currentView === 'process-ready');

  // Combine loading message logic
  const getLoadingMessage = () => {
    if (isHookLoading && activities.length === 0) {
       return currentView === 'missing-email'
         ? 'Loading activities missing email...'
         : 'Loading activities ready for processing...';
    }
    if (isHookLoading && processingActivityId === null) return 'Refreshing...'; // Refreshing state
    return null; // Not loading or processing
  };

  const loadingMessage = getLoadingMessage();

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load activities: {error.message || 'Unknown error'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // --- Dynamic Content based on View ---
  const pageTitle = currentView === 'missing-email' ? 'Activities Missing Email' : 'Process Ready Activities';
  const pageDescription = currentView === 'missing-email'
    ? "These activities (excluding 'Outbound') were logged without an email address. Please update the original activity logs with the correct email address to enable pipeline linking."
    : "These activities have a contact identifier (email) but have not yet been processed to create or link related deals/deal activities. Click 'Process' to handle them individually. (Excluding 'Outbound Activity' types).";
  const emptyMessage = currentView === 'missing-email'
    ? "No activities (excluding 'Outbound') found missing an email address."
    : "No activities found that are ready for processing.";


  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">{pageTitle}</h1>
      <p className="text-muted-foreground mb-6">{pageDescription}</p>

      {/* Auto-Processing Information Banner */}
      {showAutoProcessInfo && currentView === 'process-ready' && (
        <Alert className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <AlertTitle className="text-green-700 dark:text-green-400">🎉 Automatic Processing is Now Active!</AlertTitle>
          <AlertDescription className="text-gray-700 dark:text-gray-300">
            New activities with email addresses are automatically processed into deals. 
            Activities shown here may be legacy items or require manual review. 
            The "Process" button remains available for manual processing when needed.
            <Button 
              variant="ghost" 
              size="sm" 
              className="ml-4 text-xs text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setShowAutoProcessInfo(false)}
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Filters Row */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <Tabs value={currentView} onValueChange={(value) => setCurrentView(value as ActivityView)} className="w-full md:w-auto">
          <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
            <TabsTrigger value="missing-email">Missing Email</TabsTrigger>
            <TabsTrigger value="process-ready">Process Ready</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* User Filter Dropdown */}
        <Select 
          value={selectedUserId || 'all'} 
          onValueChange={(value) => setSelectedUserId(value === 'all' ? undefined : value)}
          disabled={isLoadingUsers || isLoading} // Disable while loading users or activities
        >
          <SelectTrigger className="w-full md:w-[280px] bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white ring-offset-gray-100 dark:ring-offset-gray-900 focus:ring-emerald-500">
            <SelectValue placeholder="Filter by user..." />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800/95 backdrop-blur-md border border-gray-300 dark:border-gray-700/50 text-gray-900 dark:text-white">
            <SelectItem value="all" className="focus:bg-gray-100 dark:focus:bg-gray-700/50 focus:text-gray-900 dark:focus:text-white">All Users</SelectItem>
            {isLoadingUsers ? (
              <SelectItem value="loading" disabled>Loading users...</SelectItem>
            ) : (
              userList.map(user => (
                <SelectItem key={user.id} value={user.id} className="focus:bg-gray-100 dark:focus:bg-gray-700/50 focus:text-gray-900 dark:focus:text-white">
                  {user.first_name} {user.last_name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Process All Ready Button - only show in process-ready view and if there are activities */}
      {currentView === 'process-ready' && activities.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="default"
            onClick={handleProcessAllReady}
            disabled={isProcessingAll || isHookLoading || activities.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg shadow"
          >
            {isProcessingAll ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing All...</>
            ) : (
              'Process All Ready'
            )}
          </Button>
        </div>
      )}

      {(isHookLoading && activities.length === 0 && !error) ? (
         <div className="text-center p-6">{loadingMessage}</div>
      ) : activities.length === 0 && !isHookLoading ? (
        <p className="mt-6 text-center text-gray-400">{emptyMessage}</p>
      ) : (
        <div className="my-6 p-4 bg-white dark:bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-200 dark:border-gray-800/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 dark:border-gray-800/50">
                <TableHead className="px-3 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Date</TableHead>
                <TableHead className="px-3 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Type</TableHead>
                <TableHead className="px-3 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Client Name</TableHead>
                {/* Conditionally show Email column */}
                {currentView === 'process-ready' && (
                  <TableHead className="px-3 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Contact Email</TableHead>
                )}
                <TableHead className="px-3 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Details</TableHead>
                <TableHead className="px-3 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Logged By</TableHead>
                <TableHead className="px-3 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingMessage && loadingMessage === 'Refreshing...' && <TableRow><TableCell colSpan={currentView === 'process-ready' ? 7 : 6} className="h-12 text-center text-muted-foreground">{loadingMessage}</TableCell></TableRow>}
              {activities.map((activity) => {
                const isProcessingThis = processingActivityId === activity.id && currentView === 'process-ready';
                return (
                  <TableRow key={activity.id} className={`${isProcessingThis ? 'opacity-50 pointer-events-none' : ''} border-b border-gray-200 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/20`}>
                    <TableCell className="px-3 py-3 text-sm text-gray-900 dark:text-white">{format(new Date(activity.date), 'PP')}</TableCell>
                    <TableCell className="px-3 py-3"><Badge variant="secondary">{activity.type}</Badge></TableCell>
                    <TableCell className="px-3 py-3 text-sm text-gray-900 dark:text-white">{activity.client_name || '-'}</TableCell>
                    {/* Conditionally show Email cell */}
                    {currentView === 'process-ready' && (
                      <TableCell className="px-3 py-3 text-sm text-gray-900 dark:text-white">{activity.contact_identifier || '-'}</TableCell>
                    )}
                    <TableCell className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">{activity.details || '-'}</TableCell>
                    <TableCell className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                          <AvatarFallback className='text-xs sm:text-sm font-medium text-[#37bd7e] bg-[#37bd7e]/10 border border-[#37bd7e]/20'>
                            {getInitialsFromName(activity.sales_rep)}
                          </AvatarFallback>
                        </Avatar>
                        <span className='text-sm sm:text-base text-gray-900 dark:text-white'>
                          {activity.sales_rep || '(no name)'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right">
                      {/* Conditionally render action button */}
                      {currentView === 'missing-email' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(activity)}
                          className="p-2 rounded-lg text-gray-400 hover:bg-[#37bd7e]/20 hover:text-[#37bd7e] transition-colors"
                          disabled={isLoading}
                        >
                          <Edit2 className="h-4 w-4" />
                          <span className="sr-only">Edit Email</span>
                        </Button>
                      ) : ( // process-ready view
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleProcessClick(activity.id)}
                          disabled={isProcessingThis || isHookLoading}
                          className="px-3 py-1.5 rounded-lg text-gray-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {isProcessingThis ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                          ) : (
                            'Process'
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Button
        variant="secondary"
        onClick={refreshActivities}
        disabled={isLoading} // Disable if hook is loading or an activity is being processed
        className="mt-4 dark:text-white"
       >
        {isHookLoading && processingActivityId === null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {isHookLoading && processingActivityId === null ? 'Refreshing...' : 'Refresh List'}
      </Button>

      {/* Render modal only if needed (for missing-email view) */}
      {currentView === 'missing-email' && editingActivity && (
        <EditActivityEmailModal
          activity={editingActivity}
          isOpen={isEditModalOpen}
          onClose={handleCloseModal}
          onSave={handleSaveEmail}
        />
      )}
    </div>
  );
}

export default ActivityProcessingPage; 