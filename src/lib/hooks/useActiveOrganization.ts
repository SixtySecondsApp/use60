// Shim: delegates to orgStore
import { useOrgStore } from '@/lib/stores/orgStore';

export function useActiveOrganization() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const org = useOrgStore((s) => s.organizations.find((o) => o.id === s.activeOrgId));
  return { activeOrgId, organization: org ?? null };
}
