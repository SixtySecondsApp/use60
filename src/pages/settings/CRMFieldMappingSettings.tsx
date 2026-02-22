/**
 * CRM Field Mapping Settings
 *
 * Allows org admins to:
 * 1. Auto-detect HubSpot field names and map them to sixty fields
 * 2. Set write policies per field (auto / approval / suggest / disabled)
 * 3. Test the current mapping against live sample records
 */

import { useState, useEffect } from 'react';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  RefreshCw,
  Save,
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { FieldMappingTable, type FieldRow } from '@/components/settings/FieldMappingTable';
import { WritePolicyEditor } from '@/components/settings/WritePolicyEditor';
import {
  useCRMFieldMappings,
  useSaveCRMFieldMappings,
  useCRMWritePolicies,
  useSaveCRMWritePolicies,
  type CRMFieldMapping,
  type CRMWritePolicy,
  type DetectedField,
  type TestMappingResult,
} from '@/lib/hooks/useCRMFieldMapping';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { cn } from '@/lib/utils';

type CRMObject = 'contact' | 'deal' | 'company' | 'activity';
type CRMProvider = 'hubspot' | 'attio' | 'bullhorn';

const CRM_OBJECTS: Array<{ value: CRMObject; label: string }> = [
  { value: 'contact', label: 'Contact' },
  { value: 'deal', label: 'Deal' },
  { value: 'company', label: 'Company' },
];

// Map CRM object names to HubSpot API object type strings
const HUBSPOT_OBJECT_MAP: Record<CRMObject, string> = {
  contact: 'contacts',
  deal: 'deals',
  company: 'companies',
  activity: 'engagements',
};

export default function CRMFieldMappingSettings() {
  const orgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  const [selectedObject, setSelectedObject] = useState<CRMObject>('contact');
  const [fieldRows, setFieldRows] = useState<FieldRow[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestMappingResult[] | null>(null);

  const { data: savedMappings } = useCRMFieldMappings('hubspot', selectedObject);
  const { mutateAsync: saveMappings, isPending: saving } = useSaveCRMFieldMappings();

  // Populate rows from saved DB mappings when object changes
  useEffect(() => {
    if (savedMappings && savedMappings.length > 0) {
      setFieldRows(
        savedMappings.map((m) => ({
          crm_field_name: m.crm_field_name,
          crm_field_type: m.crm_field_type,
          confidence: m.confidence,
          sixty_field_name: m.sixty_field_name ?? null,
          is_excluded: m.is_excluded,
          is_confirmed: m.is_confirmed,
        }))
      );
    } else {
      setFieldRows([]);
    }
    setTestResults(null);
  }, [savedMappings, selectedObject]);

  // Auto-detect: call hubspot-admin detect_fields handler
  async function handleDetect() {
    if (!orgId) return;
    setDetecting(true);
    setTestResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('hubspot-admin', {
        body: {
          action: 'detect_fields',
          org_id: orgId,
          object_type: HUBSPOT_OBJECT_MAP[selectedObject],
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'detect_fields failed');

      const detected: DetectedField[] = data.fields ?? [];
      setFieldRows(
        detected.map((f) => ({
          crm_field_name: f.crm_field_name,
          crm_field_type: f.crm_field_type,
          crm_field_label: f.crm_field_label,
          confidence: f.confidence,
          sixty_field_name: f.sixty_field_name,
          is_excluded: false,
          is_confirmed: f.confidence >= 0.8,
        }))
      );
      toast.success(`Detected ${detected.length} fields from HubSpot`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Detection failed: ${message}`);
    } finally {
      setDetecting(false);
    }
  }

  // Save confirmed mappings to DB
  async function handleSave() {
    if (!orgId) return;
    const mappings: CRMFieldMapping[] = fieldRows.map((row) => ({
      org_id: orgId,
      crm_provider: 'hubspot',
      crm_object: selectedObject,
      crm_field_name: row.crm_field_name,
      crm_field_type: row.crm_field_type,
      sixty_field_name: row.sixty_field_name,
      confidence: row.confidence,
      is_confirmed: row.is_confirmed,
      is_excluded: row.is_excluded,
    }));
    await saveMappings(mappings);
  }

  // Test mapping against live sample records
  async function handleTestConnection() {
    if (!orgId || fieldRows.length === 0) return;
    setTesting(true);
    try {
      const mappedFields = fieldRows.filter((r) => !r.is_excluded && r.sixty_field_name);
      const { data, error } = await supabase.functions.invoke('hubspot-admin', {
        body: {
          action: 'test_mapping',
          org_id: orgId,
          object_type: HUBSPOT_OBJECT_MAP[selectedObject],
          mappings: mappedFields.map((r) => ({
            crm_field_name: r.crm_field_name,
            sixty_field_name: r.sixty_field_name,
          })),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'test_mapping failed');
      setTestResults(data.field_results ?? []);
      toast.success(
        `Test complete: ${data.pass_count} passed, ${data.fail_count} empty`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Test failed: ${message}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <SettingsPageWrapper
      title="CRM Field Mapping"
      description="Map CRM fields to sixty fields and configure write policies"
    >
      <div className="space-y-6">
        {/* Object Selector + Actions */}
        <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base">Field Mapping</CardTitle>
                <CardDescription>
                  Map HubSpot field names to their corresponding sixty fields. Auto-detect reads
                  live properties from HubSpot.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={selectedObject}
                  onValueChange={(v) => setSelectedObject(v as CRMObject)}
                >
                  <SelectTrigger className="h-9 w-[130px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRM_OBJECTS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDetect}
                  disabled={detecting || !isAdmin}
                >
                  {detecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span className="ml-1.5">{detecting ? 'Detecting...' : 'Auto-Detect'}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing || fieldRows.length === 0}
                >
                  {testing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FlaskConical className="w-4 h-4" />
                  )}
                  <span className="ml-1.5">{testing ? 'Testing...' : 'Test Connection'}</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || fieldRows.length === 0 || !isAdmin}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span className="ml-1.5">{saving ? 'Saving...' : 'Save Mappings'}</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <FieldMappingTable rows={fieldRows} onChange={setFieldRows} />
          </CardContent>
        </Card>

        {/* Test Results */}
        {testResults && testResults.length > 0 && (
          <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-blue-500" />
                Test Results
              </CardTitle>
              <CardDescription>
                {testResults.filter((r) => r.status === 'pass').length} of {testResults.length}{' '}
                fields returned data from sample records
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {testResults.map((result) => (
                  <div
                    key={result.crm_field_name}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-900/30"
                  >
                    <div className="flex items-center gap-3">
                      {result.status === 'pass' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : result.status === 'empty' ? (
                        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <div>
                        <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                          {result.crm_field_name}
                        </span>
                        <span className="text-gray-400 mx-1.5">→</span>
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {result.sixty_field_name}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.sample_values.length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[160px] truncate">
                          e.g. {String(result.sample_values[0])}
                        </span>
                      )}
                      <Badge
                        className={cn(
                          'text-xs border-0',
                          result.status === 'pass'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : result.status === 'empty'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        )}
                      >
                        {result.status === 'pass'
                          ? `${result.success_count}/${result.total_records_checked} records`
                          : result.status === 'empty'
                          ? 'No data'
                          : 'No records'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Write Policies */}
        <WritePolicyEditor crm_object={selectedObject} />

        {/* Info note */}
        <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 px-1">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Confidence scores: green &ge; 80%, yellow &ge; 50%, red &lt; 50%. Fields with no
            mapping will not be written to HubSpot. Excluded fields are always skipped.
          </span>
        </div>
      </div>
    </SettingsPageWrapper>
  );
}
