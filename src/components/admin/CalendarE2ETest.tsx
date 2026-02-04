import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { runComprehensiveCalendarTest } from '@/test-calendar-e2e';
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Calendar, 
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Database,
  Cloud,
  Monitor
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
}

export function CalendarE2ETest() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const navigate = useNavigate();

  const runTest = async () => {
    setIsRunning(true);
    setResults([]);
    setExpandedSteps(new Set());
    
    try {
      const testResults = await runComprehensiveCalendarTest();
      setResults(testResults);
    } catch (error: any) {
      setResults([{
        step: 'Test Execution',
        success: false,
        message: `Test failed: ${error.message}`,
        data: error
      }]);
    } finally {
      setIsRunning(false);
    }
  };

  const toggleStep = (index: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSteps(newExpanded);
  };

  const getStepIcon = (step: string) => {
    if (step.includes('Database')) return <Database className="w-4 h-4" />;
    if (step.includes('Google') || step.includes('Sync')) return <Cloud className="w-4 h-4" />;
    if (step.includes('Frontend')) return <Monitor className="w-4 h-4" />;
    return <Calendar className="w-4 h-4" />;
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const allPassed = results.length > 0 && failCount === 0;

  return (
    <Card className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Comprehensive Calendar E2E Test
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Tests sync, database storage, and frontend display
            </p>
          </div>
          <Button
            onClick={runTest}
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
                <RefreshCw className="w-4 h-4 mr-2" />
                Run E2E Test
              </>
            )}
          </Button>
        </div>

        {results.length > 0 && (
          <>
            {/* Summary */}
            <div className={`p-4 rounded-lg border ${
              allPassed 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-yellow-500/10 border-yellow-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {allPassed ? (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-yellow-500" />
                  )}
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      {allPassed ? '✨ All Tests Passed!' : '⚠️ Some Tests Failed'}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {successCount} passed, {failCount} failed
                    </div>
                  </div>
                </div>
                {allPassed && (
                  <Button
                    onClick={() => navigate('/calendar')}
                    className="bg-green-500 hover:bg-green-600"
                    size="sm"
                  >
                    View Calendar →
                  </Button>
                )}
              </div>
            </div>

            {/* Test Results */}
            <div className="space-y-2">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`border rounded-lg overflow-hidden transition-all ${
                    result.success
                      ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
                      : 'border-red-500/30 bg-red-500/5'
                  }`}
                >
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50"
                    onClick={() => result.data && toggleStep(index)}
                  >
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      {getStepIcon(result.step)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-200">{result.step}</div>
                      <div className="text-sm text-gray-400">{result.message}</div>
                    </div>
                    {result.data && (
                      <div className="text-gray-500">
                        {expandedSteps.has(index) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                    )}
                  </div>
                  
                  {result.data && expandedSteps.has(index) && (
                    <div className="border-t border-gray-700 p-3 bg-gray-950">
                      <pre className="text-xs text-gray-400 overflow-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            {allPassed && (
              <div className="flex gap-2 pt-4 border-t border-gray-700">
                <Button
                  onClick={() => navigate('/calendar')}
                  className="bg-green-500 hover:bg-green-600"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Go to Calendar
                </Button>
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  className="border-gray-600 hover:bg-gray-700"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Page
                </Button>
              </div>
            )}
          </>
        )}

        {results.length === 0 && !isRunning && (
          <div className="text-center py-12 text-gray-400">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <h4 className="text-lg font-medium text-gray-300 mb-2">
              Ready to Test Calendar Sync
            </h4>
            <p className="text-sm mb-4 max-w-md mx-auto">
              This comprehensive test will sync your Google Calendar, verify database storage, 
              and ensure events display correctly on the frontend.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto text-xs">
              <div className="text-center">
                <Cloud className="w-8 h-8 mx-auto mb-1 text-blue-400" />
                <span>Google Sync</span>
              </div>
              <div className="text-center">
                <Database className="w-8 h-8 mx-auto mb-1 text-green-400" />
                <span>Database</span>
              </div>
              <div className="text-center">
                <Monitor className="w-8 h-8 mx-auto mb-1 text-purple-400" />
                <span>Frontend</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}