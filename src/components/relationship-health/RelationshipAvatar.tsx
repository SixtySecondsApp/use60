/**
 * Relationship Avatar Component
 *
 * Displays company logo or contact avatar with fallback to initials
 */

import React, { useState } from 'react';
import { User, Building2 } from 'lucide-react';
import { useCompanyLogo } from '@/lib/hooks/useCompanyLogo';

interface RelationshipAvatarProps {
  name: string;
  type: 'contact' | 'company';
  domain?: string | null;
  email?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function RelationshipAvatar({
  name,
  type,
  domain,
  email,
  size = 'md',
  className = '',
}: RelationshipAvatarProps) {
  const [logoError, setLogoError] = useState(false);
  
  // Extract domain from email if not provided
  const domainForLogo = domain || (email ? email.split('@')[1] : null);
  const { logoUrl, isLoading } = useCompanyLogo(domainForLogo);

  // Generate initials
  const getInitials = () => {
    if (type === 'contact' && email) {
      return email.charAt(0).toUpperCase();
    }
    const words = name.split(' ');
    if (words.length >= 2) {
      return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  // Generate avatar color based on name
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
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Size variants
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-lg',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };

  return (
    <div className={`relative ${className}`}>
      <div className={`${sizeClasses[size]} rounded-lg ${getAvatarColor()} flex items-center justify-center text-white font-semibold shadow-lg overflow-hidden`}>
        {logoUrl && !logoError && !isLoading ? (
          <img
            src={logoUrl}
            alt={`${name} logo`}
            className="w-full h-full object-cover aspect-square"
            onError={() => setLogoError(true)}
          />
        ) : (
          <span>{getInitials()}</span>
        )}
      </div>
      {/* Type indicator badge */}
      <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${type === 'contact' ? 'bg-blue-500' : 'bg-purple-500'} rounded-full flex items-center justify-center border-2 border-gray-900`}>
        {type === 'contact' ? (
          <User className={`${iconSizes.sm} text-white`} />
        ) : (
          <Building2 className={`${iconSizes.sm} text-white`} />
        )}
      </div>
    </div>
  );
}







































