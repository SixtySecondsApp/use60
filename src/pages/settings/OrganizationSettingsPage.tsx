import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useState, useEffect } from 'react';
import { Building2, Check, X, Loader2, AlertCircle, ChevronDown, Brain, FileText } from 'lucide-react';
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
  const [companyWebsite, setCompanyWebsite] = useState(activeOrg?.company_website || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Update org name when activeOrg changes
  useEffect(() => {
    setEditedOrgName(activeOrg?.name || '');
  }, [activeOrg]);

  // Update org profile settings when activeOrg changes
  useEffect(() => {
    setCurrencyCode(((activeOrg?.currency_code as CurrencyCode | undefined) || 'GBP'));
    setCompanyWebsite(activeOrg?.company_website || '');
  }, [activeOrg?.currency_code, activeOrg?.company_website]);

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
