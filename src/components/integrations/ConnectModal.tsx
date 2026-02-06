import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowRightLeft, Loader2 } from 'lucide-react';
import { useIntegrationLogo } from '@/lib/hooks/useIntegrationLogo';
import { DEFAULT_SIXTY_ICON_URL } from '@/lib/utils/sixtyBranding';

export interface Permission {
  title: string;
  description: string;
}

interface ConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  integrationName: string;
  description?: string;
  permissions: Permission[];
  onAuthorize: () => void;
  isAuthorizing?: boolean;
  brandColor?: string;
  fallbackIcon?: React.ReactNode;
  /** Optional override (e.g. org branding). */
  sixtyLogoUrl?: string | null;
}

export function ConnectModal({
  open,
  onOpenChange,
  integrationId,
  integrationName,
  description = 'Authorize Sixty Sales to access your account.',
  permissions,
  onAuthorize,
  isAuthorizing = false,
  brandColor = 'blue',
  fallbackIcon,
  sixtyLogoUrl,
}: ConnectModalProps) {
  const { logoUrl } = useIntegrationLogo(integrationId);
  const sixtyLogo = sixtyLogoUrl || DEFAULT_SIXTY_ICON_URL;

  const colorClasses: Record<string, { button: string; shadow: string }> = {
    blue: { button: 'bg-blue-600 hover:bg-blue-700', shadow: 'shadow-blue-500/20' },
    purple: { button: 'bg-purple-600 hover:bg-purple-700', shadow: 'shadow-purple-500/20' },
    green: { button: 'bg-emerald-600 hover:bg-emerald-700', shadow: 'shadow-emerald-500/20' },
    red: { button: 'bg-red-600 hover:bg-red-700', shadow: 'shadow-red-500/20' },
    orange: { button: 'bg-orange-600 hover:bg-orange-700', shadow: 'shadow-orange-500/20' },
    cyan: { button: 'bg-cyan-600 hover:bg-cyan-700', shadow: 'shadow-cyan-500/20' },
  };

  const colors = colorClasses[brandColor] || colorClasses.blue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        {/* Accessibility: Radix DialogContent requires Title + Description */}
        <DialogHeader className="sr-only">
          <DialogTitle>Connect {integrationName}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Header with logos */}
        <div className="p-6 text-center border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center justify-center gap-4 mb-4">
            {/* Sixty Sales Logo */}
            <div className="w-12 h-12 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center shadow-sm overflow-hidden">
              <img
                src={sixtyLogo}
                alt="Sixty logo"
                className="w-8 h-8 object-contain"
                decoding="async"
                loading="eager"
              />
            </div>
            <ArrowRightLeft className="w-5 h-5 text-gray-400" />
            {/* Integration Logo - S3 only, no fallback */}
            <div className="w-12 h-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center overflow-hidden">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={`${integrationName} logo`}
                  className="w-8 h-8 object-contain"
                />
              )}
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Connect {integrationName}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
        </div>

        {/* Permissions List */}
        <div className="p-6 space-y-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Requested Permissions
          </p>

          {permissions.map((permission, index) => (
            <div key={index} className="flex gap-3">
              <div className="mt-0.5">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-200">
                  {permission.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {permission.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 pt-2 flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAuthorizing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={onAuthorize}
            disabled={isAuthorizing}
            className={`flex-1 ${colors.button} text-white shadow-lg ${colors.shadow}`}
          >
            {isAuthorizing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              'Authorize'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
