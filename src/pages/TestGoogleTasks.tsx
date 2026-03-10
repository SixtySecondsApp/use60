import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { googleTasksSync } from '@/lib/services/googleTasksSync';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

export default function TestGoogleTasks() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const addResult = (title: string, content: any, type: 'success' | 'error' | 'info' = 'info') => {
    setResults(prev => [...prev, { title, content, type, timestamp: new Date().toISOString() }]);
  };

  const clearResults = () => {
    setResults([]);
  };

  const checkConnection = async () => {
    clearResults();
    setLoading(true);
    
    try {
      // Check user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        addResult('User Status', 'Not logged in', 'error');
        return;
      }
      
      addResult('User', { id: user.id, email: user.email }, 'success');

      // Check Google integration
      const { data: integration, error: intError } = await supabase
        .from('google_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (intError) {
        addResult('Integration Error', intError, 'error');
        return;
      }

      if (!integration) {
        addResult('Integration', 'No active integration found', 'error');
        return;
      }

      // Check scopes
      const scopes = integration.scopes || '';
      const hasTasksScope = scopes.includes('https://www.googleapis.com/auth/tasks') || 
                           scopes.includes('tasks');

      addResult('Integration', {
        id: integration.id,
        email: integration.email,
        scopes: integration.scopes,
        scopesArray: integration.scopes ? integration.scopes.split(' ') : [],
        hasTasksScope: hasTasksScope,
        expiresAt: integration.expires_at,
        createdAt: integration.created_at
      }, hasTasksScope ? 'success' : 'error');

      // Check using the service
      const isConnected = await googleTasksSync.isConnected();
      addResult('Service Check', { isConnected }, isConnected ? 'success' : 'error');

    } catch (error: any) {
      addResult('Error', error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const checkIntegrationDetails = async () => {
    clearResults();
    setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addResult('User', 'Not logged in', 'error');
        return;
      }

      // Check all integrations
      const { data: integrations, error } = await supabase
        .from('google_integrations')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        addResult('Error', error, 'error');
        return;
      }

      addResult('All Integrations', integrations || [], 'info');

      // Check sync status
      const { data: syncStatus } = await supabase
        .from('google_tasks_sync_status')
        .select('*')
        .eq('user_id', user.id)
        .single();

      addResult('Sync Status', syncStatus || 'No sync status found', syncStatus ? 'info' : 'error');

      // Check task lists
      const { data: taskLists } = await supabase
        .from('google_task_lists')
        .select('*');

      addResult('Task Lists', taskLists || [], taskLists?.length ? 'success' : 'info');

      // Check task mappings
      const { data: mappings } = await supabase
        .from('google_task_mappings')
        .select('*')
        .limit(5);

      addResult('Task Mappings (first 5)', mappings || [], 'info');

    } catch (error: any) {
      addResult('Error', error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const clearOnboarding = () => {
    localStorage.removeItem('googleTasksOnboardingSeen');
    sessionStorage.removeItem('googleTasksConnecting');
    addResult('Storage Cleared', {
      localStorage: 'googleTasksOnboardingSeen removed',
      sessionStorage: 'googleTasksConnecting removed'
    }, 'success');
  };

  const testSync = async () => {
    clearResults();
    setLoading(true);
    
    try {
      // Get the user's session token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        addResult('Session Error', 'No active session found', 'error');
        return;
      }

      addResult('Session', { 
        user: session.user.email,
        expires: new Date(session.expires_at! * 1000).toISOString()
      }, 'info');

      // Test the Edge Function - try both URL param and body
      const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'tasks', handlerAction: 'list-tasklists',
          maxResults: 20
        }
      });

      if (error) {
        addResult('Edge Function Error', {
          error: error,
          message: error.message || 'Unknown error',
          context: error.context || {},
          details: 'Check if the Edge Function is deployed and accessible'
        }, 'error');
        
        // Also try raw response for more details
        if (error.message === 'FunctionsHttpError') {
          addResult('HTTP Error', 'Edge Function returned an HTTP error. This usually means the function executed but encountered an error.', 'error');
        }
        return;
      }

      addResult('Task Lists from Google', data || 'No data returned', data ? 'success' : 'error');

      // Try to list tasks
      const { data: tasksData, error: tasksError } = await supabase.functions.invoke('google-services-router', { body: { action: 'tasks', handlerAction: 'list-tasks',
          taskListId: '@default',
          maxResults: 10
        }
      });

      if (tasksError) {
        addResult('Tasks Error', tasksError, 'error');
      } else {
        addResult('Tasks from Google', tasksData || 'No tasks found', tasksData ? 'success' : 'info');
      }

    } catch (error: any) {
      addResult('Unexpected Error', {
        message: error.message,
        stack: error.stack
      }, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testFullSync = async () => {
    clearResults();
    setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addResult('User', 'Not logged in', 'error');
        return;
      }

      addResult('Starting Sync', 'Initializing...', 'info');
      
      // Initialize sync
      await googleTasksSync.initializeSync(user.id);
      addResult('Sync Initialized', 'Success', 'success');

      // Perform sync
      const result = await googleTasksSync.performSync(user.id);
      addResult('Sync Result', result, result.success ? 'success' : 'error');

    } catch (error: any) {
      addResult('Sync Error', error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl text-white">Google Tasks Connection Test</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-6">
              <Button 
                onClick={checkConnection} 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                Check Connection
              </Button>
              <Button 
                onClick={checkIntegrationDetails} 
                disabled={loading}
                variant="outline"
              >
                Integration Details
              </Button>
              <Button 
                onClick={clearOnboarding} 
                disabled={loading}
                variant="outline"
              >
                Clear Onboarding
              </Button>
              <Button 
                onClick={testSync} 
                disabled={loading}
                variant="outline"
              >
                Test Edge Function
              </Button>
              <Button 
                onClick={testFullSync} 
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                Test Full Sync
              </Button>
              <Button 
                onClick={clearResults} 
                variant="ghost"
                className="text-gray-400"
              >
                Clear Results
              </Button>
            </div>

            <div className="space-y-4">
              {results.map((result, index) => (
                <div 
                  key={index}
                  className={`p-4 rounded-lg border ${
                    result.type === 'success' 
                      ? 'bg-green-900/20 border-green-800' 
                      : result.type === 'error'
                      ? 'bg-red-900/20 border-red-800'
                      : 'bg-blue-900/20 border-blue-800'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {result.type === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : result.type === 'error' ? (
                      <XCircle className="w-5 h-5 text-red-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-blue-500" />
                    )}
                    <h3 className="text-white font-semibold">{result.title}</h3>
                    <span className="text-xs text-gray-500 ml-auto">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap">
                    {typeof result.content === 'object' 
                      ? JSON.stringify(result.content, null, 2) 
                      : result.content}
                  </pre>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}