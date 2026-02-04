import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/clientV2';
import { calendarService } from '@/lib/services/calendarService';
import { Loader2, CheckCircle, XCircle, Calendar, RefreshCw } from 'lucide-react';

interface TestStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  details?: any;
}

export function CalendarSyncTest() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<TestStep[]>([]);

  const runTest = async () => {
    setIsRunning(true);
    setSteps([]);
    const newSteps: TestStep[] = [];

    const addStep = (step: TestStep) => {
      newSteps.push(step);
      setSteps([...newSteps]);
    };

    try {
      // Step 1: Check authentication
      addStep({ name: 'Checking authentication', status: 'running' });
      const { data: userData, error: authError } = await supabase.auth.getUser();
      
      if (authError || !userData?.user) {
        newSteps[0] = { 
          name: 'Checking authentication', 
          status: 'error', 
          message: 'Not authenticated' 
        };
        setSteps([...newSteps]);
        return;
      }
      
      newSteps[0] = { 
        name: 'Checking authentication', 
        status: 'success', 
        message: `Authenticated as ${userData.user.email}` 
      };
      setSteps([...newSteps]);

      // Step 2: Check Google integration
      addStep({ name: 'Checking Google integration', status: 'running' });
      const { data: integration, error: integrationError } = await supabase
        .from('google_integrations')
        .select('*')
        .eq('user_id', userData.user.id)
        .eq('is_active', true)
        .single();
      
      if (integrationError || !integration) {
        newSteps[1] = { 
          name: 'Checking Google integration', 
          status: 'error', 
          message: 'No active Google integration found. Please connect your Google account.' 
        };
        setSteps([...newSteps]);
        return;
      }
      
      newSteps[1] = { 
        name: 'Checking Google integration', 
        status: 'success', 
        message: `Connected to ${integration.email}` 
      };
      setSteps([...newSteps]);

      // Step 3: Sync calendar
      addStep({ name: 'Syncing calendar events', status: 'running' });
      const syncResult = await calendarService.syncCalendarEvents('sync-incremental', 'primary');
      
      if (syncResult.error) {
        newSteps[2] = { 
          name: 'Syncing calendar events', 
          status: 'error', 
          message: syncResult.error 
        };
        setSteps([...newSteps]);
        return;
      }
      
      newSteps[2] = { 
        name: 'Syncing calendar events', 
        status: 'success', 
        message: `Created ${syncResult.eventsCreated} events, Updated ${syncResult.eventsUpdated} events`,
        details: syncResult
      };
      setSteps([...newSteps]);

      // Step 4: Fetch events from database
      addStep({ name: 'Fetching events from database', status: 'running' });
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      
      const events = await calendarService.getEventsFromDB(startDate, endDate);
      
      newSteps[3] = { 
        name: 'Fetching events from database', 
        status: 'success', 
        message: `Found ${events.length} events in database`,
        details: events.slice(0, 5).map(e => ({
          title: e.title,
          start: e.start.toLocaleString(),
          end: e.end?.toLocaleString()
        }))
      };
      setSteps([...newSteps]);

      // Step 5: Test database function
      addStep({ name: 'Testing database function', status: 'running' });
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('get_calendar_events_in_range', {
        p_user_id: userData.user.id,
        p_start_date: startDate.toISOString(),
        p_end_date: endDate.toISOString(),
        p_calendar_ids: null,
      });
      
      if (rpcError) {
        newSteps[4] = { 
          name: 'Testing database function', 
          status: 'error', 
          message: rpcError.message 
        };
      } else {
        newSteps[4] = { 
          name: 'Testing database function', 
          status: 'success', 
          message: `Function returned ${rpcData?.length || 0} events` 
        };
      }
      setSteps([...newSteps]);

      // Step 6: Check calendar record
      addStep({ name: 'Checking calendar record', status: 'running' });
      const { data: calendar, error: calendarError } = await (supabase as any)
        .from('calendar_calendars')
        .select('*')
        .eq('user_id', userData.user.id)
        .single();
      
      if (calendarError || !calendar) {
        newSteps[5] = { 
          name: 'Checking calendar record', 
          status: 'error', 
          message: 'No calendar record found' 
        };
      } else {
        newSteps[5] = { 
          name: 'Checking calendar record', 
          status: 'success', 
          message: `Calendar "${(calendar as any).name}" configured`,
          details: {
            id: (calendar as any).id,
            isPrimary: (calendar as any).is_primary,
            historicalSyncCompleted: (calendar as any).historical_sync_completed
          }
        };
      }
      setSteps([...newSteps]);

    } catch (error: any) {
      addStep({ 
        name: 'Unexpected error', 
        status: 'error', 
        message: error.message 
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: TestStep['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <div className="w-4 h-4" />;
    }
  };

  return (
    <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Calendar Sync Test</h3>
          </div>
          <Button
            onClick={runTest}
            disabled={isRunning}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Test...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Run Test
              </>
            )}
          </Button>
        </div>

        {steps.length > 0 && (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-gray-100 dark:bg-gray-900 rounded">
                {getStatusIcon(step.status)}
                <div className="flex-1">
                  <div className="font-medium text-gray-200">{step.name}</div>
                  {step.message && (
                    <div className="text-sm text-gray-400 mt-1">{step.message}</div>
                  )}
                  {step.details && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                        View Details
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-950 rounded text-xs text-gray-400 overflow-auto">
                        {JSON.stringify(step.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {steps.length === 0 && !isRunning && (
          <div className="text-center py-8 text-gray-400">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p>Click "Run Test" to test calendar sync functionality</p>
            <p className="text-sm mt-2">This will sync your Google Calendar events and verify the database connection</p>
          </div>
        )}
      </div>
    </Card>
  );
}