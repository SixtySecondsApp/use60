import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Code2, 
  Send, 
  History, 
  Key, 
  BookOpen,
  Play,
  Copy,
  Download,
  Settings,
  Zap,
  Database,
  Globe,
  Terminal,
  TestTube
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ApiKeyManager } from '@/components/ApiKeyManager';
import { ApiTestSuite } from '@/components/ApiTestSuite';
import { CodeEditor } from '@/components/ui/code-editor';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';

interface ApiRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: Date;
  status?: number;
  response?: string;
}

interface ApiTemplate {
  id: string;
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  headers: Record<string, string>;
  body?: string;
  category: string;
}

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  color?: 'green' | 'blue' | 'purple' | 'orange';
}> = ({ title, value, icon, color = 'green' }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.02, y: -2 }}
    className="relative overflow-hidden bg-white dark:bg-gradient-to-br dark:from-gray-900/80 dark:to-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200 dark:border-gray-800/50 shadow-lg hover:shadow-xl hover:border-gray-300 dark:hover:border-gray-700/60 transition-all duration-300 group"
  >
    {/* Background decoration */}
    <div className={cn(
      "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500",
      color === 'green' && "from-emerald-500/5 to-transparent",
      color === 'blue' && "from-blue-500/5 to-transparent",
      color === 'purple' && "from-purple-500/5 to-transparent",
      color === 'orange' && "from-orange-500/5 to-transparent"
    )} />

    <div className="relative flex items-start justify-between">
      <div className="flex flex-col gap-1">
        <div className="text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{title}</div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      </div>
      <div className="text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors">
        {icon}
      </div>
    </div>
  </motion.div>
);

// Available entities and their endpoints
const API_ENTITIES = [
  { value: 'contacts', label: 'Contacts', icon: '👥' },
  { value: 'companies', label: 'Companies', icon: '🏢' },
  { value: 'deals', label: 'Deals', icon: '💰' },
  { value: 'tasks', label: 'Tasks', icon: '✅' },
  { value: 'meetings', label: 'Meetings', icon: '📅' },
  { value: 'activities', label: 'Activities', icon: '📊' },
] as const;

// CRUD operations available for each entity
const API_OPERATIONS = [
  { method: 'GET', label: 'List All', path: '', description: 'Get all records with pagination' },
  { method: 'GET', label: 'Get Single', path: '/{id}', description: 'Get a single record by ID' },
  { method: 'POST', label: 'Create', path: '', description: 'Create a new record' },
  { method: 'PUT', label: 'Update', path: '/{id}', description: 'Update an existing record' },
  { method: 'DELETE', label: 'Delete', path: '/{id}', description: 'Delete a record' },
] as const;

const ApiTesting: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'request' | 'keys' | 'history' | 'templates' | 'test-suite'>('request');
  const [selectedEntity, setSelectedEntity] = useState<string>('contacts');
  const [selectedOperation, setSelectedOperation] = useState<typeof API_OPERATIONS[0]>(API_OPERATIONS[0]);
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('GET');
  const [endpoint, setEndpoint] = useState('/api/v1/contacts');
  const [recordId, setRecordId] = useState('');
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState('{\n  \n}');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<ApiRequest[]>([]);
  const [currentApiKey, setCurrentApiKey] = useState<string | null>(null);
  const [templates] = useState<ApiTemplate[]>([
    // Contacts Templates
    { id: '1', name: 'List All Contacts', description: 'Get all contacts with pagination', method: 'GET', endpoint: '/api/v1/contacts', headers: { 'Content-Type': 'application/json' }, category: 'Contacts' },
    { id: '2', name: 'Create Contact', description: 'Add a new contact', method: 'POST', endpoint: '/api/v1/contacts', headers: { 'Content-Type': 'application/json' }, body: '{\n  "first_name": "John",\n  "last_name": "Doe",\n  "email": "john@example.com"\n}', category: 'Contacts' },
    { id: '3', name: 'Update Contact', description: 'Update existing contact', method: 'PUT', endpoint: '/api/v1/contacts/{id}', headers: { 'Content-Type': 'application/json' }, body: '{\n  "phone": "+1234567890"\n}', category: 'Contacts' },
    
    // Companies Templates
    { id: '4', name: 'List All Companies', description: 'Get all companies', method: 'GET', endpoint: '/api/v1/companies', headers: { 'Content-Type': 'application/json' }, category: 'Companies' },
    { id: '5', name: 'Create Company', description: 'Add a new company', method: 'POST', endpoint: '/api/v1/companies', headers: { 'Content-Type': 'application/json' }, body: '{\n  "name": "Acme Corp",\n  "domain": "acme.com",\n  "industry": "Technology"\n}', category: 'Companies' },
    { id: '6', name: 'Delete Company', description: 'Remove a company', method: 'DELETE', endpoint: '/api/v1/companies/{id}', headers: { 'Content-Type': 'application/json' }, category: 'Companies' },
    
    // Deals Templates  
    { id: '7', name: 'List All Deals', description: 'Get all deals in pipeline', method: 'GET', endpoint: '/api/v1/deals', headers: { 'Content-Type': 'application/json' }, category: 'Deals' },
    { id: '8', name: 'Create Deal', description: 'Create new sales opportunity', method: 'POST', endpoint: '/api/v1/deals', headers: { 'Content-Type': 'application/json' }, body: '{\n  "name": "Enterprise Deal",\n  "value": 50000,\n  "company": "Acme Corp",\n  "stage_id": "qualification"\n}', category: 'Deals' },
    { id: '9', name: 'Update Deal Stage', description: 'Move deal to next stage', method: 'PUT', endpoint: '/api/v1/deals/{id}', headers: { 'Content-Type': 'application/json' }, body: '{\n  "stage_id": "negotiation"\n}', category: 'Deals' },
    
    // Tasks Templates
    { id: '10', name: 'List All Tasks', description: 'Get all tasks', method: 'GET', endpoint: '/api/v1/tasks', headers: { 'Content-Type': 'application/json' }, category: 'Tasks' },
    { id: '11', name: 'Create Task', description: 'Add a new task', method: 'POST', endpoint: '/api/v1/tasks', headers: { 'Content-Type': 'application/json' }, body: '{\n  "title": "Follow up call",\n  "due_date": "2024-01-20",\n  "priority": "high"\n}', category: 'Tasks' },
    { id: '12', name: 'Complete Task', description: 'Mark task as done', method: 'PUT', endpoint: '/api/v1/tasks/{id}', headers: { 'Content-Type': 'application/json' }, body: '{\n  "status": "completed",\n  "completed": true\n}', category: 'Tasks' },
    
    // Meetings Templates
    { id: '13', name: 'List All Meetings', description: 'Get all meetings', method: 'GET', endpoint: '/api/v1/meetings', headers: { 'Content-Type': 'application/json' }, category: 'Meetings' },
    { id: '14', name: 'Create Meeting', description: 'Schedule a new meeting', method: 'POST', endpoint: '/api/v1/meetings', headers: { 'Content-Type': 'application/json' }, body: '{\n  "title": "Sales Demo",\n  "meeting_start": "2024-01-15T14:00:00Z",\n  "duration_minutes": 30\n}', category: 'Meetings' },
    { id: '15', name: 'Get Meeting Details', description: 'Get single meeting info', method: 'GET', endpoint: '/api/v1/meetings/{id}', headers: { 'Content-Type': 'application/json' }, category: 'Meetings' },
    
    // Activities Templates
    { id: '16', name: 'List Activities', description: 'Get all sales activities', method: 'GET', endpoint: '/api/v1/activities', headers: { 'Content-Type': 'application/json' }, category: 'Activities' },
    { id: '17', name: 'Log Activity', description: 'Record a sales activity', method: 'POST', endpoint: '/api/v1/activities', headers: { 'Content-Type': 'application/json' }, body: '{\n  "type": "outbound",\n  "client_name": "Acme Corp",\n  "details": "Initial outreach"\n}', category: 'Activities' },
    { id: '18', name: 'Delete Activity', description: 'Remove an activity', method: 'DELETE', endpoint: '/api/v1/activities/{id}', headers: { 'Content-Type': 'application/json' }, category: 'Activities' }
  ]);

  const [stats, setStats] = useState({
    totalRequests: 0,
    successRate: 0,
    avgResponseTime: 0,
    activeKeys: 0
  });

  useEffect(() => {
    fetchRequestHistory();
    
    // Check for stored API key from localStorage
    const storedApiKey = localStorage.getItem('selectedApiKey') || sessionStorage.getItem('currentApiKey');
    if (storedApiKey && !currentApiKey) {
      // Loading stored API key
      setCurrentApiKey(storedApiKey);
    }
  }, []);

  // Listen for API key selection events
  useEffect(() => {
    const handleApiKeySelected = (event: any) => {
      if (event.detail?.apiKey) {
        // API key selected via event
        setCurrentApiKey(event.detail.apiKey);
      }
    };

    window.addEventListener('apiKeySelected', handleApiKeySelected);
    return () => window.removeEventListener('apiKeySelected', handleApiKeySelected);
  }, []);

  const fetchRequestHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('api_requests')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const formattedRequests: ApiRequest[] = (data || []).map(req => ({
        id: req.id,
        method: req.method as any,
        endpoint: req.endpoint,
        headers: req.headers || {},
        body: req.body,
        timestamp: new Date(req.created_at),
        status: req.status_code,
        response: req.response_body
      }));

      setRequests(formattedRequests);

      // Calculate stats
      const successful = formattedRequests.filter(r => r.status && r.status < 400).length;
      setStats({
        totalRequests: formattedRequests.length,
        successRate: formattedRequests.length > 0 ? Math.round((successful / formattedRequests.length) * 100) : 0,
        avgResponseTime: 245, // Mock value
        activeKeys: 2 // Mock value
      });
    } catch (error: any) {
      // Silently handle missing table error - it's not critical for functionality
      if (!error?.message?.includes('api_requests')) {
      }
    }
  };

  // Update endpoint when entity or operation changes
  useEffect(() => {
    const baseUrl = `/api/v1/${selectedEntity}`;
    const fullEndpoint = selectedOperation.path.includes('{id}') && recordId
      ? `${baseUrl}/${recordId}`
      : baseUrl;
    setEndpoint(fullEndpoint);
    setMethod(selectedOperation.method as any);
    
    // Update body templates based on entity and operation
    if (selectedOperation.method === 'POST' || selectedOperation.method === 'PUT') {
      setBody(getEntityTemplate(selectedEntity, selectedOperation.method));
    } else {
      setBody('');
    }
  }, [selectedEntity, selectedOperation, recordId]);

  // Get sample body template for each entity
  const getEntityTemplate = (entity: string, method: string): string => {
    const templates: Record<string, any> = {
      contacts: {
        POST: {
          first_name: "John",
          last_name: "Doe",
          email: "john.doe@example.com",
          phone: "+1234567890",
          company_id: null,
          title: "Sales Manager"
        },
        PUT: {
          first_name: "John",
          last_name: "Doe Updated"
        }
      },
      companies: {
        POST: {
          name: "Acme Corp",
          domain: "acme.com",
          industry: "Technology",
          size: "medium",
          website: "https://acme.com"
        },
        PUT: {
          name: "Acme Corp Updated",
          size: "large"
        }
      },
      deals: {
        POST: {
          name: "Enterprise Deal",
          company: "Acme Corp",
          contact_name: "John Doe",
          contact_email: "john@acme.com",
          value: 50000,
          stage_id: "qualification",
          expected_close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        },
        PUT: {
          value: 75000,
          stage_id: "negotiation"
        }
      },
      tasks: {
        POST: {
          title: "Follow up with client",
          description: "Send proposal and schedule demo",
          due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          priority: "high",
          status: "pending",
          task_type: "follow_up"
        },
        PUT: {
          status: "completed",
          completed: true
        }
      },
      meetings: {
        POST: {
          title: "Sales Demo",
          meeting_start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          duration_minutes: 30,
          summary: "Product demonstration for potential client",
          owner_email: user?.email || "sales@example.com"
        },
        PUT: {
          summary: "Updated meeting summary",
          duration_minutes: 45
        }
      },
      activities: {
        POST: {
          type: "outbound",
          client_name: "Acme Corp",
          sales_rep: user?.email || "sales@example.com",
          details: "Initial outreach email sent",
          date: new Date().toISOString()
        },
        PUT: {
          details: "Follow-up completed",
          status: "completed"
        }
      }
    };

    return JSON.stringify(templates[entity]?.[method] || {}, null, 2);
  };

  const sendRequest = async () => {
    setLoading(true);
    try {
      let parsedHeaders = {};
      try {
        parsedHeaders = JSON.parse(headers);
      } catch {
        throw new Error('Invalid JSON in headers');
      }

      // Mock API call for now - replace with actual Edge Function call
      const proxyBody = JSON.stringify({
        action: 'proxy',
        method,
        ...(method !== 'GET' && body ? JSON.parse(body) : {}),
      });
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-services-router`, {
        method: 'POST',
        headers: {
          ...parsedHeaders,
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: proxyBody
      });

      const responseText = await response.text();
      let formattedResponse = responseText;
      
      try {
        const jsonResponse = JSON.parse(responseText);
        formattedResponse = JSON.stringify(jsonResponse, null, 2);
      } catch {
        // Response is not JSON, use as-is
      }

      setResponse(formattedResponse);

      // Save request to history
      const newRequest: ApiRequest = {
        id: Date.now().toString(),
        method,
        endpoint,
        headers: parsedHeaders,
        body: method !== 'GET' ? body : undefined,
        timestamp: new Date(),
        status: response.status,
        response: formattedResponse
      };

      setRequests(prev => [newRequest, ...prev]);
      
      toast.success('Request completed successfully');
    } catch (error: any) {
      const errorResponse = {
        error: error.message,
        status: 'failed',
        timestamp: new Date().toISOString()
      };
      
      setResponse(JSON.stringify(errorResponse, null, 2));
      toast.error('Request failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = (template: ApiTemplate) => {
    setMethod(template.method);
    setEndpoint(template.endpoint);
    setHeaders(JSON.stringify(template.headers, null, 2));
    if (template.body) {
      setBody(template.body);
    }
    setActiveTab('request');
    toast.success(`Loaded template: ${template.name}`);
  };

  const copyResponse = () => {
    navigator.clipboard.writeText(response);
    toast.success('Response copied to clipboard');
  };

  const downloadResponse = () => {
    const blob = new Blob([response], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-response-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Response downloaded');
  };

  const tabs = [
    { id: 'request', label: 'Request Builder', icon: Code2 },
    { id: 'keys', label: 'API Keys', icon: Key },
    { id: 'test-suite', label: 'Test Suite', icon: TestTube },
    { id: 'history', label: 'History', icon: History },
    { id: 'templates', label: 'Templates', icon: BookOpen }
  ];

  return (
    <div className="p-6 space-y-6 min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-500/20 dark:to-blue-600/10 backdrop-blur-sm rounded-xl border border-blue-200 dark:border-blue-500/20">
            <Terminal className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:bg-gradient-to-r dark:from-gray-100 dark:to-gray-300 dark:bg-clip-text dark:text-transparent">
              API Testing
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Test and explore your CRM API endpoints</p>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard 
          title="Total Requests" 
          value={stats.totalRequests.toString()}
          icon={<Send className="h-5 w-5" />}
          color="blue"
        />
        <StatCard 
          title="Success Rate" 
          value={`${stats.successRate}%`}
          icon={<Zap className="h-5 w-5" />}
          color="green"
        />
        <StatCard 
          title="Avg Response" 
          value={`${stats.avgResponseTime}ms`}
          icon={<Globe className="h-5 w-5" />}
          color="purple"
        />
        <StatCard 
          title="API Keys" 
          value={stats.activeKeys.toString()}
          icon={<Key className="h-5 w-5" />}
          color="orange"
        />
      </div>

      {/* Tab Navigation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-900/50 backdrop-blur-xl rounded-2xl p-1 border border-gray-200 dark:border-gray-800/50 shadow-lg"
      >
        <div className="flex">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant="ghost"
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 relative transition-all duration-200 rounded-xl",
                activeTab === tab.id
                  ? 'bg-gray-100 dark:bg-gray-800/70 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-gray-100 shadow-md'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800/30 text-gray-600 dark:text-gray-400'
              )}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </Button>
          ))}
        </div>
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'request' && (
          <motion.div
            key="request"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Request Builder */}
              <div className="bg-white dark:bg-gradient-to-br dark:from-gray-900/60 dark:to-gray-900/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-800/50 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <Code2 className="h-5 w-5" />
                  Request Builder
                </h3>
                
                <div className="space-y-4">
                  {/* Entity/Module Selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Select Module
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {API_ENTITIES.map(entity => (
                        <button
                          key={entity.value}
                          onClick={() => setSelectedEntity(entity.value)}
                          className={cn(
                            "px-3 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2",
                            selectedEntity === entity.value
                              ? "bg-blue-100 dark:bg-blue-500/20 border-blue-300 dark:border-blue-500/50 text-blue-600 dark:text-blue-400"
                              : "bg-gray-100 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800/50 hover:text-gray-800 dark:hover:text-gray-300"
                          )}
                        >
                          <span>{entity.icon}</span>
                          <span className="text-sm font-medium">{entity.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Operation Selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Select Operation
                    </label>
                    <div className="space-y-2">
                      {API_OPERATIONS.map(op => (
                        <button
                          key={`${op.method}-${op.label}`}
                          onClick={() => setSelectedOperation(op)}
                          className={cn(
                            "w-full px-4 py-3 rounded-lg border transition-all duration-200 flex items-center justify-between group",
                            selectedOperation.method === op.method && selectedOperation.label === op.label
                              ? "bg-green-100 dark:bg-green-500/20 border-green-300 dark:border-green-500/50"
                              : "bg-gray-100 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-800/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Badge
                              className={cn(
                                "font-mono text-xs",
                                op.method === 'GET' && "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400",
                                op.method === 'POST' && "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400",
                                op.method === 'PUT' && "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400",
                                op.method === 'DELETE' && "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                              )}
                            >
                              {op.method}
                            </Badge>
                            <div className="text-left">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{op.label}</div>
                              <div className="text-xs text-gray-500">{op.description}</div>
                            </div>
                          </div>
                          {selectedOperation.method === op.method && selectedOperation.label === op.label && (
                            <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Record ID Input (for single record operations) */}
                  {selectedOperation.path.includes('{id}') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Record ID
                      </label>
                      <input
                        type="text"
                        value={recordId}
                        onChange={(e) => setRecordId(e.target.value)}
                        placeholder="Enter record ID (e.g., uuid-1234-5678)"
                        className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
                      />
                    </div>
                  )}

                  {/* Generated Endpoint */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Endpoint URL
                    </label>
                    <div className="flex gap-3">
                      <div className={cn(
                        "px-3 py-2 rounded-lg font-mono text-sm flex items-center justify-center min-w-[80px]",
                        method === 'GET' && "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-500/50",
                        method === 'POST' && "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-300 dark:border-green-500/50",
                        method === 'PUT' && "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/50",
                        method === 'DELETE' && "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/50"
                      )}>
                        {method}
                      </div>
                      <input
                        type="text"
                        value={endpoint}
                        readOnly
                        className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700/50 rounded-lg text-gray-700 dark:text-gray-300 font-mono text-sm cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Headers */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Headers</label>
                    <CodeEditor 
                      value={headers}
                      onChange={setHeaders}
                      language="json"
                      height="120px"
                    />
                  </div>

                  {/* Body (for non-GET requests) */}
                  {method !== 'GET' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Body</label>
                      <CodeEditor 
                        value={body}
                        onChange={setBody}
                        language="json"
                        height="200px"
                      />
                    </div>
                  )}

                  {/* Send Button */}
                  <Button
                    onClick={sendRequest}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg"
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    {loading ? 'Sending...' : 'Send Request'}
                  </Button>
                </div>
              </div>

              {/* Response Viewer */}
              <div className="bg-white dark:bg-gradient-to-br dark:from-gray-900/60 dark:to-gray-900/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-800/50 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Response
                  </h3>
                  {response && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={copyResponse}
                        className="hover:bg-gray-100 dark:hover:bg-gray-800/50"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={downloadResponse}
                        className="hover:bg-gray-100 dark:hover:bg-gray-800/50"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="min-h-[300px]">
                  {response ? (
                    <CodeEditor
                      value={response}
                      onChange={() => {}}
                      language="json"
                      readOnly
                      height="300px"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-gray-500">
                      <div className="text-center">
                        <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Response will appear here</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'keys' && (
          <motion.div
            key="keys"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <ApiKeyManager onKeySelected={setCurrentApiKey} />
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-white dark:bg-gradient-to-br dark:from-gray-900/60 dark:to-gray-900/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-800/50 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <History className="h-5 w-5" />
              Request History
            </h3>

            <div className="space-y-3">
              {requests.length > 0 ? (
                requests.map((request) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gray-100 dark:bg-gray-800/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700/30 hover:border-gray-300 dark:hover:border-gray-600/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={request.method === 'GET' ? 'default' : request.method === 'POST' ? 'secondary' : 'outline'}
                          className="font-mono"
                        >
                          {request.method}
                        </Badge>
                        <span className="text-gray-700 dark:text-gray-300 font-mono text-sm">{request.endpoint}</span>
                        {request.status && (
                          <Badge
                            variant={request.status < 400 ? 'default' : 'destructive'}
                            className={cn(
                              request.status < 400 ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30' : ''
                            )}
                          >
                            {request.status}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {request.timestamp.toLocaleString()}
                      </span>
                    </div>
                    {request.response && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 font-mono line-clamp-2 bg-gray-200 dark:bg-gray-900/50 p-2 rounded">
                        {request.response}
                      </div>
                    )}
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No requests yet. Send your first API request to see history here.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'templates' && (
          <motion.div
            key="templates"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-white dark:bg-gradient-to-br dark:from-gray-900/60 dark:to-gray-900/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-800/50 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Request Templates
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.02 }}
                  className="bg-gray-100 dark:bg-gray-800/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700/30 hover:border-gray-300 dark:hover:border-gray-600/50 transition-all cursor-pointer"
                  onClick={() => loadTemplate(template)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">{template.name}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{template.description}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {template.category}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={template.method === 'GET' ? 'default' : template.method === 'POST' ? 'secondary' : 'outline'}
                      className="font-mono text-xs"
                    >
                      {template.method}
                    </Badge>
                    <span className="text-xs text-gray-500 font-mono">{template.endpoint}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'test-suite' && (
          <motion.div
            key="test-suite"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {currentApiKey ? (
              <ApiTestSuite apiKey={currentApiKey} />
            ) : (
              <div className="bg-white dark:bg-gradient-to-br dark:from-gray-900/60 dark:to-gray-900/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-800/50 shadow-xl">
                <div className="text-center">
                  <TestTube className="h-12 w-12 mx-auto mb-4 text-purple-500 dark:text-purple-400 opacity-50" />
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">API Key Required</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">Please generate an API key first to run the test suite</p>
                  <Button
                    onClick={() => setActiveTab('keys')}
                    className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Go to API Keys
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ApiTesting;