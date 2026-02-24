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

interface FirefliesConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FirefliesConfigModal({ open, onOpenChange }: FirefliesConfigModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-yellow-100 dark:bg-yellow-900/30">
              <Video className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
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
