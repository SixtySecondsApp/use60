import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, X, Palette } from 'lucide-react';
import LogoUploader from './LogoUploader';
import { resolveClientLogo } from '@/lib/services/proposalService';

interface BrandConfig {
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  font_family?: string;
  logo_url?: string;
  company_name?: string;
}

interface BrandConfigPanelProps {
  brandConfig: BrandConfig;
  onBrandConfigChange: (config: BrandConfig) => void;
  orgId: string;
  contactEmail?: string | null;
  proposalId?: string | null;
  templateBrandConfig?: { logo_url?: string } | null;
  brandingEnabled?: boolean;
}

const FONT_OPTIONS = [
  { value: 'Inter, system-ui, sans-serif', label: 'Inter (Default)' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Merriweather, Georgia, serif', label: 'Merriweather' },
  { value: "'Roboto', system-ui, sans-serif", label: 'Roboto' },
  { value: "'Helvetica Neue', Helvetica, Arial, sans-serif", label: 'Helvetica' },
];

export default function BrandConfigPanel({
  brandConfig,
  onBrandConfigChange,
  orgId,
  contactEmail,
  proposalId,
  templateBrandConfig,
  brandingEnabled = true,
}: BrandConfigPanelProps) {
  const [resolving, setResolving] = useState(false);
  const [logoSource, setLogoSource] = useState<string>('');

  // Auto-resolve logo on mount if branding is enabled
  useEffect(() => {
    if (!brandingEnabled || brandConfig.logo_url) return;

    let cancelled = false;
    setResolving(true);

    resolveClientLogo(orgId, contactEmail, proposalId, templateBrandConfig)
      .then((result) => {
        if (cancelled) return;
        if (result.logo_url) {
          onBrandConfigChange({ ...brandConfig, logo_url: result.logo_url });
          setLogoSource(result.source);
        } else if (result.fallback_text) {
          setLogoSource('fallback');
        }
      })
      .catch(() => { /* non-critical */ })
      .finally(() => { if (!cancelled) setResolving(false); });

    return () => { cancelled = true; };
  }, [brandingEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleColorChange = (key: 'primary_color' | 'secondary_color' | 'accent_color', value: string) => {
    onBrandConfigChange({ ...brandConfig, [key]: value });
  };

  const handleLogoUpload = (result: { storage_path: string; public_url: string }) => {
    onBrandConfigChange({ ...brandConfig, logo_url: result.public_url });
    setLogoSource('upload');
  };

  const handleRemoveLogo = () => {
    onBrandConfigChange({ ...brandConfig, logo_url: undefined });
    setLogoSource('');
  };

  if (!brandingEnabled) {
    return (
      <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
        <Palette className="w-8 h-8 mx-auto mb-2 opacity-40" />
        Branding is disabled. Enable it in the Format step to configure brand settings.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Logo Section */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Client Logo</Label>
        {resolving ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            Resolving logo...
          </div>
        ) : brandConfig.logo_url ? (
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-900">
              <img
                src={brandConfig.logo_url}
                alt="Client logo"
                className="h-full w-auto object-contain"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                Source: {logoSource || 'custom'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveLogo}
                className="text-red-500 hover:text-red-700 h-auto p-0 text-xs"
              >
                <X className="w-3 h-3 mr-1" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <LogoUploader
            orgId={orgId}
            proposalId={proposalId || undefined}
            onUpload={handleLogoUpload}
          />
        )}
      </div>

      {/* Colors */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-medium mb-1 block">Primary Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brandConfig.primary_color || '#1e40af'}
              onChange={(e) => handleColorChange('primary_color', e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
            />
            <Input
              value={brandConfig.primary_color || '#1e40af'}
              onChange={(e) => handleColorChange('primary_color', e.target.value)}
              className="h-8 text-xs font-mono"
              placeholder="#1e40af"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs font-medium mb-1 block">Secondary Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brandConfig.secondary_color || '#64748b'}
              onChange={(e) => handleColorChange('secondary_color', e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
            />
            <Input
              value={brandConfig.secondary_color || '#64748b'}
              onChange={(e) => handleColorChange('secondary_color', e.target.value)}
              className="h-8 text-xs font-mono"
              placeholder="#64748b"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs font-medium mb-1 block">Accent Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brandConfig.accent_color || '#3b82f6'}
              onChange={(e) => handleColorChange('accent_color', e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
            />
            <Input
              value={brandConfig.accent_color || '#3b82f6'}
              onChange={(e) => handleColorChange('accent_color', e.target.value)}
              className="h-8 text-xs font-mono"
              placeholder="#3b82f6"
            />
          </div>
        </div>
      </div>

      {/* Font Family */}
      <div>
        <Label className="text-xs font-medium mb-1 block">Font Family</Label>
        <select
          value={brandConfig.font_family || FONT_OPTIONS[0].value}
          onChange={(e) => onBrandConfigChange({ ...brandConfig, font_family: e.target.value })}
          className="w-full h-9 px-3 text-sm border rounded-md bg-white dark:bg-gray-800 dark:border-gray-700"
        >
          {FONT_OPTIONS.map((font) => (
            <option key={font.value} value={font.value}>{font.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
