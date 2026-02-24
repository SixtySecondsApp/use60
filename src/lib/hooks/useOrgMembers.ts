/**
 * useOrgMembers Hook
 *
 * Fetches organization members with their profile information.
 * Used for user selection in various settings and mapping interfaces.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrg } from '@/lib/contexts/OrgContext';

export interface OrgMember {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  avatar_url?: string | null;
}

export function useOrgMembers() {
  const { activeOrgId } = useOrg();
  const orgId = activeOrgId;

  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      if (!orgId) return [];

      // Fetch memberships first
      const { data: memberships, error: membershipError } = await supabase
        .from('organization_memberships')
        .select('user_id, role')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });

      if (membershipError) throw membershipError;
      if (!memberships?.length) return [];

      // Fetch profiles for all member user_ids
      // Note: profiles table has first_name and last_name, NOT full_name
      const userIds = memberships.map((m) => m.user_id);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, avatar_url')
        .in('id', userIds);

      if (profileError) throw profileError;

      // Create a lookup map for profiles
      type ProfileData = { id: string; email: string; first_name: string | null; last_name: string | null; avatar_url: string | null };
      const profileMap = new Map<string, ProfileData>(
        profiles?.map((p) => [p.id, p as ProfileData]) || []
      );

      // Transform the data to a flat structure
      const members = memberships.map((member) => {
        const profile = profileMap.get(member.user_id);
        // Construct name from first_name and last_name
        const name = profile
          ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null
          : null;

        // Debug: log if user is missing names
        if (!name && profile?.email) {
          console.warn('[useOrgMembers] User missing names:', {
            userId: member.user_id,
            email: profile.email,
            hasProfile: !!profile,
            first_name: profile?.first_name,
            last_name: profile?.last_name,
          });
        }

        return {
          user_id: member.user_id,
          email: profile?.email || '',
          name,
          role: member.role,
          avatar_url: profile?.avatar_url || null,
        };
      }) as OrgMember[];

      return members;
    },
    enabled: !!orgId,
  });
}

export default useOrgMembers;
