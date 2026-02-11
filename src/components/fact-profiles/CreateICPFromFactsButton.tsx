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
    navigate('/prospecting', {
      state: {
        prefillCriteria: criteria,
        fromFactProfileId: profile.id,
        fromFactProfileName: profile.company_name,
      },
    });
  };

  return (
    <Button variant={variant} size={size} onClick={handleClick} className="gap-1.5">
      <Target className="h-4 w-4" />
      Create ICP from This
    </Button>
  );
}
