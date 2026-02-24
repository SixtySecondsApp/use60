import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Star, 
  Mail, 
  Phone, 
  Building2,
  ExternalLink,
  Edit,
  Trash2,
  ChevronRight,
  User,
  TrendingUp,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { extractDomainFromContact } from '@/lib/utils/domainUtils';
import { useCompanyLogo } from '@/lib/hooks/useCompanyLogo';

interface Contact {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  phone?: string | null;
  company_name?: string;
  title?: string;
  created_at: string;
  updated_at: string;
  last_interaction_at?: string | null; // Date of last activity/meeting (preferred over updated_at)
  is_primary?: boolean;
  company?: {
    id?: string;
    name: string;
    domain?: string;
    size?: string;
    industry?: string;
  };
}

interface ContactCardProps {
  contact: Contact;
  viewMode: 'grid' | 'list';
  isSelected?: boolean;
  isSelectMode?: boolean;
  onSelect?: (contactId: string, isSelected: boolean) => void;
  onEdit?: (contact: Contact) => void;
  onDelete?: (contact: Contact) => void;
  onNavigate?: (contact: Contact) => void;
}

const ContactCard: React.FC<ContactCardProps> = ({
  contact,
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
    return extractDomainFromContact({
      email: contact.email,
      company: contact.company,
    });
  }, [contact.email, contact.company]);

  const { logoUrl, isLoading } = useCompanyLogo(domainForLogo);

  // Reset error state when domain or logoUrl changes
  React.useEffect(() => {
    setLogoError(false);
  }, [domainForLogo, logoUrl]);

  // Generate initials from contact name
  const generateInitials = () => {
    const firstName = contact.first_name || '';
    const lastName = contact.last_name || '';
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || contact.email.charAt(0).toUpperCase();
  };

  // Get full name
  const getFullName = () => {
    const firstName = contact.first_name || '';
    const lastName = contact.last_name || '';
    return `${firstName} ${lastName}`.trim() || contact.email;
  };

  // Generate avatar colors based on contact name
  const getAvatarColor = () => {
    const colors = [
      'bg-blue-600',
      'bg-orange-600',
      'bg-emerald-600',
      'bg-pink-600',
      'bg-indigo-600',
      'bg-yellow-600',
      'bg-purple-600',
      'bg-teal-600',
    ];

    const name = getFullName();
    const index = (name?.charCodeAt(0) || 0) % colors.length;
    return colors[index];
  };

  // Format last activity - use last_interaction_at if available, fallback to created_at
  const getLastActivity = () => {
    // Prefer last_interaction_at (actual meeting/activity date) over updated_at (sync date)
    const lastActivityDate = contact.last_interaction_at || null;

    // If no interaction date, show "No activity" instead of updated_at
    if (!lastActivityDate) {
      return 'No activity';
    }

    const daysSince = Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince === 0) return 'Today';
    if (daysSince === 1) return '1 day ago';
    if (daysSince < 7) return `${daysSince} days ago`;
    if (daysSince < 30) return `${Math.floor(daysSince / 7)} weeks ago`;
    if (daysSince < 365) return `${Math.floor(daysSince / 30)} months ago`;
    return `${Math.floor(daysSince / 365)} years ago`;
  };

  // Check if contact is primary (mock for MVP)
  const isPrimary = () => {
    return contact.is_primary || false;
  };

  // Format phone number
  const formatPhone = (phone: string | null | undefined) => {
    if (!phone) return null;
    return phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
  };

  if (viewMode === 'list') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={{ x: 4 }}
        className={`bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 border transition-all duration-300 group shadow-sm dark:shadow-none ${
          isSelectMode ? '' : 'cursor-pointer'
        } ${
          isSelected && isSelectMode
            ? 'border-emerald-500 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5'
            : 'border-gray-200 dark:border-gray-700/50 hover:border-emerald-500 dark:hover:border-emerald-500/30'
        }`}
        onClick={(e) => {
          if (isSelectMode) {
            e.stopPropagation();
            onSelect?.(contact.id, !isSelected);
          } else {
            onNavigate?.(contact);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Contact Avatar */}
            <div className="relative">
              <div className={`w-10 h-10 rounded-full ${getAvatarColor()} flex items-center justify-center text-white font-bold overflow-hidden`}>
                {logoUrl && !logoError && !isLoading ? (
                  <img
                    src={logoUrl}
                    alt={`${getFullName()} logo`}
                    className="w-full h-full object-cover"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  generateInitials()
                )}
              </div>
              {/* Select Checkbox - positioned as overlay on avatar corner */}
              {isSelectMode && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    onSelect?.(contact.id, e.target.checked);
                  }}
                  className="absolute -top-1 -right-1 w-5 h-5 text-emerald-600 dark:text-emerald-500 bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 rounded-md focus:ring-emerald-500 focus:ring-2"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                {getFullName()}
                {isPrimary() && <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />}
              </h3>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span>{contact.title || 'No title'}</span>
                {contact.company_name && (
                  <>
                    <span>•</span>
                    <span>{contact.company_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {contact.email}
              </div>
              {contact.phone && (
                <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1 mt-1">
                  <Phone className="w-3 h-3" />
                  {formatPhone(contact.phone)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-xs text-gray-600 dark:text-gray-500">Last Activity</div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{getLastActivity()}</div>
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
                      onEdit?.(contact);
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
                      onDelete?.(contact);
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
      className={`relative bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 overflow-hidden group shadow-sm dark:shadow-none ${
        isSelectMode ? '' : 'cursor-pointer'
      } ${
        isSelected && isSelectMode
          ? 'border-emerald-500 dark:border-emerald-500/30 ring-1 ring-emerald-500/20'
          : 'border-gray-200 dark:border-gray-700/50 hover:border-emerald-500 dark:hover:border-emerald-500/30'
      }`}
      onClick={(e) => {
        if (isSelectMode) {
          e.stopPropagation();
          onSelect?.(contact.id, !isSelected);
        } else {
          onNavigate?.(contact);
        }
      }}
    >
      {/* Animated background gradient */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        animate={hovered ? { scale: 1.5, rotate: 180 } : { scale: 1, rotate: 0 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />
      
      {/* Select Checkbox - positioned at top-right to avoid avatar clash */}
      {isSelectMode && (
        <div className="absolute top-4 right-4 z-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect?.(contact.id, e.target.checked);
            }}
            className="w-5 h-5 text-emerald-600 dark:text-emerald-500 bg-white dark:bg-gray-800/80 border-2 border-gray-300 dark:border-gray-600 rounded-md focus:ring-emerald-500 focus:ring-2"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Primary contact badge - positioned below checkbox if in select mode */}
      {isPrimary() && !isSelectMode && (
        <div className="absolute top-4 right-4 z-10">
          <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
        </div>
      )}
      {isPrimary() && isSelectMode && (
        <div className="absolute top-12 right-4 z-10">
          <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
        </div>
      )}

      {/* Avatar */}
      <div className="relative mb-4">
        <div className={`w-16 h-16 rounded-2xl ${getAvatarColor()} flex items-center justify-center text-white font-bold text-xl shadow-lg overflow-hidden`}>
          {logoUrl && !logoError && !isLoading ? (
            <img
              src={logoUrl}
              alt={`${getFullName()} logo`}
              className="w-full h-full object-cover"
              onError={() => setLogoError(true)}
            />
          ) : (
            generateInitials()
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
          <User className="w-3 h-3 text-white" />
        </div>
      </div>

      {/* Contact Info */}
      <div className="relative z-10 mb-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors mb-1">
          {getFullName()}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {contact.title ? (
            contact.title
          ) : (
            <span className="text-gray-400 dark:text-gray-600">—</span>
          )}
        </p>
        {contact.company_name && (
          <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400/80">
            <Building2 className="w-3 h-3" />
            <span>{contact.company_name}</span>
          </div>
        )}
      </div>

      {/* Contact Details */}
      <div className="relative z-10 mb-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <Mail className="w-3 h-3" />
          <span className="truncate">{contact.email}</span>
        </div>
        {contact.phone && (
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <Phone className="w-3 h-3" />
            <span>{formatPhone(contact.phone)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800/50">
        <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-500">
          <Clock className="w-3 h-3" />
          <span>{getLastActivity()}</span>
        </div>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isSelectMode && (
            <>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(contact);
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
                  onDelete?.(contact);
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

export default ContactCard;