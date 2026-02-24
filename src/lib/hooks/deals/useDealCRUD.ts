import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/lib/config';
import { apiCall } from '@/lib/utils/apiUtils';
import { supabase, supabaseAdmin } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';
import { sanitizeErrorMessage, sanitizeUpdateData, createBasicUpdateData } from './utils/dealValidation';
import { processDealData } from './utils/dealCalculations';
import { DealWithRelationships, DealStage, DealCreateData, DealUpdateData } from './types/dealTypes';

export function useDealCRUD(
  effectiveOwnerId?: string,
  onDataChange?: () => void
) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch deals from API
  const fetchDeals = useCallback(async (): Promise<DealWithRelationships[]> => {
    try {
      setIsLoading(true);
      setError(null);
      
      logger.log('🔄 Starting deals fetch for owner:', effectiveOwnerId || 'ALL');
      
      // Check authentication first
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        logger.log('❌ No session found, using service key fallback');
        // Use basic query without complex relationships
        let serviceDealsData, serviceError;
        try {
          logger.log('🔄 Trying basic deals query with service key...');
          let query = (supabaseAdmin as any)
            .from('deals')
            .select(`
              *,
              deal_stages:stage_id(id, name, color, default_probability)
            `);

          // Only filter by owner if effectiveOwnerId is provided
          if (effectiveOwnerId) {
            query = query.eq('owner_id', effectiveOwnerId);
          }

          const result = await query
            .order('created_at', { ascending: false })
            .limit(500); // Safety cap — paginate for orgs with large deal counts
            
          serviceDealsData = result.data;
          serviceError = result.error;
          
          if (serviceError) {
            logger.error('❌ Service key basic query failed:', serviceError);
            throw serviceError;
          }
          
          logger.log(`✅ Service key query successful: ${serviceDealsData?.length || 0} deals found`);
        } catch (relationshipError) {
          logger.error('❌ Service client query failed:', relationshipError);
          throw relationshipError;
        }
          
        const processedDeals = serviceDealsData?.map(processDealData) || [];
        return processedDeals;
      }

      logger.log('✅ Session found, using direct Supabase query');

      // Use a single, efficient query instead of multiple fallbacks
      let dealsData, queryError;
      
      try {
        // Try with regular client first (has user context)
        let query = (supabase as any)
          .from('deals')
          .select(`
            *,
            deal_stages:stage_id(id, name, color, default_probability)
          `);

        // Only filter by owner if effectiveOwnerId is provided
        if (effectiveOwnerId) {
          query = query.eq('owner_id', effectiveOwnerId);
        }

        const result = await query
          .order('created_at', { ascending: false })
          .limit(500); // Safety cap — paginate for orgs with large deal counts

        dealsData = result.data;
        queryError = result.error;

        if (queryError) {
          // If regular client fails, try admin client as fallback
          logger.warn('Regular client failed, trying admin client:', queryError);

          let adminQuery = (supabaseAdmin as any)
            .from('deals')
            .select(`
              *,
              deal_stages:stage_id(id, name, color, default_probability)
            `);

          if (effectiveOwnerId) {
            adminQuery = adminQuery.eq('owner_id', effectiveOwnerId);
          }

          const adminResult = await adminQuery
            .order('created_at', { ascending: false })
            .limit(500); // Safety cap — paginate for orgs with large deal counts
          dealsData = adminResult.data;
          queryError = adminResult.error;
        }
        
        if (queryError) {
          logger.error('❌ All queries failed:', queryError);
          throw queryError;
        }
        
        logger.log(`✅ Query successful: ${dealsData?.length || 0} deals found`);
        
      } catch (err) {
        logger.error('❌ Failed to fetch deals:', err);
        throw err;
      }
      
      // Process deals to match expected format
      const processedDeals = dealsData?.map(processDealData) || [];
      logger.log(`✅ Processing complete: ${processedDeals.length} deals ready`);
      return processedDeals;
      
    } catch (err: any) {
      const sanitizedMessage = sanitizeErrorMessage(err);
      logger.error('❌ Error fetching deals - sanitized message:', sanitizedMessage);
      setError(sanitizedMessage);
      toast.error(sanitizedMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOwnerId]);

  const createDeal = async (dealData: DealCreateData) => {
    try {
      logger.log('🚀 Starting deal creation with data:', dealData);
      logger.log('📍 API_BASE_URL:', API_BASE_URL);
      
      // Try Edge Function first
      try {
        const result = await apiCall(
          `${API_BASE_URL}/deals`,
          {
            method: 'POST',
            body: JSON.stringify(dealData),
          },
          { maxRetries: 1, retryDelay: 1000, showToast: false }
        );

        logger.log('✅ Deal API response:', result);
        toast.success('Deal created successfully');
        onDataChange?.();
        // API returns { data: dealObject }, so we need to check the structure
        const createdDeal = (result as any)?.data?.data || (result as any)?.data || result;
        logger.log('📦 Extracted deal from response:', createdDeal);
        return createdDeal; // Return the created deal object
      } catch (edgeFunctionError) {
        logger.log('⚠️ API call failed, falling back to Supabase:', edgeFunctionError);
        
        // Fallback to direct Supabase client
        // In development mode without proper session, use admin client to bypass RLS
        const { data: { session } } = await supabase.auth.getSession();
        const clientToUse = !session && process.env.NODE_ENV === 'development' ? supabaseAdmin : supabase;
        
        const { data: deal, error } = await (clientToUse as any)
          .from('deals')
          .insert({
            ...dealData,
            stage_changed_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (error) {
          logger.error('❌ Supabase fallback also failed:', error);
          throw error;
        }
        
        logger.log('✅ Deal created via Supabase fallback:', deal);
        toast.success('Deal created successfully');
        onDataChange?.();
        return deal; // Return the created deal object
      }
    } catch (error: any) {
      const sanitizedMessage = sanitizeErrorMessage(error);
      logger.error('Error creating deal - sanitized message:', sanitizedMessage);
      toast.error(sanitizedMessage);
      return false;
    }
  };

  const updateDeal = async (id: string, updates: DealUpdateData) => {
    try {
      logger.log('🔄 Updating deal with data:', updates);
      
      // Try Edge Function first
      try {
        const result = await apiCall(
          `${API_BASE_URL}/deals/${id}`,
          {
            method: 'PUT',
            body: JSON.stringify(updates),
          },
          { maxRetries: 1, retryDelay: 1000, showToast: false }
        );

        logger.log('✅ Edge Function update successful');
        toast.success('Deal updated successfully');
        onDataChange?.();
        return true;
      } catch (edgeFunctionError) {
        logger.warn('⚠️ Edge Function failed, trying direct Supabase client:', edgeFunctionError);
        
        // Fallback to direct Supabase client
        const updateData = { ...updates };
        
        // Handle stage change tracking
        if (updates.stage_id) {
          // Get current deal to check if stage is actually changing
          const { data: currentDeal } = await (supabase as any)
            .from('deals')
            .select('stage_id')
            .eq('id', id)
            .single();

          if (currentDeal && currentDeal.stage_id !== updates.stage_id) {
            updateData.stage_changed_at = new Date().toISOString();
          }
        }
        
        const sanitizedUpdateData = sanitizeUpdateData(updateData);
        logger.log('📤 Final update data being sent to Supabase:', sanitizedUpdateData);
        
        // Try the update with error handling for schema issues
        try {
          const { data: deal, error } = await (supabase as any)
            .from('deals')
            .update(sanitizedUpdateData)
            .eq('id', id)
            .select()
            .single();
          
          if (error) {
            // Handle specific schema cache errors
            if (error.message && error.message.includes('expected_close_date') && error.message.includes('schema cache')) {
              logger.warn('⚠️ Schema cache issue detected, trying update without expected_close_date');
              
              // Remove problematic field and retry
              const { expected_close_date, ...safeUpdateData } = sanitizedUpdateData;
              
              // In development mode without proper session, use admin client to bypass RLS
              const { data: { session } } = await supabase.auth.getSession();
              const clientToUse = !session && process.env.NODE_ENV === 'development' ? supabaseAdmin : supabase;
              
              const { data: fallbackDeal, error: fallbackError } = await (clientToUse as any)
                .from('deals')
                .update(safeUpdateData)
                .eq('id', id)
                .select()
                .single();
                
              if (fallbackError) throw fallbackError;
              
              toast.success('Deal updated successfully (note: close date may need manual update)');
              onDataChange?.();
              return true;
            }
            throw error;
          }
          
          logger.log('✅ Direct Supabase update successful');
          toast.success('Deal updated successfully');
          onDataChange?.();
          return true;
          
        } catch (supabaseError: any) {
          logger.error('❌ Supabase update failed:', supabaseError);
          
          // Last resort: try basic update without potentially problematic fields
          if (supabaseError.message && supabaseError.message.includes('schema cache')) {
            logger.log('🔄 Attempting basic update without problematic fields...');
            
            const basicUpdateData = createBasicUpdateData(updateData);
            
            const { data: basicDeal, error: basicError } = await (supabase as any)
              .from('deals')
              .update(basicUpdateData)
              .eq('id', id)
              .select()
              .single();
              
            if (basicError) throw basicError;
            
            toast.success('Deal updated successfully (some fields may need manual update)');
            onDataChange?.();
            return true;
          }
          
          throw supabaseError;
        }
      }
    } catch (error: any) {
      const sanitizedMessage = sanitizeErrorMessage(error);
      logger.error('❌ Error updating deal - sanitized message:', sanitizedMessage);
      
      // Provide more specific error messages while maintaining sanitization
      let errorMessage = sanitizedMessage;
      if (error.message && error.message.includes('expected_close_date')) {
        errorMessage = 'Failed to update deal - there may be an issue with the close date field';
      } else if (error.message && error.message.includes('schema cache')) {
        errorMessage = 'Database schema issue - please try again or contact support';
      }
      
      toast.error(errorMessage);
      return false;
    }
  };

  const deleteDeal = async (id: string) => {
    try {
      logger.log('🗑️ Starting deal deletion for ID:', id);
      
      // Try Edge Function first
      try {
        const result = await apiCall(
          `${API_BASE_URL}/deals/${id}`,
          {
            method: 'DELETE',
          },
          { maxRetries: 1, retryDelay: 1000, showToast: false }
        );

        logger.log('✅ Edge function deletion successful');
        toast.success('Deal deleted successfully');
        
        // Trigger immediate data refresh
        if (onDataChange) {
          await onDataChange();
        }
        
        return true;
      } catch (edgeFunctionError: any) {
        logger.warn('⚠️ Edge function deletion failed, attempting direct deletion:', edgeFunctionError);
        
        // If it's a permission error, don't try fallback
        if (edgeFunctionError?.status === 403) {
          throw edgeFunctionError;
        }
        
        // If it's a foreign key constraint error, don't try fallback
        if (edgeFunctionError?.status === 409) {
          throw edgeFunctionError;
        }
        
        // Try direct Supabase deletion - don't select the deleted row
        // Use admin client in development for better permissions
        const { data: { session } } = await supabase.auth.getSession();
        const clientToUse = !session && process.env.NODE_ENV === 'development' ? supabaseAdmin : supabase;
        
        const { error } = await (clientToUse as any)
          .from('deals')
          .delete()
          .eq('id', id);
        
        if (error) {
          logger.error('❌ Direct Supabase deletion error:', error);
          
          // Handle specific Postgres error codes
          if (error.code === '23503') {
            throw new Error('Cannot delete deal due to related records. Please remove associated activities, splits, or contacts first.');
          }
          
          if (error.code === 'PGRST116' || error.code === 'PGRST301') {
            // This might actually mean success if the row doesn't exist
            logger.log('⚠️ Deal may have been already deleted');
            // Still trigger refresh to update the UI
            if (onDataChange) {
              await onDataChange();
            }
            return true;
          }
          
          throw error;
        }
        
        logger.log('✅ Direct Supabase deletion successful');
        toast.success('Deal deleted successfully');
        
        // Trigger immediate data refresh
        if (onDataChange) {
          await onDataChange();
        }
        
        return true;
      }
    } catch (error: any) {
      let errorMessage = sanitizeErrorMessage(error);
      
      // Provide user-friendly error messages
      if (error?.message?.includes('foreign key') || error?.message?.includes('related records')) {
        if (error?.message?.includes('tasks')) {
          errorMessage = 'This deal has associated tasks. The database constraints need to be updated to allow deletion. Please contact support.';
        } else {
          errorMessage = 'Cannot delete deal due to related records. Please contact support if this persists.';
        }
      } else if (error?.message?.includes('not found')) {
        errorMessage = 'Deal not found or already deleted.';
      } else if (error?.message?.includes('not authorized') || error?.status === 403) {
        errorMessage = 'You are not authorized to delete this deal.';
      }
      
      logger.error('Error deleting deal - sanitized message:', errorMessage);
      toast.error(errorMessage);
      return false;
    }
  };

  return {
    fetchDeals,
    createDeal,
    updateDeal,
    deleteDeal,
    isLoading,
    error
  };
}