/**
 * AIModelAdmin — Platform Admin page for granular per-feature AI model config.
 *
 * This is the detailed view where platform admins configure which specific
 * AI models power each feature, including planner/driver selection and presets.
 * End users see the simplified tier selector (Low/Medium/High) in Settings > Credits.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModelConfigPanel } from '@/components/credits/ModelConfigPanel';

export default function AIModelAdmin() {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/platform')}
          className="gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Platform
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
          <Brain className="w-6 h-6 text-[#37bd7e]" />
          AI Model Configuration
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configure which AI models power each feature at a granular level.
          End users see a simplified intelligence tier selector in their settings.
        </p>
      </div>

      <ModelConfigPanel />
    </div>
  );
}
