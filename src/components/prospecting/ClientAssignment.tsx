import React, { useState, useRef, useEffect } from 'react';
import { UserPlus, X, Search, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUpdateICPProfile } from '@/lib/hooks/useICPProfilesCRUD';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactOption {
  id: string;
  full_name: string;
  email: string | null;
  company: string | null;
}

interface ClientAssignmentProps {
  profileId: string;
  currentAssigneeId: string | null;
  currentAssigneeName?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClientAssignment({
  profileId,
  currentAssigneeId,
  currentAssigneeName,
}: ClientAssignmentProps) {
  const { activeOrg } = useOrg();
  const updateProfile = useUpdateICPProfile();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Search contacts query
  const { data: contacts = [], isLoading } = useQuery<ContactOption[]>({
    queryKey: ['contacts-assignment-search', activeOrg?.id, searchQuery],
    queryFn: async () => {
      if (!activeOrg?.id || searchQuery.length < 2) return [];

      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, email, company')
        .eq('organization_id', activeOrg.id)
        .or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,company.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) return [];
      return (data ?? []) as ContactOption[];
    },
    enabled: !!activeOrg?.id && searchQuery.length >= 2 && isOpen,
  });

  const handleAssign = (contact: ContactOption) => {
    updateProfile.mutate({
      id: profileId,
      payload: { assigned_to_contact_id: contact.id } as any,
    });
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleUnassign = () => {
    updateProfile.mutate({
      id: profileId,
      payload: { assigned_to_contact_id: null } as any,
    });
  };

  // Current assignee display
  if (currentAssigneeId && currentAssigneeName) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-medium">
          {currentAssigneeName.charAt(0).toUpperCase()}
        </div>
        <span className="text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
          {currentAssigneeName}
        </span>
        <button
          onClick={handleUnassign}
          className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          title="Remove assignment"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-1.5 text-xs text-gray-500 dark:text-zinc-400 h-7 px-2"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Assign Client
      </Button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts..."
                className="w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 py-1.5 pl-8 pr-3 text-xs text-gray-900 dark:text-zinc-100 placeholder-gray-500 dark:placeholder-zinc-500 focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto border-t border-gray-100 dark:border-zinc-800">
            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            )}

            {!isLoading && searchQuery.length < 2 && (
              <p className="px-3 py-3 text-xs text-gray-500 dark:text-zinc-500 text-center">
                Type at least 2 characters to search
              </p>
            )}

            {!isLoading && searchQuery.length >= 2 && contacts.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-500 dark:text-zinc-500 text-center">
                No contacts found
              </p>
            )}

            {contacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => handleAssign(contact)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 text-xs font-medium">
                  {contact.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900 dark:text-zinc-100">
                    {contact.full_name}
                  </p>
                  {contact.email && (
                    <p className="truncate text-gray-500 dark:text-zinc-500">
                      {contact.email}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
