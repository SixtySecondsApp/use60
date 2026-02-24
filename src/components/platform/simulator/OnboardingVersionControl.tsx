/**
 * OnboardingVersionControl
 *
 * Admin control panel for setting the live onboarding version.
 * Allows toggling between V1 (legacy) and V2 (skills-based) onboarding flows.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOnboardingVersion, type OnboardingVersion } from '@/lib/hooks/useOnboardingVersion';
import { Settings, AlertTriangle, Check, Loader2 } from 'lucide-react';

export function OnboardingVersionControl() {
  const { version, loading, error, updateVersion } = useOnboardingVersion();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirm, setShowConfirm] = useState<OnboardingVersion | null>(null);

  const handleVersionChange = async (newVersion: OnboardingVersion) => {
    if (newVersion === version) return;
    setShowConfirm(newVersion);
  };

  const confirmVersionChange = async () => {
    if (!showConfirm) return;

    setIsUpdating(true);
    try {
      await updateVersion(showConfirm);
      setShowConfirm(null);
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/30 bg-amber-50/5">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <Settings className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Live Onboarding Version</CardTitle>
            <CardDescription>
              Control which onboarding flow new users experience
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              version === 'v3'
                ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                : version === 'v2'
                ? 'bg-violet-500/10 text-violet-500 border-violet-500/30'
                : 'bg-gray-500/10 text-gray-500 border-gray-500/30'
            }
          >
            Live: {version.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-500 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Error loading setting: {error.message}</span>
          </div>
        )}

        {/* Version Options */}
        <div className="grid grid-cols-3 gap-4">
          {/* V1 Option */}
          <button
            onClick={() => handleVersionChange('v1')}
            disabled={isUpdating}
            className={`relative p-4 rounded-xl border-2 transition-all text-left ${
              version === 'v1'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {version === 'v1' && (
              <div className="absolute top-3 right-3">
                <Check className="w-5 h-5 text-emerald-500" />
              </div>
            )}
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              V1 - Legacy
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Traditional onboarding flow with team setup and Fathom connection
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs">
                Team Invite
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Fathom
              </Badge>
            </div>
          </button>

          {/* V2 Option */}
          <button
            onClick={() => handleVersionChange('v2')}
            disabled={isUpdating}
            className={`relative p-4 rounded-xl border-2 transition-all text-left ${
              version === 'v2'
                ? 'border-violet-500 bg-violet-500/10'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {version === 'v2' && (
              <div className="absolute top-3 right-3">
                <Check className="w-5 h-5 text-violet-500" />
              </div>
            )}
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              V2 - Skills
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              AI-powered onboarding with company analysis and skill configuration
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs">
                AI Analysis
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Skills
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Enrichment
              </Badge>
            </div>
          </button>

          {/* V3 Option */}
          <button
            onClick={() => handleVersionChange('v3')}
            disabled={isUpdating}
            className={`relative p-4 rounded-xl border-2 transition-all text-left ${
              version === 'v3'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {version === 'v3' && (
              <div className="absolute top-3 right-3">
                <Check className="w-5 h-5 text-blue-500" />
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                V3 - Agent Teams
              </h3>
              <Badge className="text-xs bg-blue-500/20 text-blue-500 border-blue-500/30">
                Latest
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enhanced enrichment with parallel AI agents for 89% data completeness
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs">
                Agent Teams
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Multi-Source
              </Badge>
              <Badge variant="secondary" className="text-xs">
                89% Complete
              </Badge>
            </div>
          </button>
        </div>

        {/* Confirmation Dialog */}
        {showConfirm && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Switch to {showConfirm.toUpperCase()} Onboarding?
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  This will immediately affect all new users starting onboarding.
                  Existing onboarding sessions will not be interrupted.
                </p>
                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    onClick={confirmVersionChange}
                    disabled={isUpdating}
                    className={
                      showConfirm === 'v3'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : showConfirm === 'v2'
                        ? 'bg-violet-600 hover:bg-violet-700'
                        : 'bg-gray-600 hover:bg-gray-700'
                    }
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>Confirm Switch</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowConfirm(null)}
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-800">
          <p>
            <strong>Note:</strong> Use the simulator above to preview both versions
            before making changes to the live flow.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
