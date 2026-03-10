import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Building2, Check, X, Loader2, AlertCircle, ChevronDown, ChevronRight, Brain, FileText, Palette, Plus, Trash2, Globe, Upload, Eye } from 'lucide-react';
import { OrgAIUsage } from '@/components/settings/OrgAIUsage';
import { OrgProfileSettings } from '@/components/settings/OrgProfileSettings';
import { Button } from '@/components/ui/button';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { CURRENCIES, type CurrencyCode } from '@/lib/services/currencyService';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ---------------------------------------------------------------------------
// Brand prompt generator — mirrors the edge function version
// ---------------------------------------------------------------------------

const TONE_DESCRIPTIONS: Record<string, string> = {
  formal: 'Write in a polished, professional manner. Use proper grammar, avoid slang, and maintain authority.',
  conversational: 'Write like a knowledgeable friend. Use contractions, ask rhetorical questions, and keep sentences short.',
  playful: 'Write with energy and personality. Use bold statements, wordplay, and punchy rhythm.',
  authoritative: 'Write with deep confidence and domain expertise. Lead with data, use decisive language.',
  minimal: 'Write with radical brevity. Every word earns its place. Short sentences. No filler.',
};

function buildBrandPrompt(
  colors: Array<{ hex: string; role: string }>,
  headingFont: string | null,
  bodyFont: string | null,
  tone: string | null,
  orgName: string,
  websiteUrl?: string
): string {
  const lines: string[] = [];
  lines.push(`## Brand Identity — ${orgName}`);
  if (websiteUrl) lines.push(`Website: ${websiteUrl}`);
  lines.push('');

  if (colors.length) {
    lines.push('### Color Palette');
    for (const c of colors) {
      const role = (c.role || 'accent').toLowerCase();
      let usage = '';
      if (role.includes('primary')) usage = ' — Use for headings, buttons, and primary CTAs';
      else if (role.includes('secondary')) usage = ' — Use for supporting elements, borders, and secondary actions';
      else if (role.includes('accent')) usage = ' — Use sparingly for highlights, badges, and emphasis';
      else if (role.includes('background')) usage = ' — Use for page/section backgrounds';
      lines.push(`- ${c.role || 'Accent'}: \`${c.hex}\`${usage}`);
    }
    lines.push('');
    lines.push('Use ONLY these brand colors. Do not introduce new colors. Ensure WCAG AA contrast.');
    lines.push('');
  }

  if (headingFont || bodyFont) {
    lines.push('### Typography');
    if (headingFont) lines.push(`- **Headings**: ${headingFont}`);
    if (bodyFont) lines.push(`- **Body**: ${bodyFont}`);
    lines.push('');
  }

  if (tone) {
    lines.push('### Voice & Tone');
    const desc = TONE_DESCRIPTIONS[tone.toLowerCase().trim()];
    lines.push(`Style: **${tone}**`);
    if (desc) lines.push(desc);
    else lines.push(`Write in a ${tone} manner consistently across all copy.`);
    lines.push('');
  }

  lines.push('### Rules');
  lines.push('- Never deviate from brand colors, fonts, or tone unless explicitly asked');
  lines.push('- Prioritize brand consistency over generic best practices');
  const primary = colors.find(c => c.role?.toLowerCase().includes('primary'));
  if (primary) lines.push(`- Default CTA/button color: \`${primary.hex}\``);

  return lines.join('\n');
}

export default function OrganizationSettingsPage() {
  const { activeOrgId, activeOrg, organizations, permissions, refreshOrgs, switchOrg } = useOrg();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedOrgName, setEditedOrgName] = useState(activeOrg?.name || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  // Org profile settings
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(
    ((activeOrg?.currency_code as CurrencyCode | undefined) || 'GBP')
  );
  const [companyWebsite, setCompanyWebsite] = useState(activeOrg?.company_website || activeOrg?.company_domain || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Brand guidelines
  interface BrandColor { hex: string; role: string }
  const existingBrand = (activeOrg as any)?.brand_guidelines || {};
  const [brandColors, setBrandColors] = useState<BrandColor[]>(existingBrand.colors || []);
  const [brandFont, setBrandFont] = useState(existingBrand.heading_font || '');
  const [brandBodyFont, setBrandBodyFont] = useState(existingBrand.body_font || '');
  const [brandTone, setBrandTone] = useState(existingBrand.tone || '');
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [isScrapingBrand, setIsScrapingBrand] = useState(false);
  const [isUploadingBrand, setIsUploadingBrand] = useState(false);
  const [showBrandPrompt, setShowBrandPrompt] = useState(false);
  const brandFileInputRef = useRef<HTMLInputElement>(null);

  // Update org name when activeOrg changes
  useEffect(() => {
    setEditedOrgName(activeOrg?.name || '');
  }, [activeOrg]);

  // Update org profile settings when activeOrg changes
  useEffect(() => {
    setCurrencyCode(((activeOrg?.currency_code as CurrencyCode | undefined) || 'GBP'));
    setCompanyWebsite(activeOrg?.company_website || activeOrg?.company_domain || '');
    const bg = (activeOrg as any)?.brand_guidelines || {};
    setBrandColors(bg.colors || []);
    setBrandFont(bg.heading_font || '');
    setBrandBodyFont(bg.body_font || '');
    setBrandTone(bg.tone || '');
  }, [activeOrg?.currency_code, activeOrg?.company_website, (activeOrg as any)?.brand_guidelines]);

  // Load member count
  useEffect(() => {
    if (!activeOrgId) return;

    const loadMemberCount = async () => {
      setIsLoadingMembers(true);
      try {
        const { count, error } = await (supabase as any)
          .from('organization_memberships')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', activeOrgId);

        if (error) throw error;
        setMemberCount(count || 0);
      } catch (err: any) {
        console.error('Error loading member count:', err);
      } finally {
        setIsLoadingMembers(false);
      }
    };

    loadMemberCount();
  }, [activeOrgId]);

  // Handle saving org name
  const handleSaveOrgName = async () => {
    if (!activeOrgId || !editedOrgName.trim()) return;

    setIsSavingName(true);
    try {
      const response = await (supabase.rpc as any)('rename_user_organization', {
        p_new_name: editedOrgName.trim(),
      }) as { error: any };

      if (response.error) throw response.error;

      toast.success('Organization name updated');
      await refreshOrgs();
      setIsEditingName(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update organization name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveOrgProfile = async () => {
    if (!activeOrgId) return;
    if (!permissions.canManageSettings) return;

    setIsSavingProfile(true);
    try {
      const locale = CURRENCIES[currencyCode]?.locale || 'en-GB';
      const payload = {
        currency_code: currencyCode,
        currency_locale: locale,
        company_website: companyWebsite.trim() ? companyWebsite.trim() : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await (supabase as any)
        .from('organizations')
        .update(payload)
        .eq('id', activeOrgId);

      if (error) throw error;
      toast.success('Organization settings saved');
      await refreshOrgs();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save organization settings');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveBrandGuidelines = useCallback(async () => {
    if (!activeOrgId || !permissions.canManageSettings) return;
    setIsSavingBrand(true);
    try {
      const validColors = brandColors.filter(c => c.hex && /^#[0-9A-Fa-f]{3,8}$/.test(c.hex));
      const payload = {
        colors: validColors,
        heading_font: brandFont.trim() || null,
        body_font: brandBodyFont.trim() || null,
        tone: brandTone || null,
        brand_prompt: buildBrandPrompt(
          validColors,
          brandFont.trim() || null,
          brandBodyFont.trim() || null,
          brandTone || null,
          activeOrg?.name || 'Our Company',
          companyWebsite || (activeOrg as any)?.company_website || ''
        ),
      };
      const { error } = await (supabase as any)
        .from('organizations')
        .update({ brand_guidelines: payload, updated_at: new Date().toISOString() })
        .eq('id', activeOrgId);
      if (error) throw error;
      toast.success('Brand guidelines saved');
      await refreshOrgs();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save brand guidelines');
    } finally {
      setIsSavingBrand(false);
    }
  }, [activeOrgId, permissions.canManageSettings, brandColors, brandFont, brandBodyFont, brandTone, companyWebsite, activeOrg, refreshOrgs]);

  const handleAutoDetectBrand = useCallback(async () => {
    if (!activeOrgId || !permissions.canManageSettings) return;
    const websiteUrl = companyWebsite.trim()
      || (activeOrg as any)?.company_website
      || (activeOrg as any)?.company_domain
      || '';
    if (!websiteUrl) {
      toast.error('Enter your company website above first, then try again');
      return;
    }
    setIsScrapingBrand(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-brand-guidelines', {
        body: { website_url: websiteUrl },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const bg = data?.brand_guidelines;
      if (bg) {
        if (Array.isArray(bg.colors)) setBrandColors(bg.colors);
        if (bg.heading_font) setBrandFont(bg.heading_font);
        if (bg.body_font) setBrandBodyFont(bg.body_font);
        if (bg.tone) setBrandTone(bg.tone);
        toast.success('Brand guidelines detected from website');
        await refreshOrgs();
      } else {
        toast.info('Could not extract brand guidelines — try adding them manually');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to auto-detect brand guidelines');
    } finally {
      setIsScrapingBrand(false);
    }
  }, [activeOrgId, permissions.canManageSettings, companyWebsite, activeOrg, refreshOrgs]);

  const handleUploadBrandFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeOrgId || !permissions.canManageSettings) return;

    // Reset the input so the same file can be re-selected
    e.target.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      svg: 'image/svg+xml',
      md: 'text/markdown',
      markdown: 'text/markdown',
    };
    const file_type = mimeMap[ext] || file.type || 'application/octet-stream';

    setIsUploadingBrand(true);
    try {
      const file_data: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip the data:...;base64, prefix
          const base64 = result.split(',')[1] || result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('scrape-brand-guidelines', {
        body: { file_data, file_type, file_name: file.name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const bg = data?.brand_guidelines;
      if (bg) {
        if (Array.isArray(bg.colors)) setBrandColors(bg.colors);
        if (bg.heading_font) setBrandFont(bg.heading_font);
        if (bg.body_font) setBrandBodyFont(bg.body_font);
        if (bg.tone) setBrandTone(bg.tone);
        toast.success('Brand guidelines extracted from file');
      } else {
        toast.info('Could not extract brand guidelines from file — try adding them manually');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to extract brand guidelines from file');
    } finally {
      setIsUploadingBrand(false);
    }
  }, [activeOrgId, permissions.canManageSettings]);

  if (!activeOrgId) {
    return (
      <SettingsPageWrapper
        title="Organization Settings"
        description="Manage your organization details"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-400">No organization selected</p>
          </div>
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      title="Organization Settings"
      description="Manage your organization details"
    >
      <div className="space-y-6">
        {/* Organization Switcher - only show if user has multiple orgs */}
        {organizations.length > 1 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#37bd7e]" />
              Switch Organization
            </h2>
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="truncate">{activeOrg?.name || 'Select organization'}</span>
                    <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[300px]">
                  {organizations.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => {
                        switchOrg(org.id);
                        toast.success(`Switched to ${org.name}`);
                      }}
                      className={org.id === activeOrgId ? 'bg-[#37bd7e]/10 text-[#37bd7e]' : ''}
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      <span className="truncate">{org.name}</span>
                      {org.id === activeOrgId && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                You have access to {organizations.length} organizations. Switching will reload data for the selected organization.
              </p>
            </div>
          </div>
        )}

        {/* Organization Name Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#37bd7e]" />
            Organization Details
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between">
              {isEditingName ? (
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="text"
                    value={editedOrgName}
                    onChange={(e) => setEditedOrgName(e.target.value)}
                    className="flex-1 bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                    maxLength={100}
                    placeholder="Organization name"
                  />
                  <Button
                    onClick={handleSaveOrgName}
                    disabled={isSavingName || !editedOrgName.trim()}
                    size="sm"
                    className="bg-[#37bd7e] hover:bg-[#2da76c]"
                  >
                    {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button
                    onClick={() => {
                      setIsEditingName(false);
                      setEditedOrgName(activeOrg?.name || '');
                    }}
                    variant="ghost"
                    size="sm"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">{activeOrg?.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isLoadingMembers ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Loading members...
                        </span>
                      ) : (
                        `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`
                      )}
                    </p>
                  </div>
                  {permissions.canManageSettings && (
                    <Button
                      onClick={() => {
                        setEditedOrgName(activeOrg?.name || '');
                        setIsEditingName(true);
                      }}
                      variant="outline"
                      size="sm"
                    >
                      Edit Name
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Company Profile (Fact Profile) */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#37bd7e]" />
            Company Profile
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <OrgProfileSettings
              orgId={activeOrgId}
              canManage={permissions.canManageSettings}
            />
          </div>
        </div>

        {/* Brand Guidelines */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#37bd7e]" />
            Brand Guidelines
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Brand colors, fonts, and tone are used by AI agents (landing page builder, email drafts, proposals, ad remix) to match your brand.
              </p>
              {permissions.canManageSettings && (
                <>
                  <input
                    ref={brandFileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.svg,.md,.markdown"
                    className="hidden"
                    onChange={handleUploadBrandFile}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        disabled={isScrapingBrand || isUploadingBrand}
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0"
                      >
                        {isScrapingBrand || isUploadingBrand ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                            {isScrapingBrand ? 'Detecting...' : 'Uploading...'}
                          </>
                        ) : (
                          <>
                            <Palette className="w-4 h-4 mr-1.5" />
                            Auto-detect Brand
                            <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
                          </>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleAutoDetectBrand}>
                        <Globe className="w-4 h-4 mr-2" />
                        Analyze Website
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => brandFileInputRef.current?.click()}>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Brand File
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>

            {/* Brand Colors */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Brand Colors
              </label>
              {brandColors.map((color, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={color.hex || '#000000'}
                    onChange={(e) => {
                      const updated = [...brandColors];
                      updated[idx] = { ...updated[idx], hex: e.target.value };
                      setBrandColors(updated);
                    }}
                    disabled={!permissions.canManageSettings}
                    className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-700 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={color.hex}
                    onChange={(e) => {
                      const updated = [...brandColors];
                      updated[idx] = { ...updated[idx], hex: e.target.value };
                      setBrandColors(updated);
                    }}
                    disabled={!permissions.canManageSettings}
                    className="w-28 bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white font-mono"
                    placeholder="#000000"
                  />
                  <input
                    type="text"
                    value={color.role}
                    onChange={(e) => {
                      const updated = [...brandColors];
                      updated[idx] = { ...updated[idx], role: e.target.value };
                      setBrandColors(updated);
                    }}
                    disabled={!permissions.canManageSettings}
                    className="flex-1 bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
                    placeholder="e.g. Primary, Accent, Background"
                  />
                  {permissions.canManageSettings && (
                    <button
                      type="button"
                      onClick={() => setBrandColors(brandColors.filter((_, i) => i !== idx))}
                      className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {permissions.canManageSettings && brandColors.length < 6 && (
                <button
                  type="button"
                  onClick={() => setBrandColors([...brandColors, { hex: '#000000', role: '' }])}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add color
                </button>
              )}
            </div>

            {/* Typography */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Heading Font
                </label>
                <input
                  type="text"
                  value={brandFont}
                  onChange={(e) => setBrandFont(e.target.value)}
                  disabled={!permissions.canManageSettings}
                  className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
                  placeholder="e.g. Inter, Poppins"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Body Font
                </label>
                <input
                  type="text"
                  value={brandBodyFont}
                  onChange={(e) => setBrandBodyFont(e.target.value)}
                  disabled={!permissions.canManageSettings}
                  className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
                  placeholder="e.g. Inter, Open Sans"
                />
              </div>
            </div>

            {/* Tone of Voice */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Tone of Voice
              </label>
              <select
                value={brandTone}
                onChange={(e) => setBrandTone(e.target.value)}
                disabled={!permissions.canManageSettings}
                className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                <option value="">Select tone...</option>
                <option value="formal">Formal & Professional</option>
                <option value="conversational">Conversational & Friendly</option>
                <option value="playful">Playful & Energetic</option>
                <option value="authoritative">Authoritative & Expert</option>
                <option value="minimal">Minimal & Direct</option>
              </select>
            </div>

            {/* Save */}
            {permissions.canManageSettings && (
              <Button
                onClick={handleSaveBrandGuidelines}
                disabled={isSavingBrand}
                className="bg-[#37bd7e] hover:bg-[#2da76c]"
              >
                {isSavingBrand ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Brand Guidelines'
                )}
              </Button>
            )}

            {/* AI Brand Prompt Preview */}
            {existingBrand.brand_prompt && (
              <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowBrandPrompt(!showBrandPrompt)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                >
                  {showBrandPrompt ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <Eye className="w-4 h-4" />
                  AI Brand Prompt Preview
                </button>
                {showBrandPrompt && (
                  <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">
                      This prompt is automatically injected into AI agents (ad remix, proposals, landing pages, emails) to enforce your brand.
                    </p>
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                      {existingBrand.brand_prompt}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Currency + Company Profile */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#37bd7e]" />
            Currency & Company Profile
          </h2>

          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-6">
            {/* Currency */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Organization Currency
              </label>
              <div className="flex items-center gap-3">
                <select
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value as CurrencyCode)}
                  disabled={!permissions.canManageSettings || isSavingProfile}
                  className="bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                >
                  {Object.values(CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.symbol} {c.code} — {c.name}
                    </option>
                  ))}
                </select>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Locale: <span className="font-mono">{CURRENCIES[currencyCode]?.locale || 'en-GB'}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This changes how money is displayed across your organization (no automatic conversion).
              </p>
            </div>

            {/* Company website */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Company Website
              </label>
              <input
                type="text"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                placeholder="https://example.com"
                disabled={!permissions.canManageSettings || isSavingProfile}
                className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
              />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleSaveOrgProfile}
                disabled={!permissions.canManageSettings || isSavingProfile}
                className="bg-[#37bd7e] hover:bg-[#2da76c]"
              >
                {isSavingProfile ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save Settings'
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* AI Usage Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#37bd7e]" />
            AI Usage
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <OrgAIUsage
              orgId={activeOrgId}
              orgName={activeOrg?.name}
              canManage={permissions.canManageSettings}
            />
          </div>
        </div>

        {/* Info Section */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Organization Information</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Your organization name is visible to all members and appears in various parts of the application.
                Only organization admins can modify these settings. For AI context and personalization, visit the AI Intelligence settings page.
              </p>
            </div>
          </div>
        </div>
      </div>
    </SettingsPageWrapper>
  );
}
