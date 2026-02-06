import { useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useOrgStore } from '@/lib/stores/orgStore';

/**
 * Fathom Token Test Component
 *
 * Purpose: Quick UI to test if Fathom OAuth token is valid
 * Usage: Add to Integrations page or admin panel
 */
export function FathomTokenTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  const testToken = async () => {
    setTesting(true);
    setResult(null);

    try {
      // Get the current session to include authorization header
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated - please sign in again');
      }

      const { data, error } = await supabase.functions.invoke('test-fathom-token', {
        body: { org_id: activeOrgId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        throw error;
      }
      setResult(data);

      if (data.success) {
        toast.success('Fathom token valid', {
          description: `Meetings found: ${(data.api_test?.meetings_count || 0).toLocaleString()}`,
        });
      } else {
        toast.error('Fathom token invalid', {
          description: data.message || data.recommendation || 'Reconnect your Fathom account',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setResult({
        success: false,
        error: errorMessage,
        details: error
      });
      toast.error('Fathom token test failed', { description: errorMessage });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Test Button */}
      <button
        onClick={testToken}
        disabled={testing}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-wait transition-colors font-medium"
      >
        {testing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Testing Connection...
          </span>
        ) : (
          '🧪 Test Fathom Connection'
        )}
      </button>

      {/* Results Display */}
      {result && (
        <div className={`p-4 rounded-lg border ${
          result.success
            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
            : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
        } text-gray-900 dark:text-gray-100`}>
          {/* Success/Failure Header */}
          <div className="flex items-center gap-2 mb-3">
            {result.success ? (
              <>
                <span className="text-2xl">✅</span>
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                  Connection Successful
                </h3>
              </>
            ) : (
              <>
                <span className="text-2xl">❌</span>
                <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
                  Connection Failed
                </h3>
              </>
            )}
          </div>

          {/* Integration Details */}
          {result.integration && (
            <div className="mb-3 space-y-1 text-sm">
              <p><strong>Email:</strong> {result.integration.email}</p>
              <p><strong>Expires:</strong> {new Date(result.integration.expires_at).toLocaleString()}</p>
              <p><strong>Scopes:</strong> {result.integration.scopes?.join(', ')}</p>
            </div>
          )}

          {/* Fathom Account Info */}
          {result.fathom_account && (
            <div className="mb-3 space-y-1 text-sm">
              <p className="font-semibold text-blue-700 dark:text-blue-300">Fathom Account:</p>
              <p><strong>Email:</strong> {result.fathom_account.email || 'Unknown'}</p>
              {result.fathom_account.name && <p><strong>Name:</strong> {result.fathom_account.name}</p>}
              {result.fathom_account.team_name && <p><strong>Team:</strong> {result.fathom_account.team_name}</p>}
              {result.fathom_account.role && <p><strong>Role:</strong> {result.fathom_account.role}</p>}
            </div>
          )}

          {/* Account Error - only show as warning if meetings also failed */}
          {result.fathom_account_error && (
            <div className={`mb-3 p-2 rounded border ${
              result.api_test?.meetings_count > 0
                ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
            }`}>
              <p className={`text-xs ${
                result.api_test?.meetings_count > 0
                  ? 'text-gray-500 dark:text-gray-400'
                  : 'text-yellow-700 dark:text-yellow-300'
              }`}>
                <strong>{result.api_test?.meetings_count > 0 ? 'ℹ️' : '⚠️'} Note:</strong>{' '}
                {result.api_test?.meetings_count > 0
                  ? 'The /me endpoint is not available for your account type (this is normal and doesn\'t affect syncing).'
                  : `Could not fetch Fathom account info: ${result.fathom_account_error}`
                }
              </p>
            </div>
          )}

          {/* API Test Results */}
          {result.api_test && (
            <div className="mb-3 space-y-1 text-sm">
              <p><strong>Status:</strong> {result.api_test.status}</p>
              <p><strong>Meetings Found:</strong> {result.api_test.meetings_count}</p>
              <p><strong>Has More:</strong> {result.api_test.has_more ? 'Yes' : 'No'}</p>
              {result.api_test.first_meeting && (
                <p><strong>Most Recent:</strong> {result.api_test.first_meeting.title} ({new Date(result.api_test.first_meeting.date).toLocaleDateString()})</p>
              )}
            </div>
          )}

          {/* Diagnostic Warning */}
          {result.diagnostic && (
            <div className="mb-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded border border-orange-200 dark:border-orange-800">
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                ⚠️ {result.diagnostic.warning}
              </p>
              <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                💡 {result.diagnostic.suggestion}
              </p>
            </div>
          )}

          {/* Error Details */}
          {result.error && (
            <div className="mb-3 text-sm">
              <p className="font-semibold text-red-700 dark:text-red-300">Error:</p>
              <pre className="mt-1 p-2 rounded bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 whitespace-pre-wrap overflow-auto max-h-48">
                {JSON.stringify(result.error, null, 2)}
              </pre>
            </div>
          )}

          {/* Recommendation */}
          {result.recommendation && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>💡 Recommendation:</strong> {result.recommendation}
              </p>
            </div>
          )}

          {/* Raw JSON Toggle */}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
              Show Raw Response
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto max-h-64 text-gray-900 dark:text-gray-100">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Help Text */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        <p>
          Click the button above to test if your Fathom OAuth token is valid and working with the Fathom API.
        </p>
        <p className="mt-2">
          If the test fails with a 401 error, you'll need to reconnect your Fathom account to generate fresh tokens.
        </p>
      </div>
    </div>
  );
}
