import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Building2,
  User,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  FileText,
  Tag,
  Zap,
  TrendingUp,
  Clock,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase/clientV2';
import { format } from 'date-fns';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';
import { extractDomainFromDeal } from '@/lib/utils/domainUtils';
import { useCompanyLogo } from '@/lib/hooks/useCompanyLogo';
import { useAiArkIntegration } from '@/lib/hooks/useAiArkIntegration';
import { useNavigate } from 'react-router-dom';
import { AiArkSimilaritySearch } from '@/components/prospecting/AiArkSimilaritySearch';
import { DealTemperatureSummary } from '@/components/signals/DealTemperatureSummary';
import { useActiveOrgId } from '@/lib/stores/orgStore';

interface DealDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string | null;
}

interface DealDetails {
  id: string;
  name: string;
  company: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  value: number;
  one_off_revenue: number | null;
  monthly_mrr: number | null;
  annual_value: number | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  deal_size: string | null;
  expected_close_date: string | null;
  first_billing_date: string | null;
  created_at: string;
  updated_at: string;
  stage_changed_at: string | null;
  // Relations
  deal_stages?: {
    name: string;
    color: string;
  };
  profiles?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
}

export function DealDetailsModal({ isOpen, onClose, dealId }: DealDetailsModalProps) {
  const [deal, setDeal] = useState<DealDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [showSimilaritySearch, setShowSimilaritySearch] = useState(false);
  const navigate = useNavigate();
  const { isConnected: aiArkConnected } = useAiArkIntegration();
  const orgId = useActiveOrgId();

  // Extract domain for logo
  const domainForLogo = useMemo(() => {
    if (!deal) return null;
    return extractDomainFromDeal({
      company: deal.company,
      contact_email: deal.contact_email,
    });
  }, [deal?.company, deal?.contact_email]);

  const { logoUrl, isLoading: logoLoading } = useCompanyLogo(domainForLogo);

  // Reset error state when domain or logoUrl changes
  useEffect(() => {
    setLogoError(false);
  }, [domainForLogo, logoUrl]);

  useEffect(() => {
    if (isOpen && dealId) {
      fetchDealDetails();
    }
  }, [isOpen, dealId]);

  const fetchDealDetails = async () => {
    if (!dealId) return;
    
    setIsLoading(true);
    try {
      logger.log('🔍 Fetching deal details for ID:', dealId);
      
      // First try a simple query without joins to see if the deal exists
      const { data: basicData, error: basicError } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .single();

      if (basicError) {
        logger.error('Error fetching basic deal data:', basicError);
        logger.error('Deal ID attempted:', dealId);
        
        // Show user-friendly error message
        if (basicError.code === 'PGRST116') {
          toast.error('Deal not found or you do not have access to it');
        } else {
          toast.error(`Failed to load deal: ${basicError.message}`);
        }
        return;
      }

      logger.log('✅ Basic deal data found:', basicData);

      // Now try to enrich with related data (if available)
      try {
        const { data: enrichedData, error: enrichedError } = await supabase
          .from('deals')
          .select(`
            *,
            profiles:owner_id (
              first_name,
              last_name,
              email
            ),
            deal_stages!inner (
              name,
              color
            )
          `)
          .eq('id', dealId)
          .single();

        if (enrichedError) {
          logger.warn('Could not fetch enriched deal data, using basic data:', enrichedError);
          // Manually fetch stage data if relationship fails
          if (basicData && (basicData as any).stage_id) {
            try {
              const { data: stageData } = await supabase
                .from('deal_stages')
                .select('name, color')
                .eq('id', (basicData as any).stage_id)
                .single();

              if (stageData) {
                (basicData as any).deal_stages = stageData;
              }
            } catch (stageError) {
              logger.warn('Could not fetch stage data:', stageError);
            }
          }
          if (basicData) {
            setDeal(basicData as any);
          }
        } else {
          logger.log('✅ Enriched deal data found:', enrichedData);
          setDeal(enrichedData);
        }
      } catch (enrichedError) {
        logger.warn('Error with enriched query, using basic data:', enrichedError);
        // Manually fetch stage data if relationship fails
        if (basicData && (basicData as any).stage_id) {
          try {
            const { data: stageData } = await supabase
              .from('deal_stages')
              .select('name, color')
              .eq('id', (basicData as any).stage_id)
              .single();

            if (stageData) {
              (basicData as any).deal_stages = stageData;
            }
          } catch (stageError) {
            logger.warn('Could not fetch stage data:', stageError);
          }
        }
        if (basicData) {
          setDeal(basicData as any);
        }
      }
    } catch (error: any) {
      logger.error('Error fetching deal:', error);
      // Handle different types of errors
      if (error.message && error.message.includes('<!DOCTYPE')) {
        toast.error('Server error: Please try again later');
        logger.error('HTML response received instead of JSON - possible routing issue');
      } else {
        toast.error('Failed to load deal details');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return '£0';
    return new Intl.NumberFormat('en-GB', { 
      style: 'currency', 
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'medium':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'low':
        return 'text-green-400 bg-green-500/10 border-green-500/20';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'won':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'lost':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'active':
      case 'in_progress':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  if (!isOpen) return null;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900/95 backdrop-blur-xl border-gray-800/50 text-white p-0 rounded-xl max-w-4xl max-h-[90vh] overflow-hidden">
        {isLoading ? (
          <>
            <DialogHeader className="p-6">
              <DialogTitle className="text-xl font-bold text-white">
                Loading Deal Details
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Please wait while we fetch the deal information...
              </DialogDescription>
            </DialogHeader>
            <div className="p-8">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-700 rounded w-1/2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/4"></div>
                <div className="grid grid-cols-2 gap-4 mt-6">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-20 bg-gray-700 rounded"></div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : deal ? (
          <>
            {/* Header */}
            <DialogHeader className="p-6 pb-4 border-b border-gray-800/50">
              <div className="flex items-start justify-between">
                <div>
                  <DialogTitle className="text-2xl font-bold text-white mb-2">
                    {deal.name}
                  </DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Deal details and financial information for {deal.company}
                  </DialogDescription>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <div className="flex items-center gap-1">
                      {logoUrl && !logoError && !logoLoading ? (
                        <img
                          src={logoUrl}
                          alt={`${deal.company} logo`}
                          className="w-4 h-4 rounded flex-shrink-0 object-cover"
                          onError={() => setLogoError(true)}
                        />
                      ) : (
                        <Building2 className="w-4 h-4" />
                      )}
                      <span>{deal.company}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>Created {format(new Date(deal.created_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {deal.status && (
                    <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(deal.status)}`}>
                      {deal.status.replace('_', ' ').toUpperCase()}
                    </div>
                  )}
                  {deal.priority && (
                    <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(deal.priority)}`}>
                      {deal.priority.toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            </DialogHeader>

            {/* Content */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {/* Value Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium text-gray-400">Total Value</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {formatCurrency(deal.value)}
                  </div>
                </div>

                {deal.monthly_mrr && deal.monthly_mrr > 0 && (
                  <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-gray-400">Monthly MRR</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                      {formatCurrency(deal.monthly_mrr)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Annual: {formatCurrency(deal.monthly_mrr * 12)}
                    </div>
                  </div>
                )}

                {deal.one_off_revenue && deal.one_off_revenue > 0 && (
                  <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-gray-400">One-off Revenue</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                      {formatCurrency(deal.one_off_revenue)}
                    </div>
                  </div>
                )}
              </div>

              {/* Contact Information */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Contact Information
                </h3>
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {deal.contact_name && (
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Contact Name</div>
                        <div className="text-white">{deal.contact_name}</div>
                      </div>
                    )}
                    {deal.contact_email && (
                      <div>
                        <div className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          Email
                        </div>
                        <div className="text-white">
                          <a href={`mailto:${deal.contact_email}`} className="text-blue-400 hover:text-blue-300">
                            {deal.contact_email}
                          </a>
                        </div>
                      </div>
                    )}
                    {deal.contact_phone && (
                      <div>
                        <div className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          Phone
                        </div>
                        <div className="text-white">
                          <a href={`tel:${deal.contact_phone}`} className="text-blue-400 hover:text-blue-300">
                            {deal.contact_phone}
                          </a>
                        </div>
                      </div>
                    )}
                    {deal.profiles && (
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Deal Owner</div>
                        <div className="text-white">
                          {deal.profiles.first_name} {deal.profiles.last_name}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              {(deal.contact_name || deal.contact_email || deal.contact_phone) && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Contact Information
                  </h3>
                  <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {deal.contact_name && (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="text-xs text-gray-400">Name</div>
                            <div className="text-white">{deal.contact_name}</div>
                          </div>
                        </div>
                      )}
                      {deal.contact_email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="text-xs text-gray-400">Email</div>
                            <a href={`mailto:${deal.contact_email}`} className="text-blue-400 hover:text-blue-300">
                              {deal.contact_email}
                            </a>
                          </div>
                        </div>
                      )}
                      {deal.contact_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="text-xs text-gray-400">Phone</div>
                            <a href={`tel:${deal.contact_phone}`} className="text-blue-400 hover:text-blue-300">
                              {deal.contact_phone}
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Deal Details */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Deal Details
                </h3>
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {deal.deal_size && (
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Deal Size</div>
                        <div className="text-white capitalize">{deal.deal_size.replace('_', ' ')}</div>
                      </div>
                    )}
                    {deal.expected_close_date && (
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Expected Close Date</div>
                        <div className="text-white">{format(new Date(deal.expected_close_date), 'MMM d, yyyy')}</div>
                      </div>
                    )}
                    {deal.first_billing_date && (
                      <div>
                        <div className="text-sm text-gray-400 mb-1">First Billing Date</div>
                        <div className="text-white">{format(new Date(deal.first_billing_date), 'MMM d, yyyy')}</div>
                      </div>
                    )}
                    {deal.deal_stages && (
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Current Stage</div>
                        <div className="text-white">{deal.deal_stages.name}</div>
                      </div>
                    )}
                  </div>
                  
                  {deal.description && (
                    <div>
                      <div className="text-sm text-gray-400 mb-2">Description</div>
                      <div className="text-white text-sm leading-relaxed">
                        {deal.description}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="text-xs text-gray-500 space-y-1">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Created: {format(new Date(deal.created_at), 'MMM d, yyyy HH:mm')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Last Updated: {format(new Date(deal.updated_at), 'MMM d, yyyy HH:mm')}</span>
                </div>
                {deal.stage_changed_at && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Stage Changed: {format(new Date(deal.stage_changed_at), 'MMM d, yyyy HH:mm')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Signal Temperature Section */}
            {dealId && orgId && (
              <div className="mb-8">
                <DealTemperatureSummary dealId={dealId} orgId={orgId} />
              </div>
            )}

            {/* Footer */}
            <DialogFooter className="p-6 pt-4 border-t border-gray-800/50 flex items-center justify-between">
              <div>
                {aiArkConnected && domainForLogo && (
                  <Button
                    variant="ghost"
                    onClick={() => setShowSimilaritySearch(true)}
                    className="text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 border border-violet-500/20"
                  >
                    <Layers className="w-4 h-4 mr-2" />
                    Find Similar Companies
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                onClick={onClose}
                className="bg-gray-800/50 text-gray-300 hover:bg-gray-800"
              >
                <X className="w-4 h-4 mr-2" />
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="p-6">
              <DialogTitle className="text-xl font-bold text-white">
                Deal Not Found
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                The requested deal could not be found or you don&apos;t have permission to view it.
              </DialogDescription>
            </DialogHeader>
            <div className="p-8 text-center">
              <div className="text-gray-400">Deal not found</div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>

      {/* AI Ark Similarity Search Dialog */}
      {showSimilaritySearch && (
        <Dialog open={showSimilaritySearch} onOpenChange={setShowSimilaritySearch}>
          <DialogContent className="sm:max-w-4xl bg-zinc-900 border-zinc-700 text-white max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-violet-400" />
                Find Similar Companies
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                Find companies similar to {domainForLogo}
              </DialogDescription>
            </DialogHeader>
            <AiArkSimilaritySearch
              initialDomain={domainForLogo || ''}
              onComplete={(tableId) => {
                setShowSimilaritySearch(false);
                onClose();
                navigate(`/ops/${tableId}`);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}