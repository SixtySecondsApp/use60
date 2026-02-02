import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BackToPlatformProps {
  className?: string;
}

export function BackToPlatform({ className }: BackToPlatformProps) {
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => navigate('/platform')}
      className={cn(
        'flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white',
        className
      )}
    >
      <ArrowLeft className="w-4 h-4" />
      Back to Platform Admin
    </Button>
  );
}
