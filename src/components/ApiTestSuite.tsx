import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  FileText,
  Download,
  RotateCcw,
  Zap,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface TestResult {
  entity: string;
  operation: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  message?: string;
  duration?: number;
  data?: any;
}

interface ApiTestSuiteProps {
  apiKey: string | null;
  onClose?: () => void;
}

export const ApiTestSuite: React.FC<ApiTestSuiteProps> = ({ apiKey, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [createdIds, setCreatedIds] = useState<Record<string, string>>({});
  const cleanupDataRef = useRef<Record<string, string>>({});

  const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Cleanup any remaining test data when component unmounts
      const remainingData = cleanupDataRef.current;
      if (Object.keys(remainingData).length > 0) {
        // Perform cleanup without waiting (fire and forget)
        Object.entries(remainingData).forEach(async ([entity, id]) => {
          if (id && apiKey) {
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/api-v1-${entity}/${id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY)}`,
                  'X-API-Key': apiKey,
                },
              });
            } catch (error) {
            }
          }
        });
      }
    };
  }, [apiKey, SUPABASE_URL]);

  // Test data generators
  const generateTestData = (entity: string) => {
    const timestamp = Date.now();
    const testData: Record<string, any> = {
      contacts: {
        first_name: `Test`,
        last_name: `Contact_${timestamp}`,
        email: `test_${timestamp}@example.com`,
        phone: '+1234567890',
        title: 'Test Contact'
      },
      companies: {
        name: `Test Company ${timestamp}`,
        domain: `test${timestamp}.com`,
        industry: 'Technology',
        size: 'medium',
        website: `https://test${timestamp}.com`
      },
      deals: {
        name: `Test Deal ${timestamp}`,
        company: `Test Company ${timestamp}`,
        contact_name: 'Test Contact',
        contact_email: `test_${timestamp}@example.com`,
        value: Math.floor(Math.random() * 100000) + 10000,
        expected_close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        // Remove stage_id - let the backend handle default assignment
      },
      tasks: {
        title: `Test Task ${timestamp}`,
        description: 'This is a test task created by API test suite',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        priority: 'high',
        status: 'pending',
        task_type: 'follow_up',
        contact_email: `test_${timestamp}@example.com`
      },
      meetings: {
        title: `Test Meeting ${timestamp}`,
        start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 30,
        summary: 'Test meeting created by API test suite',
        owner_email: 'test@example.com',
        fathom_recording_id: `test_${timestamp}`
      },
      activities: {
        subject: `Test Activity ${timestamp}`,
        type: 'outbound',
        client_name: `Test Client ${timestamp}`,
        sales_rep: 'test@example.com',
        details: 'Test activity created by API test suite',
        date: new Date().toISOString(),
        status: 'completed'
      }
    };

    return testData[entity];
  };

  const generateUpdateData = (entity: string) => {
    const timestamp = Date.now();
    const updateData: Record<string, any> = {
      contacts: { phone: '+9876543210', title: 'Updated Title' },
      companies: { size: 'large', industry: 'Finance' },
      deals: { value: 75000 },
      tasks: { status: 'completed', completed: true },
      meetings: { duration_minutes: 45, summary: 'Updated meeting summary' },
      activities: { status: 'completed', details: 'Updated activity details' }
    };

    return updateData[entity];
  };

  const entities = ['contacts', 'companies', 'deals', 'tasks', 'meetings', 'activities'];

  const runTest = async (entity: string, operation: string, data?: any, id?: string): Promise<TestResult> => {
    const startTime = Date.now();
    const endpoint = `${SUPABASE_URL}/functions/v1/api-v1-${entity}${id ? `/${id}` : ''}`;
    
    let method = 'GET';
    if (operation === 'create') method = 'POST';
    if (operation === 'update') method = 'PUT';
    if (operation === 'delete') method = 'DELETE';

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY)}`,
          'X-API-Key': apiKey || '',
        },
        body: (method === 'POST' || method === 'PUT') ? JSON.stringify(data) : undefined,
      });

      const responseData = await response.json();
      const duration = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(responseData.error || `HTTP ${response.status}`);
      }

      return {
        entity,
        operation,
        status: 'success',
        message: `${operation} successful`,
        duration,
        data: responseData
      };
    } catch (error: any) {
      return {
        entity,
        operation,
        status: 'failed',
        message: error.message,
        duration: Date.now() - startTime
      };
    }
  };

  // Cleanup function to delete any remaining test data
  const cleanupTestData = async (testIds: Record<string, string>) => {
    const cleanupResults: string[] = [];
    
    for (const [entity, id] of Object.entries(testIds)) {
      if (id) {
        try {
          const endpoint = `${SUPABASE_URL}/functions/v1/api-v1-${entity}/${id}`;
          const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY)}`,
              'X-API-Key': apiKey || '',
            },
          });

          if (response.ok) {
            cleanupResults.push(`✅ Cleaned up ${entity}: ${id.substring(0, 8)}...`);
          } else {
            cleanupResults.push(`⚠️ Failed to cleanup ${entity}: ${id.substring(0, 8)}...`);
          }
        } catch (error) {
          cleanupResults.push(`❌ Error cleaning ${entity}: ${error}`);
        }
      }
    }
    
    return cleanupResults;
  };

  const runCompleteTestSuite = async () => {
    if (!apiKey) {
      toast.error('Please generate an API key first');
      return;
    }

    setIsRunning(true);
    setResults([]);
    setProgress(0);
    setCreatedIds({});

    const totalTests = entities.length * 5; // list, create, get, update, delete
    let completedTests = 0;
    const allResults: TestResult[] = [];
    const testDataToCleanup: Record<string, string> = {};

    for (const entity of entities) {
      // Test 1: List all records
      setResults(prev => [...prev, { entity, operation: 'list', status: 'running' }]);
      const listResult = await runTest(entity, 'list');
      allResults.push(listResult);
      setResults([...allResults]);
      completedTests++;
      setProgress((completedTests / totalTests) * 100);

      // Test 2: Create a record
      setResults(prev => [...prev, { entity, operation: 'create', status: 'running' }]);
      const createData = generateTestData(entity);
      const createResult = await runTest(entity, 'create', createData);
      allResults.push(createResult);
      setResults([...allResults]);
      
      if (createResult.status === 'success' && createResult.data?.data?.id) {
        const newId = createResult.data.data.id;
        setCreatedIds(prev => ({ ...prev, [entity]: newId }));
        testDataToCleanup[entity] = newId; // Track for cleanup
        cleanupDataRef.current[entity] = newId; // Also track in ref for unmount cleanup
        
        completedTests++;
        setProgress((completedTests / totalTests) * 100);

        // Test 3: Get single record
        setResults(prev => [...prev, { entity, operation: 'get', status: 'running' }]);
        const getResult = await runTest(entity, 'get', null, newId);
        allResults.push(getResult);
        setResults([...allResults]);
        completedTests++;
        setProgress((completedTests / totalTests) * 100);

        // Test 4: Update record
        setResults(prev => [...prev, { entity, operation: 'update', status: 'running' }]);
        const updateData = generateUpdateData(entity);
        const updateResult = await runTest(entity, 'update', updateData, newId);
        allResults.push(updateResult);
        setResults([...allResults]);
        completedTests++;
        setProgress((completedTests / totalTests) * 100);

        // Test 5: Delete record
        setResults(prev => [...prev, { entity, operation: 'delete', status: 'running' }]);
        const deleteResult = await runTest(entity, 'delete', null, newId);
        allResults.push(deleteResult);
        setResults([...allResults]);
        completedTests++;
        setProgress((completedTests / totalTests) * 100);
        
        // If delete was successful, remove from cleanup lists
        if (deleteResult.status === 'success') {
          delete testDataToCleanup[entity];
          delete cleanupDataRef.current[entity];
        }
      } else {
        // Skip remaining tests if create failed
        completedTests += 3;
        setProgress((completedTests / totalTests) * 100);
        
        allResults.push(
          { entity, operation: 'get', status: 'failed', message: 'Skipped due to create failure' },
          { entity, operation: 'update', status: 'failed', message: 'Skipped due to create failure' },
          { entity, operation: 'delete', status: 'failed', message: 'Skipped due to create failure' }
        );
        setResults([...allResults]);
      }

      // Small delay between entities
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Final cleanup: Delete any remaining test data
    const remainingCleanup = Object.keys(testDataToCleanup);
    if (remainingCleanup.length > 0) {
      // Add cleanup status to results
      allResults.push({
        entity: 'cleanup',
        operation: 'cleanup',
        status: 'running',
        message: `Cleaning up ${remainingCleanup.length} remaining test records...`
      });
      setResults([...allResults]);
      
      const cleanupResults = await cleanupTestData(testDataToCleanup);
      
      // Update cleanup result
      allResults[allResults.length - 1] = {
        entity: 'cleanup',
        operation: 'cleanup',
        status: 'success',
        message: `Cleanup completed: ${cleanupResults.join(', ')}`,
        data: { cleanupResults }
      };
      setResults([...allResults]);
      
      if (cleanupResults.length > 0) {
        toast.info(`🧹 Cleaned up ${cleanupResults.filter(r => r.includes('✅')).length} test records`);
      }
      
      // Clear the cleanup ref since we've finished cleanup
      cleanupDataRef.current = {};
    }

    setIsRunning(false);
    
    const successCount = allResults.filter(r => r.status === 'success').length;
    const failedCount = allResults.filter(r => r.status === 'failed').length;
    
    if (failedCount === 0) {
      toast.success(`All ${totalTests} tests passed successfully! ${remainingCleanup.length > 0 ? '(Test data cleaned up)' : ''}`);
    } else {
      toast.warning(`${successCount} tests passed, ${failedCount} tests failed ${remainingCleanup.length > 0 ? '(Test data cleaned up)' : ''}`);
    }
  };

  const downloadResults = () => {
    const report = {
      timestamp: new Date().toISOString(),
      apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'No API Key',
      summary: {
        total: results.length,
        success: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'failed').length,
        avgDuration: results.reduce((acc, r) => acc + (r.duration || 0), 0) / results.length
      },
      results: results
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-test-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetTests = () => {
    setResults([]);
    setProgress(0);
    setCreatedIds({});
    cleanupDataRef.current = {}; // Also clear cleanup data
  };

  const manualCleanup = async () => {
    const currentCleanupData = { ...cleanupDataRef.current };
    if (Object.keys(currentCleanupData).length === 0) {
      toast.info('No test data to clean up');
      return;
    }

    try {
      const cleanupResults = await cleanupTestData(currentCleanupData);
      cleanupDataRef.current = {}; // Clear after cleanup
      
      const successCount = cleanupResults.filter(r => r.includes('✅')).length;
      if (successCount > 0) {
        toast.success(`🧹 Manually cleaned up ${successCount} test records`);
      } else {
        toast.warning('⚠️ Some cleanup operations may have failed');
      }
    } catch (error) {
      toast.error('Failed to perform manual cleanup');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-400" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getOperationBadgeClass = (operation: string) => {
    switch (operation) {
      case 'list':
      case 'get':
        return 'bg-blue-500/20 text-blue-400';
      case 'create':
        return 'bg-green-500/20 text-green-400';
      case 'update':
        return 'bg-amber-500/20 text-amber-400';
      case 'delete':
        return 'bg-red-500/20 text-red-400';
      case 'cleanup':
        return 'bg-purple-500/20 text-purple-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900/80 dark:to-gray-900/40 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-800/50 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500/20 to-purple-600/10 backdrop-blur-sm rounded-xl border border-purple-500/20">
            <Zap className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-100">API Test Suite</h3>
            <p className="text-sm text-gray-400">Comprehensive testing for all endpoints</p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="hover:bg-gray-800/50">
            ✕
          </Button>
        )}
      </div>

      {!apiKey && (
        <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-sm text-amber-400">⚠️ Please generate an API key first to run tests</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3 mb-6">
        <Button
          onClick={runCompleteTestSuite}
          disabled={isRunning || !apiKey}
          className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Running Tests...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Run Complete Test Suite
            </>
          )}
        </Button>
        
        <Button
          variant="outline"
          onClick={resetTests}
          disabled={isRunning}
          className="bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/50"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
        
        {results.length > 0 && (
          <Button
            variant="outline"
            onClick={downloadResults}
            className="bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/50"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Report
          </Button>
        )}

        {Object.keys(cleanupDataRef.current).length > 0 && (
          <Button
            variant="outline"
            onClick={manualCleanup}
            disabled={isRunning}
            className="bg-red-800/50 hover:bg-red-700/50 border-red-700/50 text-red-300 hover:text-red-200"
            title={`Clean up ${Object.keys(cleanupDataRef.current).length} test records`}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Cleanup ({Object.keys(cleanupDataRef.current).length})
          </Button>
        )}
      </div>

      {/* Progress Bar */}
      {isRunning && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Testing Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-gray-700/50" />
        </div>
      )}

      {/* Test Results */}
      {results.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {results.map((result, index) => (
              <motion.div
                key={`${result.entity}-${result.operation}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-between p-3 bg-gray-800/30 backdrop-blur-sm rounded-lg border border-gray-700/50"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(result.status)}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200 capitalize">{result.entity}</span>
                    <Badge className={cn("text-xs", getOperationBadgeClass(result.operation))}>
                      {result.operation.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {result.duration && (
                    <span className="text-xs text-gray-400">{result.duration}ms</span>
                  )}
                  {result.message && result.status === 'failed' && (
                    <span className="text-xs text-red-400 max-w-xs truncate">{result.message}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Summary */}
      {results.length > 0 && !isRunning && (
        <div className="mt-6 p-4 bg-gray-800/30 backdrop-blur-sm rounded-lg border border-gray-700/50">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-400">
                {results.filter(r => r.status === 'success').length}
              </div>
              <div className="text-xs text-gray-400">Passed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">
                {results.filter(r => r.status === 'failed').length}
              </div>
              <div className="text-xs text-gray-400">Failed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-300">
                {Math.round(results.reduce((acc, r) => acc + (r.duration || 0), 0) / results.length)}ms
              </div>
              <div className="text-xs text-gray-400">Avg Time</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};