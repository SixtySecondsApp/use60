import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, ExternalLink, List, ArrowRight, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { googleApi } from '@/lib/api/googleIntegration';
import { googleTasksSync } from '@/lib/services/googleTasksSync';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

const GoogleTasksSync: React.FC = () => {
  const [showSetup, setShowSetup] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [setupStep, setSetupStep] = useState<'intro' | 'select-list' | 'complete'>('intro');
  const [availableLists, setAvailableLists] = useState<any[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [createNewList, setCreateNewList] = useState(false);
  const [newListName, setNewListName] = useState('Sixty Sales Tasks');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkConnection();
    checkOnboardingStatus();
  }, []);

  const checkConnection = async () => {
    try {
      const connected = await googleTasksSync.isConnected();
      setIsConnected(connected);
      
      // Only show setup if:
      // 1. Not connected AND
      // 2. Haven't seen onboarding AND
      // 3. Not currently in the process of connecting
      const hasSeenOnboarding = localStorage.getItem('googleTasksOnboardingSeen');
      const isConnecting = sessionStorage.getItem('googleTasksConnecting');
      
      if (!connected && !hasSeenOnboarding && !isConnecting) {
        setShowSetup(true);
      } else if (connected && !hasSeenOnboarding) {
        // If connected but haven't seen the success message, show it
        setShowSetup(true);
      }
    } catch (error) {
    }
  };

  const checkOnboardingStatus = () => {
    const seen = localStorage.getItem('googleTasksOnboardingSeen');
    setHasSeenOnboarding(!!seen);
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { authUrl } = await googleApi.initiateOAuth();
      
      // Store that we're expecting a callback
      sessionStorage.setItem('googleTasksConnecting', 'true');
      
      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      toast.error('Failed to connect to Google Tasks');
      setIsConnecting(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('googleTasksOnboardingSeen', 'true');
    setShowSetup(false);
    setHasSeenOnboarding(true);
  };

  const handleInitializeSync = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      setIsLoading(true);
      
      // Get available task lists
      const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'tasks', handlerAction: 'list-tasklists' }
      });
      
      if (error) throw error;
      
      const lists = data?.items || [];
      setAvailableLists(lists);
      
      // Check if user has a Business list or similar
      const businessList = lists.find((list: any) => 
        list.title.toLowerCase().includes('business') ||
        list.title.toLowerCase().includes('work') ||
        list.title.toLowerCase().includes('sales')
      );
      
      if (businessList) {
        setSelectedListId(businessList.id);
      } else if (lists.length > 0) {
        // Default to first list that's not the default
        const nonDefaultList = lists.find((list: any) => list.id !== '@default');
        setSelectedListId(nonDefaultList ? nonDefaultList.id : lists[0].id);
      }
      
      setSetupStep('select-list');
    } catch (error) {
      toast.error('Failed to load Google Task lists');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleFinalizeSetup = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      setIsLoading(true);
      
      let listId = selectedListId;
      let listTitle = '';
      
      if (createNewList) {
        // Create a new list
        const { data, error } = await supabase.functions.invoke('google-services-router', { body: { action: 'tasks', handlerAction: 'create-tasklist',
            title: newListName 
          }
        });
        
        if (error) throw error;
        listId = data.id;
        listTitle = data.title;
      } else {
        // Use selected existing list
        const selectedList = availableLists.find(l => l.id === listId);
        listTitle = selectedList?.title || 'Google Tasks';
      }
      
      // Store the selected list preference
      await googleTasksSync.setTaskListPreference(user.id, listId, listTitle);
      
      // Initialize sync with the selected list
      await googleTasksSync.initializeSync(user.id, listId);
      
      toast.success('Google Tasks sync initialized successfully');
      setSetupStep('complete');
    } catch (error) {
      toast.error('Failed to initialize Google Tasks sync');
    } finally {
      setIsLoading(false);
    }
  };

  // Check if we just came back from OAuth
  useEffect(() => {
    const wasConnecting = sessionStorage.getItem('googleTasksConnecting');
    if (wasConnecting) {
      sessionStorage.removeItem('googleTasksConnecting');
      checkConnection();
      
      // If now connected, move to list selection
      if (isConnected) {
        handleInitializeSync();
      }
    }
  }, [isConnected]);

  // Don't show if already seen onboarding (unless connected and first time)
  if (!showSetup) return null;
  if (hasSeenOnboarding && !isConnected) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <List className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Connect Google Tasks</h2>
              <p className="text-sm text-gray-400 mt-1">Sync your tasks across all your devices</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!isConnected && setupStep === 'intro' ? (
            <>
              {/* Benefits */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">Why Connect Google Tasks?</h3>
                <div className="grid gap-3">
                  <div className="flex gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white font-medium">Access tasks everywhere</p>
                      <p className="text-sm text-gray-400">Work with your tasks in Google Tasks app, Gmail, or any Google Workspace</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white font-medium">Bidirectional sync</p>
                      <p className="text-sm text-gray-400">Changes made here or in Google Tasks are automatically synced</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white font-medium">Never lose your tasks</p>
                      <p className="text-sm text-gray-400">Your tasks are securely backed up to your Google account</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">How It Works</h3>
                <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">1</div>
                    <div>
                      <p className="text-white font-medium">Connect your Google account</p>
                      <p className="text-sm text-gray-400">We'll request permission to access your Google Tasks</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">2</div>
                    <div>
                      <p className="text-white font-medium">Choose your task list</p>
                      <p className="text-sm text-gray-400">Select an existing list or create a new one for syncing</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">3</div>
                    <div>
                      <p className="text-white font-medium">Start working</p>
                      <p className="text-sm text-gray-400">Create and manage tasks from either platform - they'll stay in sync</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Task Mapping Info */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-white font-medium">Task Status Mapping</p>
                    <ul className="text-sm text-gray-300 space-y-1">
                      <li>• Not Started, In Progress → Google Tasks: "Needs Action"</li>
                      <li>• Completed → Google Tasks: "Completed"</li>
                      <li>• Task categories become Google Task Lists for organization</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Connect Button */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <Button
                  variant="ghost"
                  onClick={handleDismiss}
                  className="text-gray-400 hover:text-white"
                >
                  Skip for now
                </Button>
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isConnecting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      Connect Google Tasks
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : setupStep === 'select-list' ? (
            <>
              {/* List Selection */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">Choose Your Task List</h3>
                <p className="text-sm text-gray-400">Select which Google Task list you want to sync with this application:</p>
                
                <div className="space-y-3">
                  {availableLists.map((list) => (
                    <div 
                      key={list.id}
                      onClick={() => {
                        setSelectedListId(list.id);
                        setCreateNewList(false);
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedListId === list.id && !createNewList
                          ? 'bg-blue-500/10 border-blue-500'
                          : 'bg-gray-800/50 border-gray-700 hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selectedListId === list.id && !createNewList
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-gray-500'
                          }`}>
                            {selectedListId === list.id && !createNewList && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                          <div>
                            <p className="text-white font-medium">{list.title}</p>
                            {list.id === '@default' && (
                              <p className="text-xs text-gray-400">Default Google Tasks list</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Create New List Option */}
                  <div 
                    onClick={() => {
                      setCreateNewList(true);
                      setSelectedListId('');
                    }}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      createNewList
                        ? 'bg-blue-500/10 border-blue-500'
                        : 'bg-gray-800/50 border-gray-700 hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          createNewList
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-500'
                        }`}>
                          {createNewList ? (
                            <Check className="w-3 h-3 text-white" />
                          ) : (
                            <Plus className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="text-white font-medium">Create a new list</p>
                          <p className="text-xs text-gray-400">Create a dedicated list for this app</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {createNewList && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      New list name
                    </label>
                    <input
                      type="text"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter list name"
                    />
                  </div>
                )}
              </div>
              
              {/* Info about sync */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-white font-medium">How sync works:</p>
                    <ul className="text-sm text-gray-300 space-y-1">
                      <li>• Tasks in this list will sync bidirectionally</li>
                      <li>• Changes made here or in Google Tasks stay in sync</li>
                      <li>• You can still use other Google Task lists independently</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <Button
                  variant="ghost"
                  onClick={() => setSetupStep('intro')}
                  className="text-gray-400 hover:text-white"
                >
                  Back
                </Button>
                <Button
                  onClick={handleFinalizeSetup}
                  disabled={(!selectedListId && !createNewList) || (createNewList && !newListName) || isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Start Syncing
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : setupStep === 'complete' ? (
            <>
              {/* Connected State */}
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Google Tasks Connected!</h3>
                <p className="text-gray-400 mb-6">Your tasks are now syncing with Google Tasks</p>
                
                <div className="bg-gray-800/50 rounded-lg p-4 text-left space-y-3 mb-6">
                  <p className="text-white font-medium">What happens next:</p>
                  <ul className="text-sm text-gray-300 space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>Your existing tasks will sync to Google Tasks</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>New tasks created here appear in Google Tasks instantly</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>Tasks created in Google Tasks will appear here on next sync</span>
                    </li>
                  </ul>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <Button
                    onClick={handleDismiss}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Get Started
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open('https://tasks.google.com', '_blank')}
                    className="border-gray-600 text-gray-300 hover:bg-gray-800"
                  >
                    Open Google Tasks
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default GoogleTasksSync;