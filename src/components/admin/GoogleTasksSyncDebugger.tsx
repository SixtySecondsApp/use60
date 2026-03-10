import React, { useState } from 'react';
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  Loader2,
  ListTodo,
  RefreshCw,
  AlertTriangle,
  Database,
  Plus,
  ArrowUpDown,
  Search,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/clientV2';
import { googleTasksSync } from '@/lib/services/googleTasksSync';
import { toast } from 'sonner';

interface TestResult {
  step: string;
  status: 'running' | 'success' | 'failed' | 'warning';
  message: string;
  data?: any;
}

export function GoogleTasksSyncDebugger() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [localTasks, setLocalTasks] = useState<any[]>([]);
  const [googleTasks, setGoogleTasks] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);

  const addResult = (result: TestResult) => {
    setResults(prev => [...prev, result]);
  };

  const runComprehensiveTest = async () => {
    setIsRunning(true);
    setResults([]);
    setLocalTasks([]);
    setGoogleTasks([]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addResult({
          step: 'Authentication',
          status: 'failed',
          message: 'User not authenticated'
        });
        setIsRunning(false);
        return;
      }

      // Step 1: Check Google Tasks Connection
      addResult({
        step: 'Check Connection',
        status: 'running',
        message: 'Checking Google Tasks connection...'
      });

      const isConnected = await googleTasksSync.isConnected();
      
      if (!isConnected) {
        addResult({
          step: 'Check Connection',
          status: 'failed',
          message: 'Google Tasks is not connected. Please connect in Tasks page.'
        });
        setIsRunning(false);
        return;
      }

      addResult({
        step: 'Check Connection',
        status: 'success',
        message: 'Google Tasks is connected'
      });

      // Step 2: Get Sync Status
      addResult({
        step: 'Get Sync Status',
        status: 'running',
        message: 'Fetching sync status...'
      });

      const { data: syncStatusData, error: statusError } = await supabase
        .from('google_tasks_sync_status')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (statusError && statusError.code !== 'PGRST116') {
        addResult({
          step: 'Get Sync Status',
          status: 'failed',
          message: `Failed to get sync status: ${statusError.message}`
        });
      } else {
        setSyncStatus(syncStatusData);
        addResult({
          step: 'Get Sync Status',
          status: 'success',
          message: 'Sync status retrieved',
          data: {
            lastFullSync: syncStatusData?.last_full_sync_at,
            lastIncrementalSync: syncStatusData?.last_incremental_sync_at,
            syncStatus: syncStatusData?.sync_status,
            selectedList: syncStatusData?.selected_list_title
          }
        });
      }

      // Step 3: Get Local Tasks
      addResult({
        step: 'Get Local Tasks',
        status: 'running',
        message: 'Fetching local tasks from database...'
      });

      const { data: localTasksData, error: localError, count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact' })
        .eq('assigned_to', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (localError) {
        addResult({
          step: 'Get Local Tasks',
          status: 'failed',
          message: `Failed to get local tasks: ${localError.message}`
        });
      } else {
        setLocalTasks(localTasksData || []);
        addResult({
          step: 'Get Local Tasks',
          status: 'success',
          message: `Found ${count} total tasks (showing latest 20)`,
          data: {
            totalCount: count,
            syncedCount: localTasksData?.filter(t => t.sync_status === 'synced').length || 0,
            pendingCount: localTasksData?.filter(t => t.sync_status === 'pending_sync').length || 0,
            localOnlyCount: localTasksData?.filter(t => t.sync_status === 'local_only').length || 0
          }
        });
      }

      // Step 4: Get Google Tasks Lists
      addResult({
        step: 'Get Google Task Lists',
        status: 'running',
        message: 'Fetching Google Task lists...'
      });

      const { data: listsData, error: listsError } = await supabase.functions.invoke('google-services-router', { body: { action: 'tasks', handlerAction: 'list-tasklists' }
      });

      if (listsError) {
        addResult({
          step: 'Get Google Task Lists',
          status: 'failed',
          message: `Failed to get Google Task lists: ${listsError.message}`
        });
      } else {
        addResult({
          step: 'Get Google Task Lists',
          status: 'success',
          message: `Found ${listsData?.items?.length || 0} Google Task lists`,
          data: listsData?.items?.map((list: any) => ({
            id: list.id,
            title: list.title
          }))
        });

        // Step 5: Get tasks from each list
        for (const list of (listsData?.items || [])) {
          addResult({
            step: `Get Tasks from "${list.title}"`,
            status: 'running',
            message: `Fetching tasks from ${list.title}...`
          });

          const { data: tasksData, error: tasksError } = await supabase.functions.invoke('google-services-router', { body: { action: 'tasks', handlerAction: 'list-tasks',
              taskListId: list.id,
              showCompleted: true,
              showHidden: true,
              maxResults: 100
            }
          });

          if (tasksError) {
            addResult({
              step: `Get Tasks from "${list.title}"`,
              status: 'failed',
              message: `Failed: ${tasksError.message}`
            });
          } else {
            const tasks = tasksData?.items || [];
            if (tasks.length > 0) {
              setGoogleTasks(prev => [...prev, ...tasks.map((t: any) => ({
                ...t,
                listTitle: list.title,
                listId: list.id
              }))]);
            }
            
            addResult({
              step: `Get Tasks from "${list.title}"`,
              status: 'success',
              message: `Found ${tasks.length} tasks`,
              data: tasks.slice(0, 5).map((t: any) => ({
                title: t.title,
                status: t.status,
                due: t.due,
                updated: t.updated
              }))
            });
          }
        }
      }

      // Step 6: Check Task Mappings
      addResult({
        step: 'Check Task Mappings',
        status: 'running',
        message: 'Checking task synchronization mappings...'
      });

      const { data: mappingsData, error: mappingsError, count: mappingsCount } = await supabase
        .from('google_task_mappings')
        .select('*', { count: 'exact' })
        .limit(20);

      if (mappingsError && mappingsError.code !== 'PGRST116') {
        addResult({
          step: 'Check Task Mappings',
          status: 'failed',
          message: `Failed to get mappings: ${mappingsError.message}`
        });
      } else {
        addResult({
          step: 'Check Task Mappings',
          status: 'success',
          message: `Found ${mappingsCount || 0} task mappings`,
          data: mappingsData?.slice(0, 5).map((m: any) => ({
            taskId: m.task_id,
            googleTaskId: m.google_task_id,
            googleListId: m.google_list_id,
            lastSynced: m.last_synced_at
          }))
        });
      }

      // Step 7: Create Test Task
      addResult({
        step: 'Create Test Task',
        status: 'running',
        message: 'Creating a test task locally...'
      });

      const testTitle = `Test Task - ${new Date().toLocaleString()}`;
      const { data: testTask, error: createError } = await supabase
        .from('tasks')
        .insert({
          assigned_to: user.id,
          created_by: user.id,
          title: testTitle,
          description: 'This is a test task created by the sync debugger',
          priority: 'high',
          sync_status: 'pending_sync',
          status: 'pending'
        })
        .select()
        .single();

      if (createError) {
        addResult({
          step: 'Create Test Task',
          status: 'failed',
          message: `Failed to create test task: ${createError.message}`
        });
      } else {
        addResult({
          step: 'Create Test Task',
          status: 'success',
          message: `Created test task: "${testTitle}"`,
          data: {
            id: testTask.id,
            title: testTask.title,
            syncStatus: testTask.sync_status
          }
        });

        // Step 8: Run Sync
        addResult({
          step: 'Run Sync Operation',
          status: 'running',
          message: 'Running sync operation...'
        });

        const syncResult = await googleTasksSync.performSync(user.id);

        if (!syncResult.success) {
          addResult({
            step: 'Run Sync Operation',
            status: 'failed',
            message: `Sync failed: ${syncResult.error}`,
            data: syncResult
          });
        } else {
          addResult({
            step: 'Run Sync Operation',
            status: 'success',
            message: 'Sync completed successfully',
            data: {
              tasksCreated: syncResult.tasksCreated,
              tasksUpdated: syncResult.tasksUpdated,
              tasksDeleted: syncResult.tasksDeleted,
              conflicts: syncResult.conflicts.length
            }
          });

          // Step 9: Verify Test Task Was Synced
          addResult({
            step: 'Verify Test Task Sync',
            status: 'running',
            message: 'Checking if test task was synced to Google...'
          });

          const { data: syncedTask } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', testTask.id)
            .single();

          if (syncedTask?.google_task_id) {
            addResult({
              step: 'Verify Test Task Sync',
              status: 'success',
              message: 'Test task was successfully synced to Google Tasks',
              data: {
                googleTaskId: syncedTask.google_task_id,
                googleListId: syncedTask.primary_google_list_id,
                syncStatus: syncedTask.sync_status
              }
            });
          } else {
            addResult({
              step: 'Verify Test Task Sync',
              status: 'warning',
              message: 'Test task may not have been synced',
              data: syncedTask
            });
          }

          // Clean up test task
          await supabase
            .from('tasks')
            .delete()
            .eq('id', testTask.id);
        }
      }

      // Step 10: Check for Conflicts
      addResult({
        step: 'Check for Conflicts',
        status: 'running',
        message: 'Checking for sync conflicts...'
      });

      const { data: conflictsData, error: conflictsError, count: conflictsCount } = await supabase
        .from('google_tasks_sync_conflicts')
        .select('*', { count: 'exact' })
        .eq('resolved', false)
        .limit(10);

      if (conflictsError && conflictsError.code !== 'PGRST116') {
        addResult({
          step: 'Check for Conflicts',
          status: 'failed',
          message: `Failed to check conflicts: ${conflictsError.message}`
        });
      } else if (conflictsCount && conflictsCount > 0) {
        addResult({
          step: 'Check for Conflicts',
          status: 'warning',
          message: `Found ${conflictsCount} unresolved conflicts`,
          data: conflictsData
        });
      } else {
        addResult({
          step: 'Check for Conflicts',
          status: 'success',
          message: 'No sync conflicts found'
        });
      }

    } catch (error: any) {
      addResult({
        step: 'Unexpected Error',
        status: 'failed',
        message: error.message || 'An unexpected error occurred',
        data: error
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ListTodo className="w-6 h-6 text-blue-500" />
              <div>
                <CardTitle className="text-xl text-white">Google Tasks Sync Debugger</CardTitle>
                <p className="text-sm text-gray-400 mt-1">
                  Comprehensive test to debug why tasks aren't syncing properly
                </p>
              </div>
            </div>
            <Button
              onClick={runComprehensiveTest}
              disabled={isRunning}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Debug Test
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {syncStatus && (
          <CardContent>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Current Sync Status</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Last Full Sync:</span>
                  <span className="ml-2 text-white">
                    {syncStatus.last_full_sync_at 
                      ? new Date(syncStatus.last_full_sync_at).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Selected List:</span>
                  <span className="ml-2 text-white">{syncStatus.selected_list_title || 'None'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Test Results */}
      {results.length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Test Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((result, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  {getStatusIcon(result.status)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{result.step}</span>
                      {result.status === 'warning' && (
                        <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                          Warning
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{result.message}</p>
                    {result.data && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                          View Details
                        </summary>
                        <pre className="mt-2 p-2 bg-gray-900/50 rounded text-xs text-gray-400 overflow-auto max-h-40">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Local Tasks */}
      {localTasks.length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Database className="w-5 h-5" />
              Local Tasks (Latest 20)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {localTasks.map((task) => (
                <div key={task.id} className="bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{task.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-xs ${
                          task.sync_status === 'synced' 
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : task.sync_status === 'pending_sync'
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                        }`}>
                          {task.sync_status || 'local_only'}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          Priority: {task.priority}
                        </span>
                        {task.google_task_id && (
                          <span className="text-xs text-blue-400">
                            Google ID: {task.google_task_id.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(task.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Google Tasks */}
      {googleTasks.length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <ListTodo className="w-5 h-5" />
              Google Tasks (All Lists)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {googleTasks.map((task, index) => (
                <div key={index} className="bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{task.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                          {task.listTitle}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          Status: {task.status}
                        </span>
                        {task.due && (
                          <span className="text-xs text-gray-400">
                            Due: {task.due}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">
                      ID: {task.id.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Box */}
      <Card className="bg-blue-500/10 border-blue-500/20">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-white font-medium">What this test checks:</p>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Verifies Google Tasks connection and authentication</li>
                <li>• Fetches all your local tasks from the database</li>
                <li>• Retrieves all tasks from all Google Task lists</li>
                <li>• Checks synchronization mappings between local and Google tasks</li>
                <li>• Creates a test task and attempts to sync it</li>
                <li>• Identifies any sync conflicts or issues</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}