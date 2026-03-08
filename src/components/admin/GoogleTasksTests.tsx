import React, { useState } from 'react';
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  Loader2,
  ListTodo,
  RefreshCw,
  Shield,
  AlertTriangle,
  Database,
  Settings,
  Zap,
  GitBranch,
  Filter,
  Clock,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/clientV2';
import { googleTasksSync } from '@/lib/services/googleTasksSync';
import { toast } from 'sonner';

interface TestResult {
  name: string;
  category: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  message?: string;
  data?: any;
  duration?: number;
  tests?: TestResult[];
}

interface TestCategory {
  name: string;
  icon: React.ReactNode;
  expanded: boolean;
}

export function GoogleTasksTests() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const runTest = async (
    name: string,
    category: string,
    testFn: () => Promise<any>
  ): Promise<TestResult> => {
    setCurrentTest(name);
    const startTime = Date.now();
    
    try {
      const data = await testFn();
      const duration = Date.now() - startTime;
      
      return {
        name,
        category,
        status: 'success',
        data,
        duration,
        message: 'Test passed'
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      let errorMessage = error.message || 'Test failed';
      let errorData = null;
      
      if (error.details) {
        errorData = error.details;
      }
      if (error.hint) {
        errorMessage += ` (Hint: ${error.hint})`;
      }
      
      return {
        name,
        category,
        status: 'failed',
        message: errorMessage,
        data: errorData,
        duration
      };
    }
  };

  const runAllTests = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setResults([]);
    const testResults: TestResult[] = [];

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        toast.error('User not authenticated');
        setIsRunning(false);
        return;
      }

      // === 1. Authentication & OAuth Tests ===
      
      // Test: Check Google Tasks OAuth Scope
      testResults.push(await runTest(
        'Verify Google Tasks OAuth Scope',
        'Authentication',
        async () => {
          const { data, error } = await supabase
            .from('google_integrations')
            .select('scopes')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();
          
          if (error) throw error;
          if (!data) throw new Error('No active Google integration found');
          
          const scopes = (data as any).scopes || [];
          const scopesArray = Array.isArray(scopes) ? scopes : [scopes];
          const hasTasksScope = scopesArray.some((scope: string) => 
            scope.includes('tasks') || scope.includes('https://www.googleapis.com/auth/tasks')
          );
          
          if (!hasTasksScope) {
            throw new Error('Google Tasks scope not found in authorized scopes');
          }
          
          return {
            scopes: scopesArray,
            hasTasksScope,
            scopeCount: scopesArray.length
          };
        }
      ));
      setResults([...testResults]);

      // Test: Check Google Integration Connection
      testResults.push(await runTest(
        'Verify Google Integration Connection',
        'Authentication',
        async () => {
          const isConnected = await googleTasksSync.isConnected();
          
          if (!isConnected) {
            throw new Error('Google Tasks is not connected');
          }
          
          const { data } = await supabase
            .from('google_integrations')
            .select('email, expires_at')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();
          
          return {
            connected: isConnected,
            email: (data as any)?.email,
            expiresAt: (data as any)?.expires_at,
            isExpired: new Date((data as any)?.expires_at) < new Date()
          };
        }
      ));
      setResults([...testResults]);

      // === 2. Google Tasks List Management ===
      
      // Test: Fetch Google Task Lists
      testResults.push(await runTest(
        'Fetch Google Task Lists',
        'Lists',
        async () => {
          const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'tasks', handlerAction: 'list-tasklists' }
          });
          
          if (error) throw error;
          if (!data || !data.items) throw new Error('No task lists returned');
          
          return {
            listCount: data.items.length,
            lists: data.items.map((list: any) => ({
              id: list.id,
              title: list.title
            })),
            hasDefaultList: data.items.some((list: any) => list.id === '@default')
          };
        }
      ));
      setResults([...testResults]);

      // Test: Check Sync Status Table
      testResults.push(await runTest(
        'Check Sync Status Table',
        'Database',
        async () => {
          const { data, error } = await supabase
            .from('google_tasks_sync_status')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (error && error.code !== 'PGRST116') throw error;
          
          return {
            hasSyncStatus: !!data,
            lastFullSync: (data as any)?.last_full_sync_at,
            lastIncrementalSync: (data as any)?.last_incremental_sync_at,
            syncStatus: (data as any)?.sync_status || 'never synced',
            selectedListId: (data as any)?.selected_list_id,
            selectedListTitle: (data as any)?.selected_list_title
          };
        }
      ));
      setResults([...testResults]);

      // === 3. Multi-List Configuration Tests ===
      
      // Test: Check List Configurations
      testResults.push(await runTest(
        'Check Multi-List Configurations',
        'Configuration',
        async () => {
          const { data, error } = await supabase
            .from('google_tasks_list_configs')
            .select('*')
            .eq('user_id', user.id)
            .order('is_primary', { ascending: false });
          
          if (error && error.code !== 'PGRST116') throw error;
          
          const configs = data || [];
          const primaryList = configs.find((c: any) => c.is_primary);
          const priorityLists = configs.filter((c: any) => 
            c.priority_filter && c.priority_filter.length > 0
          );
          
          return {
            configCount: configs.length,
            hasPrimaryList: !!primaryList,
            primaryListTitle: primaryList?.list_title,
            priorityListCount: priorityLists.length,
            priorityFilters: priorityLists.map((c: any) => ({
              title: c.list_title,
              priorities: c.priority_filter
            }))
          };
        }
      ));
      setResults([...testResults]);

      // Test: Verify Priority Routing Setup
      testResults.push(await runTest(
        'Verify Priority Routing Configuration',
        'Configuration',
        async () => {
          const { data: configs, error } = await supabase
            .from('google_tasks_list_configs')
            .select('*')
            .eq('user_id', user.id);
          
          if (error && error.code !== 'PGRST116') throw error;
          
          if (!configs || configs.length === 0) {
            return {
              message: 'No multi-list configurations set up yet',
              hasHighPriorityList: false,
              totalLists: 0,
              routingEnabled: false,
              note: 'Configure multiple lists in Google Tasks Settings'
            };
          }
          
          const highPriorityList = configs.find((c: any) => 
            c.priority_filter?.includes('high')
          );
          
          const primaryList = configs.find((c: any) => c.is_primary);
          
          return {
            hasHighPriorityList: !!highPriorityList,
            highPriorityListTitle: highPriorityList?.list_title,
            primaryListTitle: primaryList?.list_title,
            totalLists: configs.length,
            routingEnabled: configs.some((c: any) => 
              c.priority_filter && c.priority_filter.length > 0
            )
          };
        }
      ));
      setResults([...testResults]);

      // === 4. Task Sync Tests ===
      
      // Test: Check Task Mappings
      testResults.push(await runTest(
        'Check Task Mappings',
        'Sync',
        async () => {
          const { data, error, count } = await supabase
            .from('google_task_mappings')
            .select('*', { count: 'exact', head: false })
            .limit(10);
          
          if (error && error.code !== 'PGRST116') throw error;
          
          return {
            mappingCount: count || 0,
            hasMappings: (count || 0) > 0,
            sampleMappings: data?.slice(0, 3).map((m: any) => ({
              taskId: m.task_id,
              googleTaskId: m.google_task_id,
              googleListId: m.google_list_id,
              lastSynced: m.last_synced_at
            }))
          };
        }
      ));
      setResults([...testResults]);

      // Test: Check Local Tasks
      testResults.push(await runTest(
        'Check Local Tasks with Sync Status',
        'Sync',
        async () => {
          const { data, error, count } = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: false })
            .eq('assigned_to', user.id)
            .limit(10);
          
          if (error) throw error;
          
          const syncedTasks = data?.filter((t: any) => t.sync_status === 'synced') || [];
          const pendingTasks = data?.filter((t: any) => t.sync_status === 'pending_sync') || [];
          const localOnlyTasks = data?.filter((t: any) => t.sync_status === 'local_only') || [];
          
          return {
            totalTasks: count || 0,
            syncedCount: syncedTasks.length,
            pendingCount: pendingTasks.length,
            localOnlyCount: localOnlyTasks.length,
            sampleTasks: data?.slice(0, 3).map((t: any) => ({
              title: t.title,
              syncStatus: t.sync_status,
              priority: t.priority,
              googleTaskId: t.google_task_id
            }))
          };
        }
      ));
      setResults([...testResults]);

      // === 5. Sync Operation Tests ===
      
      // Test: Test Incremental Sync
      testResults.push(await runTest(
        'Test Incremental Sync Operation',
        'Operations',
        async () => {
          const result = await googleTasksSync.performSync(user.id);
          
          if (!result.success) {
            throw new Error(result.error || 'Incremental sync failed');
          }
          
          return {
            success: result.success,
            tasksCreated: result.tasksCreated,
            tasksUpdated: result.tasksUpdated,
            tasksDeleted: result.tasksDeleted,
            conflicts: result.conflicts?.length || 0
          };
        }
      ));
      setResults([...testResults]);

      // Test: Verify Bidirectional Sync
      testResults.push(await runTest(
        'Verify Bidirectional Sync',
        'Operations',
        async () => {
          // Create a test task locally
          const testTitle = `Test Task - ${Date.now()}`;
          const { data: newTask, error: createError } = await supabase
            .from('tasks')
            .insert({
              assigned_to: user.id,
              created_by: user.id,
              title: testTitle,
              priority: 'medium',
              sync_status: 'pending_sync'
            })
            .select()
            .single();
          
          if (createError) throw createError;
          
          // Perform sync
          const syncResult = await googleTasksSync.performSync(user.id);
          
          if (!syncResult.success) {
            throw new Error('Sync failed during bidirectional test');
          }
          
          // Check if task was synced
          const { data: syncedTask } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', newTask.id)
            .single();
          
          // Clean up test task
          await supabase
            .from('tasks')
            .delete()
            .eq('id', newTask.id);
          
          return {
            testTaskCreated: !!newTask,
            syncExecuted: syncResult.success,
            taskSynced: syncedTask?.sync_status === 'synced',
            googleTaskId: syncedTask?.google_task_id,
            testTaskTitle: testTitle
          };
        }
      ));
      setResults([...testResults]);

      // === 6. Priority Routing Tests ===
      
      // Test: Test Priority-Based Routing
      testResults.push(await runTest(
        'Test Priority-Based Task Routing',
        'Routing',
        async () => {
          const { data: configs, error: configError } = await supabase
            .from('google_tasks_list_configs')
            .select('*')
            .eq('user_id', user.id);
          
          if (configError && configError.code !== 'PGRST116') throw configError;
          
          if (!configs || configs.length === 0) {
            return {
              message: 'No list configurations for routing test',
              skipped: true,
              note: 'Set up multi-list configuration in Google Tasks Settings first'
            };
          }
          
          // Create high priority test task
          const highPriorityTitle = `High Priority Test - ${Date.now()}`;
          const { data: highTask, error: highError } = await supabase
            .from('tasks')
            .insert({
              assigned_to: user.id,
              created_by: user.id,
              title: highPriorityTitle,
              priority: 'high',
              sync_status: 'pending_sync'
            })
            .select()
            .single();
          
          if (highError) throw highError;
          
          // Create medium priority test task
          const mediumPriorityTitle = `Medium Priority Test - ${Date.now()}`;
          const { data: mediumTask, error: medError } = await supabase
            .from('tasks')
            .insert({
              assigned_to: user.id,
              created_by: user.id,
              title: mediumPriorityTitle,
              priority: 'medium',
              sync_status: 'pending_sync'
            })
            .select()
            .single();
          
          if (medError) throw medError;
          
          // Perform sync
          const syncResult = await googleTasksSync.performSync(user.id);
          
          // Check routing results
          const { data: syncedHighTask } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', highTask.id)
            .single();
          
          const { data: syncedMediumTask } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', mediumTask.id)
            .single();
          
          // Clean up test tasks
          await supabase
            .from('tasks')
            .delete()
            .in('id', [highTask.id, mediumTask.id]);
          
          const highPriorityList = configs.find((c: any) => 
            c.priority_filter?.includes('high')
          );
          
          return {
            highPriorityRouted: syncedHighTask?.primary_google_list_id === highPriorityList?.google_list_id,
            mediumPriorityRouted: !!syncedMediumTask?.google_task_id,
            highTaskList: syncedHighTask?.primary_google_list_id,
            mediumTaskList: syncedMediumTask?.primary_google_list_id,
            expectedHighList: highPriorityList?.google_list_id
          };
        }
      ));
      setResults([...testResults]);

      // === 7. Conflict Resolution Tests ===
      
      // Test: Check Conflict Detection
      testResults.push(await runTest(
        'Check Conflict Detection',
        'Conflicts',
        async () => {
          const { data, error, count } = await supabase
            .from('google_tasks_sync_conflicts')
            .select('*', { count: 'exact', head: false })
            .eq('resolved', false)
            .limit(5);
          
          if (error && error.code !== 'PGRST116') throw error;
          
          return {
            unresolvedConflicts: count || 0,
            hasConflicts: (count || 0) > 0,
            conflictTypes: data?.map((c: any) => c.conflict_type) || [],
            sampleConflicts: data?.slice(0, 3).map((c: any) => ({
              type: c.conflict_type,
              taskId: c.task_id,
              googleTaskId: c.google_task_id
            }))
          };
        }
      ));
      setResults([...testResults]);

      // === 8. Edge Function Tests ===
      
      // Test: Google Tasks Edge Function Health
      testResults.push(await runTest(
        'Google Tasks Edge Function Health',
        'System',
        async () => {
          const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'tasks', handlerAction: 'list-tasklists' }
          });
          
          if (error) {
            if (error.message?.includes('Google integration not found')) {
              throw new Error('Google account not connected');
            }
            throw error;
          }
          
          return {
            status: 'healthy',
            functionDeployed: true,
            responseTime: Date.now(),
            listCount: data?.items?.length || 0
          };
        }
      ));
      setResults([...testResults]);

      // Test: Token Refresh Capability
      testResults.push(await runTest(
        'Test Token Refresh Capability',
        'System',
        async () => {
          const { data, error } = await supabase
            .from('google_integrations')
            .select('refresh_token, expires_at')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();
          
          if (error) throw error;
          if (!data) throw new Error('No integration found');
          
          const hasRefreshToken = !!(data as any).refresh_token;
          const expiresAt = new Date((data as any).expires_at);
          const needsRefresh = expiresAt < new Date(Date.now() + 5 * 60 * 1000);
          
          return {
            hasRefreshToken,
            expiresAt: (data as any).expires_at,
            needsRefresh,
            canAutoRefresh: hasRefreshToken
          };
        }
      ));
      setResults([...testResults]);

      // === 9. Performance Tests ===
      
      // Test: Sync Performance Metrics
      testResults.push(await runTest(
        'Measure Sync Performance',
        'Performance',
        async () => {
          const startTime = Date.now();
          
          // Fetch task lists
          const { data: listsData } = await supabase.functions.invoke('google-services-router', { body: { action: 'tasks', handlerAction: 'list-tasklists' }
          });
          const listsFetchTime = Date.now() - startTime;
          
          // Fetch tasks from default list
          const tasksFetchStart = Date.now();
          const { data: tasksData } = await supabase.functions.invoke('google-services-router', { body: { action: 'tasks', handlerAction: 'list-tasks',
              taskListId: '@default',
              maxResults: 10
            }
          });
          const tasksFetchTime = Date.now() - tasksFetchStart;
          
          // Database query performance
          const dbStart = Date.now();
          const { data: dbTasks } = await supabase
            .from('tasks')
            .select('*')
            .eq('user_id', user.id)
            .limit(10);
          const dbQueryTime = Date.now() - dbStart;
          
          return {
            listsFetchTime: `${listsFetchTime}ms`,
            tasksFetchTime: `${tasksFetchTime}ms`,
            dbQueryTime: `${dbQueryTime}ms`,
            totalTime: `${Date.now() - startTime}ms`,
            tasksReturned: tasksData?.items?.length || 0,
            dbTasksReturned: dbTasks?.length || 0
          };
        }
      ));
      setResults([...testResults]);

    } catch (error: any) {
      toast.error('Test suite failed: ' + error.message);
    } finally {
      setIsRunning(false);
      setCurrentTest('');
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'skipped':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Authentication':
        return <Shield className="w-4 h-4" />;
      case 'Lists':
        return <ListTodo className="w-4 h-4" />;
      case 'Database':
        return <Database className="w-4 h-4" />;
      case 'Configuration':
        return <Settings className="w-4 h-4" />;
      case 'Sync':
        return <RefreshCw className="w-4 h-4" />;
      case 'Operations':
        return <Zap className="w-4 h-4" />;
      case 'Routing':
        return <GitBranch className="w-4 h-4" />;
      case 'Conflicts':
        return <AlertTriangle className="w-4 h-4" />;
      case 'System':
        return <Database className="w-4 h-4" />;
      case 'Performance':
        return <Clock className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.category]) {
      acc[result.category] = [];
    }
    acc[result.category].push(result);
    return acc;
  }, {} as Record<string, TestResult[]>);

  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
              <ListTodo className="w-6 h-6 text-blue-400" />
              Google Tasks Sync Tests
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Comprehensive test suite for Google Tasks bidirectional sync with priority routing
            </p>
          </div>
          <Button
            onClick={runAllTests}
            disabled={isRunning}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run All Tests
              </>
            )}
          </Button>
        </div>

        {/* Summary Stats */}
        {results.length > 0 && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <div className="text-xs text-gray-400">Total Tests</div>
              <div className="text-xl font-semibold text-gray-200">{results.length}</div>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <div className="text-xs text-green-400">Passed</div>
              <div className="text-xl font-semibold text-green-400">{successCount}</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="text-xs text-red-400">Failed</div>
              <div className="text-xl font-semibold text-red-400">{failedCount}</div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <div className="text-xs text-blue-400">Total Time</div>
              <div className="text-xl font-semibold text-blue-400">{totalDuration}ms</div>
            </div>
          </div>
        )}
      </div>

      {/* Current Test Indicator */}
      {currentTest && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-sm text-blue-400">Running: {currentTest}</span>
          </div>
        </div>
      )}

      {/* No Tests Message */}
      {results.length === 0 && !isRunning && (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <ListTodo className="w-16 h-16 text-gray-500 mb-4" />
            <h3 className="text-xl font-semibold text-gray-300 mb-2">Ready to Test Google Tasks Sync</h3>
            <p className="text-gray-400 max-w-md mb-6">
              This comprehensive test suite will verify OAuth authentication, multi-list configuration, 
              priority-based routing, bidirectional sync, and conflict resolution.
            </p>
            <div className="grid grid-cols-2 gap-4 text-left max-w-lg">
              <div className="bg-gray-900/50 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">Test Categories</h4>
                <ul className="space-y-1 text-xs text-gray-400">
                  <li>• Authentication & OAuth</li>
                  <li>• List Management</li>
                  <li>• Multi-List Configuration</li>
                  <li>• Priority Routing</li>
                  <li>• Bidirectional Sync</li>
                </ul>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">Features Tested</h4>
                <ul className="space-y-1 text-xs text-gray-400">
                  <li>• Task Creation & Updates</li>
                  <li>• Conflict Detection</li>
                  <li>• Performance Metrics</li>
                  <li>• Edge Function Health</li>
                  <li>• Token Refresh</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test Results by Category */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-200">Test Results by Category</h3>
          {Object.entries(groupedResults).map(([category, categoryResults]) => {
            const isExpanded = expandedCategories.has(category);
            const categorySuccesses = categoryResults.filter(r => r.status === 'success').length;
            const categoryFailures = categoryResults.filter(r => r.status === 'failed').length;
            
            return (
              <div key={category} className="bg-gray-800/50 border border-gray-700/50 rounded-lg">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-700/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    {getCategoryIcon(category)}
                    <span className="font-medium text-gray-200">{category}</span>
                    <div className="flex gap-2">
                      {categorySuccesses > 0 && (
                        <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                          {categorySuccesses} passed
                        </Badge>
                      )}
                      {categoryFailures > 0 && (
                        <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
                          {categoryFailures} failed
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">
                    {categoryResults.length} tests
                  </span>
                </button>

                {/* Category Tests */}
                {isExpanded && (
                  <div className="border-t border-gray-700/50 p-4 space-y-2">
                    {categoryResults.map((result, index) => (
                      <div
                        key={index}
                        className="bg-gray-900/50 rounded-lg p-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {getStatusIcon(result.status)}
                            <div className="space-y-1">
                              <span className="text-sm font-medium text-gray-200">
                                {result.name}
                              </span>
                              {result.message && (
                                <p className="text-xs text-gray-400">{result.message}</p>
                              )}
                            </div>
                          </div>
                          {result.duration && (
                            <span className="text-xs text-gray-500">
                              {result.duration}ms
                            </span>
                          )}
                        </div>
                        {result.data && (
                          <details className="mt-3">
                            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                              View Details
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-950 rounded text-xs text-gray-400 overflow-auto max-h-40">
                              {JSON.stringify(result.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error Summary */}
      {failedCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-400 mb-3">Failed Tests Summary</h3>
          <div className="space-y-2">
            {results.filter(r => r.status === 'failed').map((result, index) => (
              <div key={index} className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-500 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-gray-200">{result.name}</div>
                  <div className="text-xs text-gray-400">{result.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}