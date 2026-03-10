import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Mail,
  Calendar,
  FolderOpen,
  Shield,
  AlertTriangle,
  Database,
  ArrowLeft,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

// Helper to get auth headers for edge functions
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No active session');
  }
  return { Authorization: `Bearer ${session.access_token}` };
}
import { CalendarSyncTest } from './CalendarSyncTest';
import { CalendarE2ETest } from './CalendarE2ETest';
import { CalendarDatabaseViewer } from './CalendarDatabaseViewer';
import { CalendarDebugger } from './CalendarDebugger';

interface TestResult {
  name: string;
  category: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  message?: string;
  data?: any;
  duration?: number;
}

export function GoogleIntegrationTests() {
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);

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
      
      // Extract more detailed error information
      let errorMessage = error.message || 'Test failed';
      let errorData = null;
      
      // If it's a Supabase function error, get more details
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

      // === 1. Authentication Tests ===
      
      // Test: Check Google Integration Status
      testResults.push(await runTest(
        'Check Google Integration',
        'Authentication',
        async () => {
          const { data, error } = await supabase
            .from('google_integrations')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();
          
          if (error) throw error;
          if (!data) throw new Error('No active Google integration found');
          
          return {
            email: (data as any).email,
            scopes: (data as any).scopes,
            expires_at: (data as any).expires_at
          };
        }
      ));
      setResults([...testResults]);

      // Test: Verify OAuth Tokens
      testResults.push(await runTest(
        'Verify OAuth Tokens',
        'Authentication',
        async () => {
          const { data, error } = await supabase
            .from('google_integrations')
            .select('access_token, refresh_token, expires_at')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();
          
          if (error) throw error;
          if (!data) throw new Error('No tokens found');
          
          const expiresAt = new Date((data as any).expires_at);
          const isExpired = expiresAt < new Date();
          
          return {
            hasAccessToken: !!(data as any).access_token,
            hasRefreshToken: !!(data as any).refresh_token,
            isExpired,
            expiresAt: (data as any).expires_at
          };
        }
      ));
      setResults([...testResults]);

      // === 2. Calendar Tests ===
      
      // Test: Check Calendar Sync Status
      testResults.push(await runTest(
        'Check Calendar Sync Status',
        'Calendar',
        async () => {
          const { data, error } = await (supabase as any)
            .from('calendar_sync_logs')
            .select('*')
            .eq('user_id', user.id)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          return {
            lastSync: (data as any)?.completed_at || null,
            syncStatus: (data as any)?.sync_status || 'never synced',
            eventsCreated: (data as any)?.events_created || 0,
            eventsUpdated: (data as any)?.events_updated || 0
          };
        }
      ));
      setResults([...testResults]);

      // Test: Check Calendar Events in Database
      testResults.push(await runTest(
        'Check Calendar Events',
        'Calendar',
        async () => {
          const { data, error, count } = await (supabase as any)
            .from('calendar_events')
            .select('*', { count: 'exact', head: false })
            .eq('user_id', user.id)
            .limit(10);
          
          if (error) throw error;
          
          return {
            totalEvents: count || 0,
            sampleEvents: data?.length || 0,
            hasEvents: (count || 0) > 0
          };
        }
      ));
      setResults([...testResults]);

      // Test: Verify Calendar Database Structure
      testResults.push(await runTest(
        'Verify Calendar Tables',
        'Calendar',
        async () => {
          // Check calendar_calendars table
          const { data: calendars, error: calError } = await (supabase as any)
            .from('calendar_calendars')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          
          // Check if calendar_events has required columns
          const { data: events, error: evError } = await (supabase as any)
            .from('calendar_events')
            .select('id, calendar_id, external_id, title, start_time, end_time')
            .eq('user_id', user.id)
            .limit(1);
          
          return {
            hasCalendarRecord: !!calendars,
            calendarId: (calendars as any)?.id || null,
            historicalSyncCompleted: (calendars as any)?.historical_sync_completed || false,
            eventsTableAccessible: !evError
          };
        }
      ));
      setResults([...testResults]);

      // Test: Calendar Sync Function
      testResults.push(await runTest(
        'Test Calendar Sync Function',
        'Calendar',
        async () => {
          const headers = await getAuthHeaders();
          const { data, error } = await supabase.functions.invoke('google-calendar?action=list-events', {
            body: {
              timeMin: new Date().toISOString(),
              timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              maxResults: 5
            },
            headers
          });
          
          if (error) throw error;
          
          return {
            success: !!data,
            eventCount: data?.events?.length || 0,
            message: data?.error || 'Calendar test completed'
          };
        }
      ));
      setResults([...testResults]);

      // === 3. Gmail Tests ===
      
      // Test: Gmail Labels
      testResults.push(await runTest(
        'Fetch Gmail Labels',
        'Gmail',
        async () => {
          const headers = await getAuthHeaders();
          const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'gmail', handlerAction: 'labels',},
            headers
          });
          
          if (error) throw error;
          
          return {
            labelCount: data?.labels?.length || 0,
            hasInbox: data?.labels?.some((l: any) => l.name === 'INBOX') || false,
            labels: data?.labels?.slice(0, 5).map((l: any) => l.name) || []
          };
        }
      ));
      setResults([...testResults]);

      // Test: Gmail Messages
      testResults.push(await runTest(
        'Fetch Gmail Messages',
        'Gmail',
        async () => {
          const headers = await getAuthHeaders();
          const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'gmail', handlerAction: 'list',
              maxResults: 5
            },
            headers
          });
          
          if (error) throw error;
          
          return {
            messageCount: data?.messages?.length || 0,
            totalEstimate: data?.resultSizeEstimate || 0,
            hasMessages: (data?.messages?.length || 0) > 0
          };
        }
      ));
      setResults([...testResults]);

      // === 4. Edge Function Tests ===
      
      // Test: Google Calendar Edge Function
      testResults.push(await runTest(
        'Google Calendar Edge Function',
        'Edge Functions',
        async () => {
          const headers = await getAuthHeaders();
          const { data, error } = await supabase.functions.invoke('google-calendar?action=list-calendars', {
            body: {},
            headers
          });
          
          if (error) throw error;
          
          return {
            calendars: data?.calendars?.length || 0,
            primaryCalendar: data?.calendars?.find((c: any) => c.primary) || null
          };
        }
      ));
      setResults([...testResults]);

      // Test: Health Check
      testResults.push(await runTest(
        'Health Check',
        'System',
        async () => {
          // First check if we can hit any Edge Function
          const headers = await getAuthHeaders();
          const { data, error } = await supabase.functions.invoke('google-calendar?action=list-calendars', {
            body: {},
            headers
          });
          
          // Even if it errors due to auth, we can still check if the function is deployed
          if (error && error.message && error.message.includes('Google integration not found')) {
            // This is actually good - the function is running, just no Google account connected
            return {
              status: 'operational',
              message: 'Edge Functions deployed (Google account not connected)',
              timestamp: new Date().toISOString()
            };
          } else if (error && (error.message?.includes('FunctionInvokeError') || error.message?.includes('non-2xx'))) {
            // Function might not be deployed or configured
            throw new Error('Edge Functions may not be deployed or GOOGLE_CLIENT_ID/SECRET not configured');
          } else if (data) {
            return {
              status: 'healthy',
              message: 'Edge Functions operational and Google connected',
              timestamp: new Date().toISOString()
            };
          } else {
            throw error || new Error('Unknown status');
          }
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
      case 'Calendar':
        return <Calendar className="w-4 h-4" />;
      case 'Gmail':
        return <Mail className="w-4 h-4" />;
      case 'Edge Functions':
        return <Database className="w-4 h-4" />;
      case 'System':
        return <FolderOpen className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate('/admin')}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-100">Google Integration Tests</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Test calendar sync, email integration, and Google Auth functionality
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
          </div>

      {currentTest && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-sm text-blue-400">Running: {currentTest}</span>
          </div>
        </div>
      )}

      {results.length === 0 && !isRunning && (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Settings className="w-16 h-16 text-gray-500 mb-4" />
            <h3 className="text-xl font-semibold text-gray-300 mb-2">No Tests Run Yet</h3>
            <p className="text-gray-400 max-w-md mb-6">
              Click "Run All Tests" to verify your Google Calendar, Gmail, and OAuth integrations are working correctly.
            </p>
            <div className="grid grid-cols-3 gap-8 text-center mb-8">
              <div>
                <Shield className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">OAuth</p>
              </div>
              <div>
                <Calendar className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Calendar</p>
              </div>
              <div>
                <Mail className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Gmail</p>
              </div>
            </div>
            <div className="text-left bg-gray-900/50 rounded-lg p-4 max-w-lg">
              <h4 className="text-sm font-semibold text-gray-300 mb-2">Tests that will run:</h4>
              <ul className="space-y-1 text-xs text-gray-400">
                <li>• Check Google Integration Status</li>
                <li>• Verify OAuth Tokens</li>
                <li>• Check Calendar Sync Status</li>
                <li>• Verify Calendar Events in Database</li>
                <li>• Test Calendar Database Structure</li>
                <li>• Execute Calendar Sync Function</li>
                <li>• Fetch Gmail Labels</li>
                <li>• List Gmail Messages</li>
                <li>• Test Google Calendar Edge Function</li>
                <li>• System Health Check</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Passed</span>
                <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                  {successCount}
                </Badge>
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Failed</span>
                <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
                  {failedCount}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-200">Test Results</h3>
            <div className="space-y-2">
              {results.map((result, index) => (
                <div
                  key={index}
                  className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getStatusIcon(result.status)}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {getCategoryIcon(result.category)}
                          <span className="text-sm font-medium text-gray-200">
                            {result.name}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{result.category}</p>
                        {result.message && (
                          <p className="text-xs text-gray-500">{result.message}</p>
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
                        View Data
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-900/50 rounded text-xs text-gray-400 overflow-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Add Calendar Test Components */}
      <div className="mt-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-200 mb-4">🔍 Calendar API Debugger</h3>
          <p className="text-sm text-gray-400 mb-4">
            Debug why events aren't being returned from Google Calendar. Tests different date ranges and calendars.
          </p>
          <CalendarDebugger />
        </div>
        
        <div>
          <h3 className="text-lg font-semibold text-gray-200 mb-4">Comprehensive E2E Test</h3>
          <p className="text-sm text-gray-400 mb-4">
            Run this test to sync your Google Calendar and verify everything is working correctly.
          </p>
          <CalendarE2ETest />
        </div>
        
        <div>
          <h3 className="text-lg font-semibold text-gray-200 mb-4">Database Events Viewer</h3>
          <p className="text-sm text-gray-400 mb-4">
            View the actual events stored in your database after syncing.
          </p>
          <CalendarDatabaseViewer />
        </div>
        
        <div>
          <h3 className="text-lg font-semibold text-gray-200 mb-4">Quick Sync Test</h3>
          <CalendarSyncTest />
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}