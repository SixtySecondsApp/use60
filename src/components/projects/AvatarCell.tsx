import React from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { UserProfile } from '@/lib/database/models';

interface AvatarCellProps {
  person?: UserProfile | null;
  size?: 'sm' | 'md' | 'lg';
  isDark?: boolean;
  showName?: boolean;
}

// Color gradients for avatars (deterministic based on name/id)
const avatarColors = [
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-purple-500 to-violet-500',
  'from-pink-500 to-rose-500',
  'from-red-500 to-orange-500',
  'from-indigo-500 to-purple-500',
  'from-cyan-500 to-blue-500',
];

function getAvatarColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(person: UserProfile): string {
  const first = person.first_name?.[0] || '';
  const last = person.last_name?.[0] || '';
  if (first && last) return `${first}${last}`.toUpperCase();
  if (person.email) return person.email[0].toUpperCase();
  return '?';
}

export function AvatarCell({ person, size = 'md', isDark = true, showName = false }: AvatarCellProps) {
  const sizes = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm'
  };

  if (!person) {
    return (
      <motion.div
        whileHover={{ scale: 1.1 }}
        className={`${sizes[size]} rounded-full border-2 border-dashed flex items-center justify-center 
                    cursor-pointer transition-colors
                    ${isDark
                      ? 'border-gray-600 hover:border-gray-400 bg-gray-800/30'
                      : 'border-gray-400 hover:border-gray-500 bg-gray-200/30'}`}
      >
        <User className={`w-3 h-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
      </motion.div>
    );
  }

  const initials = getInitials(person);
  const colorGradient = getAvatarColor(person.id || person.email || '');
  const displayName = person.first_name && person.last_name 
    ? `${person.first_name} ${person.last_name}` 
    : person.email || 'Unknown';

  return (
    <div className="flex items-center gap-2">
      <motion.div
        whileHover={{ scale: 1.1 }}
        className={`${sizes[size]} rounded-full bg-gradient-to-br ${colorGradient}
                    flex items-center justify-center text-white font-semibold
                    shadow-lg shadow-current/30 cursor-pointer
                    ring-2 ${isDark ? 'ring-gray-900 ring-offset-1 ring-offset-gray-900' : 'ring-white ring-offset-1 ring-offset-white'}`}
        title={displayName}
      >
        {person.avatar_url ? (
          <img
            src={person.avatar_url}
            alt={displayName}
            className="w-full h-full rounded-full object-cover aspect-square"
          />
        ) : (
          initials
        )}
      </motion.div>
      {showName && (
        <span className={`text-sm font-medium truncate max-w-[120px] ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {displayName}
        </span>
      )}
    </div>
  );
}

// Multiple avatars stacked
export function AvatarStack({ 
  persons, 
  maxDisplay = 3, 
  size = 'md', 
  isDark = true 
}: { 
  persons: (UserProfile | null | undefined)[]; 
  maxDisplay?: number;
  size?: 'sm' | 'md' | 'lg';
  isDark?: boolean;
}) {
  const validPersons = persons.filter(Boolean) as UserProfile[];
  const displayPersons = validPersons.slice(0, maxDisplay);
  const remaining = validPersons.length - maxDisplay;

  return (
    <div className="flex items-center">
      {displayPersons.length === 0 ? (
        <AvatarCell person={null} size={size} isDark={isDark} />
      ) : (
        displayPersons.map((person, i) => (
          <div key={person.id || i} className={i > 0 ? '-ml-2' : ''}>
            <AvatarCell person={person} size={size} isDark={isDark} />
          </div>
        ))
      )}
      {remaining > 0 && (
        <span className={`ml-2 text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          +{remaining}
        </span>
      )}
    </div>
  );
}

