import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragEndEvent,
  MeasuringStrategy,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { PipelineProvider, usePipeline } from '@/lib/contexts/PipelineContext';
import { PipelineHeader } from './PipelineHeader';
import { PipelineColumn } from './PipelineColumn';
import { DealCard } from './DealCard';
import { DealForm } from './DealForm';
import { PipelineTable } from './PipelineTable';
import { OwnerFilter } from '@/components/OwnerFilter';
import EditDealModal from '@/components/EditDealModal';
import DealClosingModal from '@/components/DealClosingModal';
import { ConvertDealModal } from '@/components/ConvertDealModal';
// ProposalConfirmationModal removed - no longer needed

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { ConfettiService } from '@/lib/services/confettiService';
import logger from '@/lib/utils/logger';
import { useBatchedDealMetadata } from '@/lib/hooks/useBatchedDealMetadata';



interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ isOpen, onClose, children }: ModalProps) {
  if (!isOpen) return null;

  const handleBackdropInteraction = (e: React.MouseEvent) => {
    // Only close if the click target is the backdrop itself, not during drag operations
    if (e.target === e.currentTarget && e.type === 'click') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.currentTarget.dataset.mouseStartX = e.clientX.toString();
          e.currentTarget.dataset.mouseStartY = e.clientY.toString();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const startX = parseInt(e.currentTarget.dataset.mouseStartX || '0');
          const startY = parseInt(e.currentTarget.dataset.mouseStartY || '0');
          const deltaX = Math.abs(e.clientX - startX);
          const deltaY = Math.abs(e.clientY - startY);

          // Only close if it was a true click (movement < 5px) not a drag
          if (deltaX < 5 && deltaY < 5) {
            onClose();
          }
        }
      }}
      onDragStart={e => e.preventDefault()}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-xl w-full max-w-xl border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto scrollbar-none"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onMouseUp={e => e.stopPropagation()}
        onDragStart={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function PipelineSkeleton() {
  return (
    <div className="space-y-6">
      <div className="mb-6 space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-48" />
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-lg w-80" />
        <div className="flex justify-between mt-4">
          <div className="flex gap-2">
            <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg w-32" />
            <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg w-24" />
          </div>
          <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg w-64" />
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-none pb-6">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className="min-w-[320px] bg-white/95 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-800/50 flex flex-col h-[600px]"
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-800/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-md bg-gray-200 dark:bg-gray-800" />
                <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded-lg w-20" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-800/50 rounded-full w-8 h-5" />
            </div>
            <div className="p-4 space-y-3 flex-1">
              {[1, 2, 3].map(j => (
                <div key={j} className="bg-gray-100 dark:bg-gray-800/50 rounded-xl p-4 h-32" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- DRAG AND DROP IMPROVEMENTS ---

function PipelineContent() {
  const navigate = useNavigate();
  const {
    deals,
    stages,
    isLoading,
    error,
    dealsByStage: contextDealsByStage,
    createDeal,
    updateDeal,
    deleteDeal,
    moveDealToStage,
    forceUpdateDealStage,
    refreshDeals,
    selectedOwnerId,
    setSelectedOwnerId
  } = usePipeline();

  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [localDealsByStage, setLocalDealsByStage] = useState<Record<string, any[]>>({});
  const [showDealForm, setShowDealForm] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [initialStageId, setInitialStageId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<any>(null);
  const [sortBy, setSortBy] = useState<'value' | 'date' | 'alpha' | 'none'>('none');
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);

  // DnD state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedFromStage, setDraggedFromStage] = useState<string | null>(null);
  const [draggedOverStage, setDraggedOverStage] = useState<string | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
  const [isUpdatingDatabase, setIsUpdatingDatabase] = useState(false);

  // Keep a ref to the last valid over stage for drop fallback
  const lastValidOverStageRef = useRef<string | null>(null);


  // State for the DealClosingModal
  const [isDealClosingModalOpen, setIsDealClosingModalOpen] = useState(false);
  const [closingDeal, setClosingDeal] = useState<any>(null);

  // State for the ConvertDealModal
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [convertingDeal, setConvertingDeal] = useState<any>(null);

  // Removed proposal confirmation modal state - deals now move directly to Opportunity

  // Performance optimization: Batch-fetch next actions and health scores for all visible deals
  const allDealIds = React.useMemo(() => {
    return Object.values(localDealsByStage)
      .flat()
      .map(deal => String(deal.id));
  }, [localDealsByStage]);

  const { data: batchedMetadata } = useBatchedDealMetadata(allDealIds);

  // Update local state when the context data changes
  useEffect(() => {
    // Don't reset local state if we're in the middle of a drag operation
    if (draggedId) return;

    // Only update if there's actual new data (not just isUpdatingDatabase changing)
    setLocalDealsByStage(structuredClone(contextDealsByStage));
  }, [contextDealsByStage, refreshKey, draggedId]);

  // Apply sorting to the local state
  useEffect(() => {
    // Don't apply sorting during drag operations or database updates
    if (draggedId || isUpdatingDatabase) return;
    
    if (sortBy === 'none') {
      setLocalDealsByStage(contextDealsByStage);
      return;
    }
    const sortedDeals = { ...localDealsByStage };
    Object.keys(sortedDeals).forEach(stageId => {
      sortedDeals[stageId] = [...sortedDeals[stageId]].sort((a, b) => {
        switch (sortBy) {
          case 'value':
            return b.value - a.value;
          case 'date':
            return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
          case 'alpha':
            return (a.company || '').localeCompare(b.company || '');
          default:
            return 0;
        }
      });
    });
    setLocalDealsByStage(sortedDeals);
  }, [sortBy, contextDealsByStage, draggedId, isUpdatingDatabase]);

  useEffect(() => {
    return () => {
      setDraggedId(null);
      setDraggedFromStage(null);
      setDraggedOverStage(null);
      setDraggedOverIndex(null);
      lastValidOverStageRef.current = null;
      setActiveDeal(null);
    };
  }, []);

  // Configure sensors for drag operations
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleAddDealClick = (stageId: string | null = null) => {
    setSelectedDeal(null);
    setInitialStageId(stageId);
    setShowDealForm(true);
  };

  const handleDealClick = (dealOrId: any) => {
    const dealId = typeof dealOrId === 'string' ? dealOrId : dealOrId.id;
    navigate(`/crm/deals/${dealId}?returnTo=${encodeURIComponent(window.location.pathname)}`);
  };

  const handleSaveDeal = async (formData: any) => {
    let success = false;
    let savedOrCreatedDeal = null; // To hold the result for logging

    if (selectedDeal) {
      success = await updateDeal(selectedDeal.id, formData);
    } else {
      savedOrCreatedDeal = await createDeal(formData);
      success = !!savedOrCreatedDeal;
    }

    if (success) {
      setShowDealForm(false);
      
      // Force a refresh of the deals data to update pipeline totals immediately
      logger.log('🔄 Deal saved successfully, refreshing deals data...');
      await refreshDeals();
      
      // Force a component refresh to ensure calculations update
      setRefreshKey(prev => prev + 1);
    }
  };



  // Find the stageId for a given dealId or stageId
  const findStageForId = (id: string): string | undefined => {
    if (id in localDealsByStage) return id;
    return Object.keys(localDealsByStage).find(stageId =>
      localDealsByStage[stageId].some(deal => deal.id === id)
    );
  };

  // --- DND HANDLERS ---

  // On drag start, set the draggedId and fromStage, and set activeDeal for overlay
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const id = String(active.id);
    setDraggedId(id);
    const fromStage = findStageForId(id);
    setDraggedFromStage(fromStage || null);
    setDraggedOverStage(fromStage || null);
    setDraggedOverIndex(
      fromStage && localDealsByStage[fromStage]
        ? localDealsByStage[fromStage].findIndex(d => d.id === id)
        : null
    );
    // Set activeDeal for overlay
    let deal = null;
    for (const stageId in localDealsByStage) {
      deal = localDealsByStage[stageId].find(d => d.id === id);
      if (deal) break;
    }
    setActiveDeal(deal);
    // Disable sorting during drag
    if (sortBy !== 'none') setSortBy('none');
  };

  // On drag over, update the localDealsByStage for visual feedback
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const fromStage = findStageForId(activeId);
    let toStage = findStageForId(overId);

    // If overId is a stageId (column), use it directly
    if (!toStage && stages.find(s => s.id === overId)) {
      toStage = overId;
    }
    if (!fromStage || !toStage) return;

    // If dropped on the same stage and same position, do nothing
    if (fromStage === toStage && overId === activeId) return;

    // Find the index in the target stage
    let toIndex = localDealsByStage[toStage]?.findIndex(d => d.id === overId) ?? -1;
    if (toIndex === -1 || overId === toStage) {
      // If dropped on the column itself or empty space, add to end
      toIndex = localDealsByStage[toStage]?.length ?? 0;
    }

    // Prevent unnecessary updates
    if (
      draggedId === activeId &&
      draggedFromStage === fromStage &&
      draggedOverStage === toStage &&
      draggedOverIndex === toIndex
    ) {
      return;
    }

    // Store last valid over stage for drop fallback
    lastValidOverStageRef.current = toStage;

    // Optimistically update localDealsByStage for visual feedback
    setLocalDealsByStage(prev => {
      // Remove from old stage
      const fromDeals = [...prev[fromStage]];
      const dealIdx = fromDeals.findIndex(d => d.id === activeId);
      if (dealIdx === -1) return prev;
      const [deal] = fromDeals.splice(dealIdx, 1);

      // Insert into new stage
      const toDeals = [...prev[toStage]];
      // Prevent duplicate
      if (!toDeals.some(d => d.id === activeId)) {
        toDeals.splice(toIndex, 0, { ...deal, stage_id: toStage });
      }

      return {
        ...prev,
        [fromStage]: fromDeals,
        [toStage]: toDeals,
      };
    });

    setDraggedOverStage(toStage);
    setDraggedOverIndex(toIndex);
  };

  // On drag end, persist the change and clean up
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = String(active.id);

    // Determine the final stage
    let toStage = over ? findStageForId(String(over.id)) : null;
    if (!toStage && over && stages.find(s => s.id === String(over.id))) {
      toStage = String(over.id);
    }
    if (!toStage) {
      toStage = lastValidOverStageRef.current;
    }
    const fromStage = draggedFromStage;

    // If no move, cleanup and return
    if (!fromStage || !toStage || fromStage === toStage) {
      setDraggedId(null);
      setDraggedFromStage(null);
      setDraggedOverStage(null);
      setDraggedOverIndex(null);
      setActiveDeal(null);
      lastValidOverStageRef.current = null;
      return;
    }
    
    // Removed Opportunity stage check - deals now move directly without confirmation

    // Find the deal and its new index
    let toIndex = draggedOverIndex;
    if (over) {
      const overId = String(over.id);
      toIndex = localDealsByStage[toStage]?.findIndex(d => d.id === overId) ?? -1;
      if (toIndex === -1 || overId === toStage) {
        toIndex = localDealsByStage[toStage]?.length ?? 0;
      }
    } else if (toIndex == null) {
      toIndex = localDealsByStage[toStage]?.length ?? 0;
    }

    // Update localDealsByStage for final state
    setLocalDealsByStage(prev => {
      // Remove from old stage
      const fromDeals = [...prev[fromStage]];
      const dealIdx = fromDeals.findIndex(d => d.id === activeId);
      if (dealIdx === -1) return prev;
      const [deal] = fromDeals.splice(dealIdx, 1);

      // Insert into new stage
      const toDeals = [...prev[toStage]];
      // Remove if already present (shouldn't happen, but for safety)
      const existingIdx = toDeals.findIndex(d => d.id === activeId);
      if (existingIdx !== -1) toDeals.splice(existingIdx, 1);
      toDeals.splice(toIndex!, 0, { ...deal, stage_id: toStage });

      return {
        ...prev,
        [fromStage]: fromDeals,
        [toStage]: toDeals,
      };
    });

    // Persist to DB
    setIsUpdatingDatabase(true);
    try {
      const updatePayload = {
        stage_id: toStage,
        stage_changed_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('deals')
        .update(updatePayload)
        .eq('id', activeId)
        .select();
      if (error) throw error;

      // Find the deal object and stage objects for activity creation
      const movedDeal = Object.values(localDealsByStage)
        .flat()
        .find(deal => deal.id === activeId);
      
      logger.log('🎬 Pipeline drag completed:', {
        dealId: activeId,
        fromStage: fromStage,
        toStage: toStage,
        dealFound: !!movedDeal,
        dealName: movedDeal?.name || movedDeal?.company || 'Unknown'
      });
      
      if (movedDeal) {
        const fromStageObj = stages.find(s => s.id === fromStage) || null;
        const toStageObj = stages.find(s => s.id === toStage);
        
        logger.log('📍 Stage objects:', {
          fromStageName: fromStageObj?.name || 'null',
          toStageName: toStageObj?.name || 'null'
        });
        
        if (toStageObj) {
          // Note: Automatic activity creation on stage transitions disabled per user request
          logger.log(`✅ Stage transition completed: ${fromStageObj?.name || 'unknown'} → ${toStageObj.name}`);
        } else {
          logger.warn('❌ Could not find target stage object');
        }
      } else {
        logger.warn('❌ Could not find moved deal in localDealsByStage');
      }

      // Check if moved to Signed - show closing modal and celebrate
      const signedStage = stages.find(
        stage => stage.name.toLowerCase() === 'signed'
      );
      
      if (signedStage && toStage === signedStage.id) {
        // Find the deal that was moved to Signed
        const movedDeal = Object.values(localDealsByStage)
          .flat()
          .find(deal => deal.id === activeId);
        
        if (movedDeal) {
          setClosingDeal(movedDeal);
          setIsDealClosingModalOpen(true);
          // Celebrate after modal is closed
          ConfettiService.celebrate();
          toast.success('🎉 Deal signed! Track payment status on the Payments page.');
        }
      }

      // Database updated successfully - refresh context to sync with DB
      await refreshDeals();
      setIsUpdatingDatabase(false);
    } catch (err) {
      // On error, revert the optimistic update
      toast.error('Failed to move deal. Please try again.');
      logger.error('Error updating deal stage:', err);

      // Revert to the original state from context
      setLocalDealsByStage(structuredClone(contextDealsByStage));
      setIsUpdatingDatabase(false);
    } finally {
      // Cleanup drag state
      setDraggedId(null);
      setDraggedFromStage(null);
      setDraggedOverStage(null);
      setDraggedOverIndex(null);
      setActiveDeal(null);
      lastValidOverStageRef.current = null;
    }
  };

  const handleDeleteDeal = async (dealId: string) => {
    logger.log('🗑️ Attempting to delete deal:', dealId);
    
    try {
      const success = await deleteDeal(dealId);
      if (success) {
        logger.log('✅ Deal deleted successfully');
        
        // The deletion should trigger a refresh automatically via onDataChange
        // But we can also force a manual refresh to be sure
        await refreshDeals();
        
        // Trigger UI update
        setRefreshKey(prev => prev + 1);
        setLastRefreshTime(Date.now());
        
        logger.log('🔄 Pipeline refresh completed');
      } else {
        logger.error('❌ Deal deletion failed');
        toast.error('Failed to delete deal. Please try again.');
      }
    } catch (error) {
      logger.error('❌ Deal deletion error:', error);
      toast.error('Failed to delete deal. Please try again.');
    }
  };

  const handleConvertToSubscription = (deal: any) => {
    setConvertingDeal(deal);
    setIsConvertModalOpen(true);
  };
  
  // Removed handleProposalConfirmation function - deals now move directly
  /*
  const handleProposalConfirmation = async (sentProposal: boolean, notes?: string) => {
    logger.log('📄 Proposal confirmation handler called:', {
      sentProposal,
      hasNotes: !!notes,
      pendingDealMove: !!pendingDealMove,
      dealId: pendingDealMove?.dealId,
      dealName: pendingDealMove?.deal?.name || pendingDealMove?.deal?.company
    });
    
    setProposalModalOpen(false);
    
    if (!pendingDealMove) {
      logger.warn('❌ No pending deal move found');
      return;
    }
    
    const { dealId, fromStage, toStage, deal, toIndex } = pendingDealMove;
    
    // Update localDealsByStage for final state
    setLocalDealsByStage(prev => {
      // Remove from old stage
      const fromDeals = [...prev[fromStage]];
      const dealIdx = fromDeals.findIndex((d: any) => d.id === dealId);
      if (dealIdx === -1) return prev;
      const [movedDeal] = fromDeals.splice(dealIdx, 1);

      // Insert into new stage
      const toDeals = [...prev[toStage]];
      // Remove if already present (shouldn't happen, but for safety)
      const existingIdx = toDeals.findIndex((d: any) => d.id === dealId);
      if (existingIdx !== -1) toDeals.splice(existingIdx, 1);
      toDeals.splice(toIndex || toDeals.length, 0, { ...movedDeal, stage_id: toStage });

      return {
        ...prev,
        [fromStage]: fromDeals,
        [toStage]: toDeals,
      };
    });
    
    // Persist to DB
    try {
      const updatePayload = {
        stage_id: toStage,
        stage_changed_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('deals')
        .update(updatePayload)
        .eq('id', dealId)
        .select();
      if (error) throw error;
      
      // Create activity for stage transition
      const fromStageObj = stages.find(s => s.id === fromStage) || null;
      const toStageObj = stages.find(s => s.id === toStage);
      
      if (toStageObj) {
        // Only create stage transition activity if it's NOT moving to Opportunity
        // (since Opportunity transition is handled specially with the proposal confirmation)
        const opportunityStage = stages.find(s => s.name.toLowerCase() === 'opportunity');
        const isMovingToOpportunity = toStage === opportunityStage?.id;
        
        if (!isMovingToOpportunity) {
          // Note: Automatic activity creation on stage transitions disabled per user request
          logger.log(`✅ Stage transition completed: ${fromStageObj?.name || 'unknown'} → ${toStageObj.name}`);
        } else if (sentProposal) {
          // Moving to Opportunity AND user confirmed proposal was sent - create proposal activity
          logger.log('✅ User confirmed proposal was sent, creating activity...');
          const { data: { user } } = await supabase.auth.getUser();
          logger.log('👤 Current user:', user?.id, 'Deal owner:', deal.owner_id);
          if (user && user.id === deal.owner_id) {
            // Get user profile for sales_rep name
            const { data: profile } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', user.id)
              .single();
            
            const salesRepName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '';
            
            const proposalActivity = {
              user_id: user.id,
              type: 'proposal',
              client_name: deal.company || deal.name || 'Unknown Client',
              details: notes || `Proposal sent for ${deal.name || deal.company || 'deal'}`,
              amount: deal.value || 0,
              priority: 'high',
              sales_rep: salesRepName,
              date: new Date().toISOString(),
              status: 'completed',
              quantity: 1,
              deal_id: dealId,
              contact_identifier: deal.contact_email || null,
              contact_identifier_type: deal.contact_email ? 'email' : null,
            };
            
            logger.log('📝 Creating proposal activity:', proposalActivity);
            const { error } = await supabase
              .from('activities')
              .insert(proposalActivity);
            
            if (!error) {
              logger.log('✅ Proposal activity created successfully!');
              toast.success('📄 Proposal activity logged and follow-up task created!');
            } else {
              logger.error('❌ Failed to create proposal activity:', error);
            }
          }
        } else {
          // Moving to Opportunity but NO proposal sent - just log the stage change
          logger.log('📁 Deal moved to Opportunity stage for proposal preparation');
          toast.info('📁 Deal moved to Opportunity stage for proposal preparation');
        }
      }
      
      setTimeout(() => {
        setRefreshKey(prev => prev + 1);
      }, 100);
    } catch (err) {
      toast.error('Failed to move deal. Please try again.');
      logger.error('Error moving deal to Opportunity:', err);
    }
    
    // Clear pending move
    setPendingDealMove(null);
  };
  */

  const handleDealClosure = async (firstBillingDate: string | null) => {
    if (!closingDeal) return;

    try {
      // Update the deal with the first billing date
      const updateData: any = {};
      if (firstBillingDate) {
        updateData.first_billing_date = firstBillingDate;
      }

      if (Object.keys(updateData).length > 0) {
        const success = await updateDeal(closingDeal.id, updateData);
        if (!success) {
          throw new Error('Failed to update deal with billing information');
        }
      }

      toast.success('🎉 Deal closed successfully!');
      
      // Reset closing state
      setClosingDeal(null);
      setIsDealClosingModalOpen(false);
      
      // Refresh the deals data
      await refreshDeals();
      setRefreshKey(prev => prev + 1);
      
    } catch (error) {
      logger.error('Error closing deal:', error);
      toast.error('Failed to save deal closure information');
      throw error;
    }
  };

  if (isLoading) {
    return <PipelineSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="text-red-500 mb-4">Error loading pipeline data</div>
        <div className="text-gray-600 dark:text-gray-400">{error.message}</div>
      </div>
    );
  }

  return (
    <>
      <PipelineHeader
        onAddDealClick={() => handleAddDealClick()}
        view={view}
        onViewChange={setView}
        selectedOwnerId={selectedOwnerId}
        onOwnerChange={setSelectedOwnerId}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {view === 'kanban' ? (
        <>

          <DndContext
            key={`dnd-context-${refreshKey}`}
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            measuring={{
              droppable: {
                strategy: MeasuringStrategy.Always,
              },
            }}
            autoScroll={{
              threshold: {
                x: 0.2,
                y: 0.2,
              },
              interval: 10,
            }}
          >
            <div className="grid gap-2 sm:gap-3 pb-4 sm:pb-6 overflow-x-auto snap-x snap-mandatory lg:snap-none scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent -mx-3 px-3 sm:mx-0 sm:px-0" style={{
              gridTemplateColumns: stages.length <= 4
                ? `repeat(${stages.length}, minmax(260px, 1fr))`
                : `repeat(${stages.length}, minmax(260px, 350px))`,
              maxWidth: '100%',
              scrollbarWidth: 'thin', /* Firefox */
            }}>
              {stages.map(stage => (
                <PipelineColumn
                  key={stage.id}
                  stage={stage}
                  deals={localDealsByStage[stage.id] || []}
                  onAddDealClick={() => handleAddDealClick(stage.id)}
                  onDealClick={handleDealClick}
                  onConvertToSubscription={handleConvertToSubscription}
                  batchedMetadata={batchedMetadata}
                />
              ))}
            </div>
            
            {/* Scroll indicator for mobile/small screens */}
            {stages.length > 3 && (
              <div className="text-center text-xs text-gray-600 dark:text-gray-500 mt-2 md:hidden">
                ← Scroll horizontally to see all pipeline stages →
              </div>
            )}
            <DragOverlay>
              {activeDeal && (
                <DealCard
                  key={`overlay-${activeDeal.id}`}
                  deal={activeDeal}
                  onClick={() => {}}
                  isDragOverlay={true}
                  nextActionsPendingCount={batchedMetadata.nextActions[String(activeDeal.id)]?.pendingCount || 0}
                  highUrgencyCount={batchedMetadata.nextActions[String(activeDeal.id)]?.highUrgencyCount || 0}
                  healthScore={batchedMetadata.healthScores[String(activeDeal.id)] || null}
                  sentimentData={batchedMetadata.sentimentData[String(activeDeal.id)] || null}
                />
              )}
            </DragOverlay>
          </DndContext>
        </>
      ) : (
        <PipelineTable
          onDealClick={handleDealClick}
          onDeleteDeal={handleDeleteDeal}
        />
      )}


      <Modal
        isOpen={showDealForm}
        onClose={() => {
          setShowDealForm(false);
          setSelectedDeal(null);
          setInitialStageId(null);
        }}
      >
        <DealForm
          key={initialStageId || 'new-deal'} // Add key for reset
          deal={selectedDeal}
          onSave={handleSaveDeal}
          onDelete={deleteDeal}
          onCancel={() => {
            setShowDealForm(false);
            setSelectedDeal(null);
            setInitialStageId(null);
          }}
          initialStageId={initialStageId}
        />
      </Modal>

      {closingDeal && (
        <DealClosingModal
          open={isDealClosingModalOpen}
          onOpenChange={setIsDealClosingModalOpen}
          deal={closingDeal}
          onSave={handleDealClosure}
        />
      )}
      
      <ConvertDealModal
        deal={convertingDeal}
        isOpen={isConvertModalOpen}
        onClose={() => {
          setIsConvertModalOpen(false);
          setConvertingDeal(null);
        }}
        onSuccess={() => {
          // Refresh deals after successful conversion
          refreshDeals();
        }}
      />
      
      {/* ProposalConfirmationModal removed - deals now move directly to Opportunity */}
    </>
  );
}

function PipelineComponent() {
  return (
    <PipelineProvider>
      <div className="max-w-full w-full min-h-screen bg-white dark:bg-gradient-to-br dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 overflow-hidden">
          <div className="relative">
            <PipelineContent />
          </div>
        </div>
      </div>
    </PipelineProvider>
  );
}

export const Pipeline = React.memo(PipelineComponent);