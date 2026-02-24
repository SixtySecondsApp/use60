/**
 * FirefliesConfigModal
 *
 * Configuration modal for Fireflies.ai integration.
 * Wraps FirefliesSettings component in a Dialog for use on the Integrations page.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FirefliesSettings } from './FirefliesSettings';
import { Video } from 'lucide-react';
import { useIntegrationLogo } from '@/lib/hooks/useIntegrationLogo';

interface FirefliesConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FirefliesConfigModal({ open, onOpenChange }: FirefliesConfigModalProps) {
  const { logoUrl } = useIntegrationLogo('fireflies');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Fireflies.ai" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                  <Video className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
              )}
            </div>
            <div>
              <DialogTitle className="text-xl">Fireflies.ai</DialogTitle>
              <DialogDescription>
                AI meeting notes & transcription
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4">
          <FirefliesSettings />
        </div>
      </DialogContent>
    </Dialog>
  );
}
