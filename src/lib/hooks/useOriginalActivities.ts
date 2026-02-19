import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from '@/lib/hooks/useUser'; // To ensure user is logged in
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

// Cast supabase client to bypass type issues with dynamic filter chaining
const db = supabase as unknown as typeof supabase;

// Define the structure of an activity from the 'activities' table
export interface OriginalActivity {
  id: string;
  user_id: string;
  type: string;
  status: string;
  priority: string;
  client_name: string;
  sales_rep: string; // This might be redundant if user_id links to profile
  details?: string | null;
  amount?: number | null;
  date: string;
  created_at?: string | null;
  updated_at?: string | null;
  quantity: number;
  contact_identifier?: string | null;
  contact_identifier_type?: string | null;
  is_processed?: boolean | null; // Include if needed for filtering later
  // Joined Profile data
  profiles?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

// Define possible filters for the activities query
export interface OriginalActivityFilters {
  contact_identifier?: 'IS_NULL' | 'IS_NOT_NULL' | string; // Allow checking for null
  is_processed?: boolean;
  type_neq?: string; // Added for not-equal filter on type
  user_id?: string; // Add user_id filter type
}

export function useOriginalActivities(filters?: OriginalActivityFilters) {
  const [activities, setActivities] = useState<OriginalActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const { userData } = useUser(); // Get logged-in user data

  const fetchActivities = useCallback(async () => {
    // Only fetch if user is logged in
    if (!userData?.id) {
        setIsLoading(false);
        setActivities([]); // Clear activities if not logged in
        return;
    }

    // Log the filters being used
    logger.log('[useOriginalActivities] Fetching with filters:', filters);

    try {
      setIsLoading(true);
      setError(null);
      
      // Query the BASE activities table - it should contain sales_rep
      let query = db
        .from('activities') // Query the BASE table
        .select('*') // Select all columns, including sales_rep
        .order('date', { ascending: false }); 

      // Apply filters dynamically (using base table columns)
      if (filters) {
          if (filters.contact_identifier === 'IS_NULL') {
              logger.log('[useOriginalActivities] Applying filter: contact_identifier IS NULL');
              query = query.is('contact_identifier', null);
          } else if (filters.contact_identifier === 'IS_NOT_NULL') {
              logger.log('[useOriginalActivities] Applying filter: contact_identifier IS NOT NULL');
              query = query.not('contact_identifier', 'is', null);
          } 
          // else if (filters.contact_identifier !== undefined) { ... }

          if (filters.is_processed !== undefined) {
             logger.log(`[useOriginalActivities] Applying filter: is_processed = ${filters.is_processed}`);
             query = query.eq('is_processed', filters.is_processed);
          }

          // Handle the case-insensitive not-equal filter for type
          if (filters.type_neq !== undefined) {
             logger.log(`[useOriginalActivities] Applying filter: type ILIKE not ${filters.type_neq}`);
             query = query.not('type', 'ilike', filters.type_neq);
          }

          // Apply user_id filter if present
          if (filters.user_id) {
             logger.log(`[useOriginalActivities] Applying filter: user_id = ${filters.user_id}`);
             query = query.eq('user_id', filters.user_id);
          }
      }
      
      logger.log('[useOriginalActivities] FINAL Query object before execution:', query);
      
      const { data, error: queryError } = await query;
        
      if (queryError) {
          logger.error('[useOriginalActivities] Query error:', queryError);
          throw queryError;
      }
      logger.log('[useOriginalActivities] Fetched data:', data?.length, 'items');
      
      setActivities(data || []);
    } catch (err: any) {
      logger.error('Error fetching original activities:', err);
      setError(err);
      setActivities([]);
    } finally {
      setIsLoading(false);
    }
  }, [userData?.id, filters]); 
  
  useEffect(() => {
    fetchActivities();
    
    // Realtime listener should still listen to the BASE table
    let subscription;
    if (userData?.id) {
      subscription = db
        .channel('original_activity_changes') 
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'activities' // LISTEN to the base table
        }, (payload) => {
          // But trigger a refetch from the VIEW
          logger.log('Original activity change received, refetching from view...', payload);
          fetchActivities(); 
        })
        .subscribe();
    }
      
    return () => {
      if (subscription) {
         db.removeChannel(subscription);
      }
    };
  }, [fetchActivities, userData?.id]); 

  // Function to update an activity in the 'activities' table
  const updateActivity = async (id: string, updates: Partial<Omit<OriginalActivity, 'profiles'>>) => {
    // Ensure user is logged in or has permission (basic check)
    if (!userData?.id) {
        logger.error('User not logged in, cannot update activity.');
        toast.error('Authentication required to update activities.');
        return false; 
    }

    try {
      const { profiles, ...updateData } = updates;

      logger.log(`[useOriginalActivities] Attempting to update activity ${id} with:`, updateData);

      const { error } = await db
        .from('activities') 
        .update(updateData)
        .eq('id', id);
        // Removed .select().single() - we only care if the update itself had an error

      if (error) { 
        logger.error(`[useOriginalActivities] Error during supabase update for activity ${id}:`, error);
        throw error; // Throw the error to be caught below
      }

      // If no error was thrown, the update command executed successfully
      // (even if it updated 0 rows because the ID didn't exist anymore)
      logger.log(`[useOriginalActivities] Update command successful for activity ${id}.`);
      
      // Optional: Trigger manual refresh if needed, though realtime should handle it.
      // refreshActivities(); 

      return true; // Indicate success

    } catch (err: any) {
      // Error is already logged if it came from the supabase call
      // Log other potential errors
      if (!err.code) { // Avoid double logging supabase errors
           logger.error(`[useOriginalActivities] Error updating activity ${id}:`, err);
      }
      setError(err); // Set error state in the hook
      toast.error('Failed to update activity', { description: err.message });
      return false; // Indicate failure
    }
  };

  return {
    activities,
    isLoading,
    error,
    refreshActivities: fetchActivities,
    updateActivity // Expose the update function
  };
} 