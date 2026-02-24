import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Heart, 
  Building2, 
  User, 
  Clock,
  Edit,
  Trash2,
  ChevronRight,
  Star
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { DealWithRelationships } from '@/lib/hooks/deals/types/dealTypes';
import { extractDomainFromDeal } from '@/lib/utils/domainUtils';
import { useCompanyLogo } from '@/lib/hooks/useCompanyLogo';
import { formatCurrency } from '@/lib/utils/calculations';

interface DealCardProps {
  deal: DealWithRelationships;
  viewMode: 'grid' | 'list';
  isSelected?: boolean;
  isSelectMode?: boolean;
  onSelect?: (dealId: string, isSelected: boolean) => void;
  onEdit?: (deal: DealWithRelationships) => void;
  onDelete?: (deal: DealWithRelationships) => void;
  onNavigate?: (deal: DealWithRelationships) => void;
}

const DealCard: React.FC<DealCardProps> = ({
  deal,
  viewMode,
  isSelected = false,
  isSelectMode = false,
  onSelect,
  onEdit,
  onDelete,
  onNavigate,
}) => {
  const [hovered, setHovered] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Extract domain for logo
  const domainForLogo = useMemo(() => {
    const input: any = {};
    if (deal.companies) input.companies = deal.companies;
    if (deal.company) input.company = deal.company;
    if (deal.contact_email) input.contact_email = deal.contact_email;
    if (deal.company_website) input.company_website = deal.company_website;
    return extractDomainFromDeal(input);
  }, [deal.companies, deal.company, deal.contact_email, deal.company_website]);

  const { logoUrl, isLoading } = useCompanyLogo(domainForLogo);

  // Reset error state when domain or logoUrl changes
  React.useEffect(() => {
    setLogoError(false);
  }, [domainForLogo, logoUrl]);

  // Generate deal icon color based on stage
  const getStageColor = () => {
    if (deal.deal_stages?.color) {
      return deal.deal_stages.color;
    }
    
    const colors = [
      'from-blue-500 to-purple-500',
      'from-orange-500 to-red-500',
      'from-emerald-500 to-teal-500',
      'from-pink-500 to-rose-500',
      'from-indigo-500 to-blue-500',
      'from-yellow-500 to-orange-500',
      'from-purple-500 to-pink-500',
      'from-teal-500 to-cyan-500',
    ];
    
    const index = (deal.name?.charCodeAt(0) || 0) % colors.length;
    return colors[index];
  };

  // Get status color based on deal status or stage
  const getStatusColor = () => {
    switch (deal.status?.toLowerCase()) {
      case 'won':
      case 'closed-won':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'lost':
      case 'closed-lost':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'qualified':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'proposal':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  // Calculate days in stage
  const getDaysInStage = () => {
    const stageDate = new Date(deal.stage_changed_at || deal.updated_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - stageDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get time status color
  const getTimeStatusColor = () => {
    switch (deal.timeStatus) {
      case 'danger':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  // Format close date
  const formatCloseDate = () => {
    if (!deal.close_date) return 'No close date';
    const date = new Date(deal.close_date);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays <= 7) return `${diffDays} days left`;
    return date.toLocaleDateString();
  };

  // Get probability color
  const getProbabilityColor = (probability: number) => {
    if (probability >= 80) return 'text-emerald-400';
    if (probability >= 50) return 'text-yellow-400';
    return 'text-orange-400';
  };

  // Generate initials from deal name
  const generateInitials = () => {
    return (deal.name || 'NA').split(' ').map(word => word.charAt(0)).join('').slice(0, 2).toUpperCase();
  };

  // Check if deal is high priority (mock for MVP)
  const isHighPriority = () => {
    return deal.value > 50000 || deal.probability > 80;
  };

  if (viewMode === 'list') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={{ x: 4 }}
        className={`bg-gray-900/50 backdrop-blur-xl rounded-xl p-4 border transition-all duration-300 group cursor-pointer ${
          isSelected && isSelectMode 
            ? 'border-emerald-500/30 bg-emerald-500/5' 
            : 'border-gray-800/50 hover:border-emerald-500/30'
        }`}
        onClick={() => onNavigate?.(deal)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Select Checkbox */}
            {isSelectMode && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onSelect?.(deal.id, e.target.checked);
                }}
                className="w-5 h-5 text-emerald-500 bg-gray-800/80 border-2 border-gray-600 rounded-md focus:ring-emerald-500 focus:ring-2"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            
            {/* Deal Icon */}
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getStageColor()} flex items-center justify-center text-white font-bold overflow-hidden`}>
              {logoUrl && !logoError && !isLoading ? (
                <img
                  src={logoUrl}
                  alt={`${typeof deal.company === 'string' ? deal.company : (deal.company as any)?.name || 'Company'} logo`}
                  className="w-full h-full object-cover"
                  onError={() => setLogoError(true)}
                />
              ) : (
                generateInitials()
              )}
            </div>
            
            <div>
              <h3 className="font-semibold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                {deal.name}
                {isHighPriority() && <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />}
              </h3>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Building2 className="w-3 h-3" />
                <span>
                  {typeof deal.company === 'string'
                    ? deal.company
                    : (deal.company as any)?.name || 'Unknown Company'}
                </span>
                {deal.contact_name && (
                  <>
                    <span>•</span>
                    <span>{deal.contact_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-lg font-bold text-white">{formatCurrency(deal.value)}</div>
              <Badge className={`text-xs ${getStatusColor()} border`}>
                {deal.deal_stages?.name || deal.status || 'Unknown'}
              </Badge>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className={`text-sm font-semibold ${getProbabilityColor(deal.probability)}`}>
                  {deal.probability}%
                </div>
                <div className="text-xs text-gray-500">Probability</div>
              </div>
              <div className="text-center">
                <div className={`text-sm font-semibold ${getTimeStatusColor()}`}>
                  {getDaysInStage()}d
                </div>
                <div className="text-xs text-gray-500">In Stage</div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {!isSelectMode && (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.(deal);
                    }}
                    className="text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete?.(deal);
                    }}
                    className="text-gray-400 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-400 transition-colors" />
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Grid view
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative bg-gradient-to-br from-white to-gray-50 dark:from-gray-900/80 dark:to-gray-900/40 backdrop-blur-xl rounded-2xl p-6 border transition-all duration-300 overflow-hidden group cursor-pointer ${
        isSelected && isSelectMode
          ? 'border-emerald-500/30 ring-1 ring-emerald-500/20'
          : 'border-gray-200 dark:border-gray-800/50 hover:border-emerald-500/30'
      }`}
      onClick={() => onNavigate?.(deal)}
    >
      {/* Animated background gradient */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        animate={hovered ? { scale: 1.5, rotate: 180 } : { scale: 1, rotate: 0 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />
      
      {/* Select Checkbox */}
      {isSelectMode && (
        <div className="absolute top-4 left-4 z-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect?.(deal.id, e.target.checked);
            }}
            className="w-5 h-5 text-emerald-500 bg-gray-800/80 border-2 border-gray-600 rounded-md focus:ring-emerald-500 focus:ring-2"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Priority indicator */}
      {isHighPriority() && (
        <div className="absolute top-4 right-4 z-10">
          <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
        </div>
      )}

      {/* Deal Icon */}
      <div className="relative mb-4">
        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getStageColor()} flex items-center justify-center text-white font-bold text-xl shadow-lg overflow-hidden`}>
          {logoUrl && !logoError && !isLoading ? (
            <img
              src={logoUrl}
              alt={`${typeof deal.company === 'string' ? deal.company : (deal.company as any)?.name || 'Company'} logo`}
              className="w-full h-full object-cover"
              onError={() => setLogoError(true)}
            />
          ) : (
            generateInitials()
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
          <Heart className="w-3 h-3 text-white fill-white" />
        </div>
      </div>

      {/* Deal Info */}
      <div className="relative z-10 mb-4">
        <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors mb-1">
          {deal.name}
        </h3>
        <div className="flex items-center gap-1 text-sm text-gray-400 mb-2">
          <Building2 className="w-3 h-3" />
          <span>
            {typeof deal.company === 'string'
              ? deal.company
              : (deal.company as any)?.name || 'Unknown Company'}
          </span>
        </div>
        {deal.contact_name && (
          <div className="flex items-center gap-1 text-xs text-emerald-400/80">
            <User className="w-3 h-3" />
            <span>{deal.contact_name}</span>
          </div>
        )}
      </div>

      {/* Deal Value and Stage */}
      <div className="relative z-10 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-2xl font-bold text-white">
            {formatCurrency(deal.value)}
          </div>
          <Badge className={`text-xs ${getStatusColor()} border`}>
            {deal.deal_stages?.name || deal.status || 'Unknown'}
          </Badge>
        </div>
        
        {/* Probability and Revenue Details */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Probability</span>
            <div className={`font-semibold ${getProbabilityColor(deal.probability)}`}>
              {deal.probability}%
            </div>
          </div>
          <div>
            <span className="text-gray-500">Close Date</span>
            <div className="font-semibold text-gray-300">
              {formatCloseDate()}
            </div>
          </div>
        </div>
      </div>


      {/* Footer */}
      <div className="relative z-10 flex items-center justify-between pt-4 border-t border-gray-800/50">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span className={getTimeStatusColor()}>{getDaysInStage()} days in stage</span>
        </div>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isSelectMode && (
            <>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(deal);
                }}
                className="w-8 h-8 p-0 text-gray-400 hover:text-blue-400 hover:bg-blue-400/20"
              >
                <Edit className="w-3 h-3" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(deal);
                }}
                className="w-8 h-8 p-0 text-gray-400 hover:text-red-400 hover:bg-red-400/20"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default DealCard;