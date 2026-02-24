import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useIntegrationLogo } from '@/lib/hooks/useIntegrationLogo';
import { cn } from '@/lib/utils';

interface ConfigureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  integrationName: string;
  connectedEmail?: string;
  connectedAt?: string;
  children: React.ReactNode;
  onSave?: () => void;
  onDisconnect?: () => void;
  isSaving?: boolean;
  isDisconnecting?: boolean;
  hasChanges?: boolean;
  fallbackIcon?: React.ReactNode;
  showFooter?: boolean;
}

export function ConfigureModal({
  open,
  onOpenChange,
  integrationId,
  integrationName,
  connectedEmail,
  connectedAt,
  children,
  onSave,
  onDisconnect,
  isSaving = false,
  isDisconnecting = false,
  hasChanges = false,
  fallbackIcon,
  showFooter = true,
}: ConfigureModalProps) {
  const { logoUrl } = useIntegrationLogo(integrationId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Accessibility: Radix Dialog requires a title and description */}
        <DialogHeader className="sr-only">
          <DialogTitle>{integrationName} settings</DialogTitle>
          <DialogDescription>Configure {integrationName} integration settings.</DialogDescription>
        </DialogHeader>

        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700 overflow-hidden">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={`${integrationName} logo`}
                  className="w-6 h-6 object-contain"
                />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {integrationName} Settings
              </h2>
              {connectedEmail && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Connected as {connectedEmail}
                </p>
              )}
              {!connectedEmail && connectedAt && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Connected on {new Date(connectedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">{children}</div>

        {/* Footer */}
        {showFooter && (
          <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3 shrink-0">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            {onSave && (
              <Button
                onClick={onSave}
                disabled={isSaving || !hasChanges}
                className="bg-gray-900 dark:bg-white text-white dark:text-black hover:opacity-90"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Reusable section components for ConfigureModal

interface ConfigSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function ConfigSection({ title, children, className }: ConfigSectionProps) {
  return (
    <div className={className}>
      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

interface ConfigToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ConfigToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: ConfigToggleProps) {
  const toggleId = React.useId();

  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <label htmlFor={toggleId} className="text-sm font-medium text-gray-900 dark:text-gray-200 cursor-pointer">
          {label}
        </label>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      <div className="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
        <input
          type="checkbox"
          id={toggleId}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className={cn(
            'absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-300',
            checked
              ? 'right-0 border-blue-500'
              : 'right-5 border-gray-300 dark:border-gray-600',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
        <label
          htmlFor={toggleId}
          className={cn(
            'block overflow-hidden h-5 rounded-full cursor-pointer transition-colors duration-300',
            checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-700',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
      </div>
    </div>
  );
}

interface ConfigInputProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'url';
  disabled?: boolean;
}

export function ConfigInput({
  label,
  description,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
}: ConfigInputProps) {
  const inputId = React.useId();

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <input
        type={type}
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm',
          'focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors',
          'text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      )}
    </div>
  );
}

interface DangerZoneProps {
  title?: string;
  description?: string;
  buttonText?: string;
  onAction: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function DangerZone({
  title = 'Disconnect Integration',
  description = 'This will stop all syncing immediately.',
  buttonText = 'Disconnect',
  onAction,
  isLoading = false,
  disabled = false,
}: DangerZoneProps) {
  return (
    <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
      <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">
        Danger Zone
      </h3>
      <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/20">
        <div>
          <p className="text-sm font-medium text-red-700 dark:text-red-400">{title}</p>
          <p className="text-xs text-red-600/70 dark:text-red-400/70">{description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onAction}
          disabled={isLoading || disabled}
          className="text-xs font-semibold bg-white dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Processing...
            </>
          ) : (
            buttonText
          )}
        </Button>
      </div>
    </div>
  );
}
