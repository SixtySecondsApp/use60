import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { factProfileToICPCriteria } from '@/lib/utils/factProfileToICP';
import type { FactProfile } from '@/lib/types/factProfile';

interface CreateICPFromFactsButtonProps {
  profile: FactProfile;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
}

export function CreateICPFromFactsButton({ profile, variant = 'outline', size = 'default' }: CreateICPFromFactsButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    const criteria = factProfileToICPCriteria(profile.research_data);
    const handoff = {
      prefillCriteria: criteria,
      fromFactProfileId: profile.id,
      fromFactProfileName: profile.company_name,
    };
    // Persist handoff data so it survives route reloads.
    try {
      sessionStorage.setItem(
        'prospecting-prefill-fact-profile',
        JSON.stringify({ ...handoff, createdAt: Date.now() })
      );
    } catch {
      // Ignore storage errors and continue with router state handoff.
    }
    navigate('/profiles?tab=icps', { state: handoff });
  };

  return (
    <Button variant={variant} size={size} onClick={handleClick} className="gap-1.5">
      <Target className="h-4 w-4" />
      Create ICP from This
    </Button>
  );
}
