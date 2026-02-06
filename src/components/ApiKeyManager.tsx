import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Key, 
  Plus, 
  Copy, 
  Trash2, 
  Eye, 
  EyeOff,
  Calendar,
  Activity,
  Shield,
  Settings,
  AlertTriangle,
  CheckCircle,
  MoreVertical,
  Zap,
  Info,
  PlayCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { mockApiKeyService, initializeMockKeys } from '@/lib/mockApiKeys';
import { ApiTestSuite } from './ApiTestSuite';
import { format } from 'date-fns';

interface ApiKey {
  id: string;
  name: string;
  key_preview: string;
  full_key?: string;
  permissions: string[];
  rate_limit: number;
  usage_count: number;
  last_used: Date | null;
  created_at: Date;
  expires_at: Date | null;
  is_active: boolean;
}

interface CreateKeyForm {
  name: string;
  permissions: string[];
  rate_limit: number;
  expires_in_days: number | null;
}

const AVAILABLE_PERMISSIONS = [
  // Contacts
  { id: 'contacts:read', label: 'Read Contacts', description: 'View contact information' },
  { id: 'contacts:write', label: 'Write Contacts', description: 'Create and update contacts' },
  { id: 'contacts:delete', label: 'Delete Contacts', description: 'Remove contacts' },
  
  // Companies
  { id: 'companies:read', label: 'Read Companies', description: 'View company information' },
  { id: 'companies:write', label: 'Write Companies', description: 'Create and update companies' },
  { id: 'companies:delete', label: 'Delete Companies', description: 'Remove companies' },
  
  // Deals
  { id: 'deals:read', label: 'Read Deals', description: 'View deals and pipeline data' },
  { id: 'deals:write', label: 'Write Deals', description: 'Create and update deals' },
  { id: 'deals:delete', label: 'Delete Deals', description: 'Remove deals' },
  
  // Tasks
  { id: 'tasks:read', label: 'Read Tasks', description: 'View tasks and to-dos' },
  { id: 'tasks:write', label: 'Write Tasks', description: 'Create and update tasks' },
  { id: 'tasks:delete', label: 'Delete Tasks', description: 'Remove tasks' },
  
  // Meetings
  { id: 'meetings:read', label: 'Read Meetings', description: 'View meeting information' },
  { id: 'meetings:write', label: 'Write Meetings', description: 'Create and update meetings' },
  { id: 'meetings:delete', label: 'Delete Meetings', description: 'Remove meetings' },
  
  // Activities
  { id: 'activities:read', label: 'Read Activities', description: 'View activity logs and data' },
  { id: 'activities:write', label: 'Write Activities', description: 'Create and update activities' },
  { id: 'activities:delete', label: 'Delete Activities', description: 'Remove activities' },
  
  // Analytics & Other
  { id: 'analytics:read', label: 'Read Analytics', description: 'Access analytics and reports' }
];

const RATE_LIMIT_OPTIONS = [
  { value: 100, label: '100/hour - Light usage' },
  { value: 500, label: '500/hour - Moderate usage' },
  { value: 1000, label: '1000/hour - Heavy usage' },
  { value: 5000, label: '5000/hour - Enterprise' }
];

interface ApiKeyManagerProps {
  onKeySelected?: (key: string | null) => void;
}

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ onKeySelected }) => {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyData, setNewKeyData] = useState<{ key: string; name: string } | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [useMockMode, setUseMockMode] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  
  const [createForm, setCreateForm] = useState<CreateKeyForm>({
    name: '',
    permissions: ['deals:read'],
    rate_limit: 500,
    expires_in_days: 90
  });

  useEffect(() => {
    // Initialize mock keys on first load
    initializeMockKeys();
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Type assertion for api_keys table data (table may not be in database.types.ts)
      type ApiKeyRow = {
        id: string;
        name: string;
        key_preview: string;
        permissions?: string[] | null;
        rate_limit?: number | null;
        usage_count?: number | null;
        last_used?: string | null;
        created_at: string;
        expires_at?: string | null;
        is_active?: boolean | null;
      };

      const formattedKeys: ApiKey[] = ((data as ApiKeyRow[]) || []).map(key => ({
        id: key.id,
        name: key.name,
        key_preview: key.key_preview,
        permissions: key.permissions || [],
        rate_limit: key.rate_limit || 500,
        usage_count: key.usage_count || 0,
        last_used: key.last_used ? new Date(key.last_used) : null,
        created_at: new Date(key.created_at),
        expires_at: key.expires_at ? new Date(key.expires_at) : null,
        is_active: key.is_active ?? true
      }));

      setApiKeys(formattedKeys);
      
      // Auto-select first active API key if onKeySelected is provided and full key is available
      if (onKeySelected && formattedKeys.length > 0) {
        const firstActiveKey = formattedKeys.find(key => 
          key.is_active && 
          (!key.expires_at || key.expires_at > new Date()) &&
          key.full_key // Only select if full key is available
        );
        if (firstActiveKey && firstActiveKey.full_key) {
          onKeySelected(firstActiveKey.full_key);
        }
      }
    } catch (error: any) {
      // Fall back to mock mode
      if (error?.message?.includes('api_keys') || error?.code === '42P01') {
        setUseMockMode(true);
        
        // Load mock keys
        const mockKeys = mockApiKeyService.getAllKeys();
        const formattedMockKeys: ApiKey[] = mockKeys.map(key => ({
          id: key.id,
          name: key.name,
          key_preview: key.key_preview,
          full_key: key.full_key,
          permissions: key.permissions,
          rate_limit: key.rate_limit,
          usage_count: key.usage_count,
          last_used: key.last_used,
          created_at: key.created_at,
          expires_at: key.expires_at,
          is_active: key.is_active
        }));
        
        setApiKeys(formattedMockKeys);
        
        // Auto-select first mock key for testing
        if (onKeySelected && formattedMockKeys.length > 0) {
          const firstMockKey = formattedMockKeys.find(key => key.is_active && key.full_key);
          if (firstMockKey) {
            onKeySelected(firstMockKey.full_key!);
          }
        }
        
        toast.info('Using local mock API keys for testing');
      } else {
        toast.error('Failed to load API keys');
      }
    } finally {
      setLoading(false);
    }
  };

  const createApiKey = async () => {
    if (!user) {
      toast.error('You must be logged in to create API keys');
      return;
    }

    try {
      // Get the current session to ensure we have a valid auth token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Authentication session expired. Please log in again.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-api-key', {
        body: {
          name: createForm.name,
          permissions: createForm.permissions,
          rate_limit: createForm.rate_limit,
          expires_in_days: createForm.expires_in_days
        }
      });

      if (error) {
        throw error;
      }

      if (!data || !data.api_key) {
        throw new Error('Invalid response from API key creation');
      }

      setNewKeyData({ key: data.api_key, name: createForm.name });
      if (onKeySelected) {
        onKeySelected(data.api_key);
      }
      await fetchApiKeys();
      
      setCreateForm({
        name: '',
        permissions: ['deals:read'],
        rate_limit: 500,
        expires_in_days: 90
      });

      toast.success('API key created successfully');
    } catch (error: any) {
      // Fall back to mock mode if database isn't set up
      if (error.message?.includes('500') || error.message?.includes('502') || error.message?.includes('api_keys')) {
        setUseMockMode(true);
        
        try {
          const mockKey = mockApiKeyService.createKey(
            createForm.name,
            createForm.permissions,
            createForm.rate_limit,
            createForm.expires_in_days
          );
          
          setNewKeyData({ key: mockKey.full_key, name: mockKey.name });
          if (onKeySelected) {
            onKeySelected(mockKey.full_key);
          }
          
          // Refresh the list
          const updatedMockKeys = mockApiKeyService.getAllKeys();
          setApiKeys(updatedMockKeys.map(key => ({
            id: key.id,
            name: key.name,
            key_preview: key.key_preview,
            full_key: key.full_key,
            permissions: key.permissions,
            rate_limit: key.rate_limit,
            usage_count: key.usage_count,
            last_used: key.last_used,
            created_at: key.created_at,
            expires_at: key.expires_at,
            is_active: key.is_active
          })));
          
          setCreateForm({
            name: '',
            permissions: ['deals:read'],
            rate_limit: 500,
            expires_in_days: 90
          });
          
          toast.success('Mock API key created for testing');
          return;
        } catch (mockError) {
          toast.error('Failed to create mock API key');
        }
      }
      
      // Original error handling
      // Specific error handling
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        toast.error('Authentication error. Please log in again.');
        // Optionally trigger re-authentication
        window.location.href = '/auth/login';
      } else if (error.message?.includes('500') || error.message?.includes('502')) {
        toast.error('Server error. The API service may be unavailable. Please try again later.');
      } else {
        toast.error('Failed to create API key: ' + (error.message || 'Unknown error'));
      }
    }
  };

  const revokeApiKey = async (keyId: string) => {
    try {
      const { error } = await (supabase
        .from('api_keys')
        .update({ is_active: false }) as any)
        .eq('id', keyId)
        .eq('user_id', user?.id);

      if (error) throw error;

      await fetchApiKeys();
      toast.success('API key revoked');
    } catch (error) {
      toast.error('Failed to revoke API key');
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard');
  };

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
      return newSet;
    });
  };

  const getUsageColor = (usage: number, limit: number) => {
    const percentage = (usage / limit) * 100;
    if (percentage >= 90) return 'text-red-400';
    if (percentage >= 70) return 'text-yellow-400';
    return 'text-emerald-400';
  };

  const getStatusBadge = (key: ApiKey) => {
    if (!key.is_active) {
      return <Badge variant="destructive">Revoked</Badge>;
    }
    
    if (key.expires_at && key.expires_at < new Date()) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    
    return <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mock Mode Indicator */}
      {useMockMode && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <Info className="h-4 w-4 inline mr-2 text-amber-400" />
          <span className="text-sm text-amber-400">Using mock API keys for testing. Database table setup required for production use.</span>
        </div>
      )}

      {/* API Testing Notice */}
      {onKeySelected && (
        <div className="mb-4 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <Zap className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-purple-300 mb-1">API Testing Mode</h4>
              <p className="text-sm text-purple-200/90 mb-2">
                For security reasons, existing API keys don't store the full key value. To use an existing key for testing:
              </p>
              <ul className="text-sm text-purple-200/90 space-y-1">
                <li>• Create a new API key (full key will be available for testing)</li>
                <li>• Or click "Use for Testing" on any key that shows it's available</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys Management
          </h3>
          <p className="text-sm text-gray-400 mt-1">Manage your API keys for secure access to the CRM</p>
        </div>
        
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Key
        </Button>
      </div>

      {/* API Keys List */}
      <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900/80 dark:to-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-xl overflow-hidden">
        {apiKeys.length > 0 ? (
          <div className="divide-y divide-gray-700/40">
            {apiKeys.map((apiKey, index) => (
              <motion.div
                key={apiKey.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-6 hover:bg-gray-800/40 transition-all duration-200 border-l-4 border-l-transparent hover:border-l-blue-500/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-gray-100">{apiKey.name}</h4>
                      {getStatusBadge(apiKey)}
                    </div>
                    
                    {/* Key Preview */}
                    <div className="flex items-center gap-2 mb-3">
                      <code className="text-sm font-mono bg-gray-900/70 px-3 py-2 rounded-lg border border-gray-600/50 text-gray-100 shadow-sm">
                        {visibleKeys.has(apiKey.id) && apiKey.full_key ? apiKey.full_key : apiKey.key_preview}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleKeyVisibility(apiKey.id)}
                        className="hover:bg-gray-700/70 text-gray-300 hover:text-gray-100"
                        title={visibleKeys.has(apiKey.id) ? "Hide API Key" : "Show API Key"}
                      >
                        {visibleKeys.has(apiKey.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyKey(visibleKeys.has(apiKey.id) && apiKey.full_key ? apiKey.full_key : apiKey.key_preview)}
                        className="hover:bg-gray-700/70 text-gray-300 hover:text-gray-100"
                        title="Copy API Key"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {/* Testing Buttons */}
                      <div className="flex items-center gap-2">
                        {/* Individual Test Button */}
                        {apiKey.full_key ? (
                          <Button
                            size="sm"
                            onClick={() => setTestingKeyId(apiKey.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                            title="Run API Test Suite for this key"
                          >
                            <PlayCircle className="h-4 w-4 mr-1" />
                            Test Key
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled
                            variant="ghost"
                            className="text-gray-500 cursor-not-allowed"
                            title="Testing not available - create a new key to enable testing"
                          >
                            <PlayCircle className="h-4 w-4 mr-1" />
                            Test Unavailable
                          </Button>
                        )}

                        {/* Use for Testing Button (when onKeySelected is provided) */}
                        {onKeySelected && (
                          apiKey.full_key ? (
                            <Button
                              size="sm"
                              onClick={() => onKeySelected(apiKey.full_key!)}
                              className="bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                              title="Use this API Key for Testing Page"
                            >
                              <Zap className="h-4 w-4 mr-1" />
                              Use for Testing
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled
                              variant="ghost"
                              className="text-gray-500 cursor-not-allowed"
                              title="Full API key not available - create a new key for testing"
                            >
                              <Zap className="h-4 w-4 mr-1" />
                              Not Available
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                    
                    {/* Permissions */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {apiKey.permissions.map(permission => (
                        <Badge key={permission} variant="outline" className="text-xs border-gray-600 text-gray-200 bg-gray-800/30">
                          {permission}
                        </Badge>
                      ))}
                    </div>
                    
                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-gray-300">
                        <Activity className="h-4 w-4 text-blue-400" />
                        <span className={getUsageColor(apiKey.usage_count, apiKey.rate_limit)}>
                          {apiKey.usage_count}/{apiKey.rate_limit}
                        </span>
                        <span className="text-gray-400">requests/hour</span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-gray-300">
                        <Calendar className="h-4 w-4 text-green-400" />
                        <span className="text-gray-400">
                          {apiKey.last_used 
                            ? `Last used ${format(apiKey.last_used, 'MMM d, yyyy')}`
                            : 'Never used'
                          }
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-gray-400">
                        <Shield className="h-4 w-4" />
                        <span>Created {format(apiKey.created_at, 'MMM d, yyyy')}</span>
                      </div>
                      
                      {apiKey.expires_at && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Expires {format(apiKey.expires_at, 'MMM d, yyyy')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="hover:bg-gray-700/50">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-gray-900/90 backdrop-blur-xl border-gray-700/50">
                      <DropdownMenuItem
                        onClick={() => revokeApiKey(apiKey.id)}
                        className="text-red-400 hover:bg-red-500/10"
                        disabled={!apiKey.is_active}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Revoke Key
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Key className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No API Keys</h3>
            <p className="text-gray-500 mb-4">Create your first API key to start using the CRM API</p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create API Key
            </Button>
          </div>
        )}
      </div>

      {/* Create Key Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-gray-900/95 backdrop-blur-xl border-gray-700/50 text-gray-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Create New API Key
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Generate a new API key with specific permissions and rate limits.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Key Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Key Name</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g., Mobile App Key"
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
              />
            </div>
            
            {/* Permissions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">
                  Permissions 
                  <span className="text-xs text-gray-500 ml-2">
                    ({createForm.permissions.length}/{AVAILABLE_PERMISSIONS.length} selected)
                  </span>
                </label>
                <div className="flex gap-2">
                  <select
                    className="text-xs bg-gray-800/50 border border-gray-700/50 rounded px-2 py-1 text-gray-300"
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'all') {
                        setCreateForm({
                          ...createForm,
                          permissions: AVAILABLE_PERMISSIONS.map(p => p.id)
                        });
                      } else if (value === 'read-only') {
                        setCreateForm({
                          ...createForm,
                          permissions: AVAILABLE_PERMISSIONS.filter(p => p.id.includes(':read')).map(p => p.id)
                        });
                      } else if (value === 'full-access') {
                        setCreateForm({
                          ...createForm,
                          permissions: AVAILABLE_PERMISSIONS.filter(p => !p.id.includes(':delete')).map(p => p.id)
                        });
                      } else if (value === 'clear') {
                        setCreateForm({
                          ...createForm,
                          permissions: []
                        });
                      }
                      e.target.value = 'presets';
                    }}
                  >
                    <option value="presets">Quick Presets</option>
                    <option value="all">All Permissions</option>
                    <option value="read-only">Read Only</option>
                    <option value="full-access">Read & Write</option>
                    <option value="clear">Clear All</option>
                  </select>
                </div>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto bg-gray-800/30 p-3 rounded-lg border border-gray-700/50">
                {/* Group permissions by module */}
                {['contacts', 'companies', 'deals', 'tasks', 'meetings', 'activities', 'analytics'].map(module => {
                  const modulePerms = AVAILABLE_PERMISSIONS.filter(p => p.id.startsWith(module));
                  if (modulePerms.length === 0) return null;
                  
                  return (
                    <div key={module} className="space-y-1">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        {module === 'analytics' ? 'Analytics & Reports' : module}
                      </div>
                      <div className="space-y-1 pl-2">
                        {modulePerms.map(permission => (
                          <label key={permission.id} className="flex items-start gap-3 text-sm cursor-pointer hover:bg-gray-700/20 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={createForm.permissions.includes(permission.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCreateForm({
                                    ...createForm,
                                    permissions: [...createForm.permissions, permission.id]
                                  });
                                } else {
                                  setCreateForm({
                                    ...createForm,
                                    permissions: createForm.permissions.filter(p => p !== permission.id)
                                  });
                                }
                              }}
                              className="mt-0.5 rounded border-gray-600 bg-gray-800/50 text-blue-600 focus:ring-blue-500/50"
                            />
                            <div className="flex-1">
                              <div className="text-gray-200">{permission.label.replace(`${module.charAt(0).toUpperCase() + module.slice(1)} `, '')}</div>
                              <div className="text-gray-500 text-xs">{permission.description}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Rate Limit */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Rate Limit</label>
              <select
                value={createForm.rate_limit}
                onChange={(e) => setCreateForm({ ...createForm, rate_limit: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
              >
                {RATE_LIMIT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Expiration */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Expires In</label>
              <select
                value={createForm.expires_in_days || ''}
                onChange={(e) => setCreateForm({ ...createForm, expires_in_days: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
              >
                <option value="">Never expires</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
              </select>
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setCreateDialogOpen(false)}
                variant="outline"
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800/50"
              >
                Cancel
              </Button>
              <Button
                onClick={createApiKey}
                disabled={!createForm.name || createForm.permissions.length === 0}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
              >
                Create Key
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Individual API Key Testing Dialog */}
      <Dialog open={!!testingKeyId} onOpenChange={() => setTestingKeyId(null)}>
        <DialogContent className="bg-gray-900/95 backdrop-blur-xl border-gray-700/50 text-gray-100 max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-400">
              <PlayCircle className="h-5 w-5" />
              API Key Testing Suite
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {testingKeyId && (
                <>Testing API key: <span className="font-mono text-sm">{apiKeys.find(k => k.id === testingKeyId)?.name}</span></>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="overflow-auto max-h-[calc(90vh-120px)]">
            {testingKeyId && (
              <ApiTestSuite 
                apiKey={apiKeys.find(k => k.id === testingKeyId)?.full_key || null}
                onClose={() => setTestingKeyId(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Key Generated Dialog */}
      <Dialog open={!!newKeyData} onOpenChange={() => setNewKeyData(null)}>
        <DialogContent className="bg-gray-900/95 backdrop-blur-xl border-gray-700/50 text-gray-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <CheckCircle className="h-5 w-5" />
              API Key Created Successfully
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Your new API key has been generated. Make sure to copy it now as you won't be able to see it again.
            </DialogDescription>
          </DialogHeader>
          
          {newKeyData && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">API Key</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg text-gray-100 font-mono text-sm break-all">
                    {newKeyData.key}
                  </code>
                  <Button
                    onClick={() => copyKey(newKeyData.key)}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2 text-amber-400 font-medium mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  Important
                </div>
                <p className="text-sm text-amber-200">
                  This is the only time you'll be able to see this key. Make sure to copy and store it securely.
                </p>
              </div>
              
              <Button
                onClick={() => setNewKeyData(null)}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white"
              >
                I've Copied the Key
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};