import { supabase } from '@/lib/supabase/clientV2';
import { Task } from '@/lib/database/models';

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string; // RFC3339 date (date only, no time)
  position?: string;
  parent?: string;
  deleted?: boolean;
  completed?: string; // RFC3339 timestamp
  updated: string; // RFC3339 timestamp
  etag: string;
}

export interface GoogleTaskList {
  id: string;
  title: string;
  etag: string;
  updated: string;
}

export interface SyncConflict {
  id: string;
  task_id?: string;
  google_task_id?: string;
  google_list_id?: string;
  conflict_type: 'update_conflict' | 'delete_conflict' | 'create_duplicate';
  local_data?: any;
  google_data?: any;
  resolved: boolean;
}

export interface SyncResult {
  success: boolean;
  tasksCreated: number;
  tasksUpdated: number;
  tasksDeleted: number;
  conflicts: SyncConflict[];
  error?: string;
}

export interface ListConfig {
  id: string;
  google_list_id: string;
  list_title: string;
  sync_direction: 'bidirectional' | 'to_google' | 'from_google';
  is_primary: boolean;
  priority_filter: string[];
  task_categories: string[];
  status_filter: string[];
  auto_create_in_list: boolean;
  sync_enabled: boolean;
}

export class GoogleTasksSyncService {
  private static instance: GoogleTasksSyncService;

  private constructor() {}

  static getInstance(): GoogleTasksSyncService {
    if (!GoogleTasksSyncService.instance) {
      GoogleTasksSyncService.instance = new GoogleTasksSyncService();
    }
    return GoogleTasksSyncService.instance;
  }

  /**
   * Sync a single task immediately when created
   */
  async syncTaskImmediately(task: Task, userId: string): Promise<void> {
    try {
      // Check if sync is enabled
      const { data: syncStatus } = await supabase
        .from('google_tasks_sync_status')
        .select('is_connected')
        .eq('user_id', userId)
        .single();
      
      if (!syncStatus?.is_connected) return;

      // Get the appropriate list for this task
      const targetList = await this.getTargetListForTask(task, userId);
      if (!targetList) return;

      // Create the task in Google
      const googleTask = await this.createGoogleTask(task, targetList, userId);
      
      if (googleTask) {
        // Update the local task with Google ID
        await supabase
          .from('tasks')
          .update({
            google_task_id: googleTask.id,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString()
          })
          .eq('id', task.id);
      }
    } catch (error) {
      // Don't throw - we don't want to break task creation if sync fails
    }
  }

  /**
   * Sync task update immediately
   */
  async syncTaskUpdateImmediately(taskId: string, userId: string): Promise<void> {
    try {
      // Check if sync is enabled
      const { data: syncStatus } = await supabase
        .from('google_tasks_sync_status')
        .select('is_connected')
        .eq('user_id', userId)
        .single();
      
      if (!syncStatus?.is_connected) return;

      // Get the task with Google ID
      const { data: task } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (!task || !task.google_task_id) return;

      // Get the list this task belongs to
      const { data: mapping } = await supabase
        .from('google_tasks_mappings')
        .select('google_list_id')
        .eq('task_id', taskId)
        .single();

      if (!mapping) return;

      // Update the task in Google
      await this.updateGoogleTask(task, mapping.google_list_id, userId);
      
      // Update sync status
      await supabase
        .from('tasks')
        .update({
          sync_status: 'synced',
          last_synced_at: new Date().toISOString()
        })
        .eq('id', taskId);
    } catch (error) {
    }
  }

  /**
   * Get target Google list for a task based on priority and configuration
   */
  private async getTargetListForTask(task: Task, userId: string): Promise<string | null> {
    // Get list configurations
    const { data: configs } = await supabase
      .from('google_tasks_list_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('sync_enabled', true);

    if (!configs || configs.length === 0) {
      // Fallback to default list
      const selectedList = await this.getSelectedTaskList(userId);
      return selectedList?.id || '@default';
    }

    // Find matching list based on priority
    for (const config of configs) {
      if (config.priority_filter?.includes(task.priority)) {
        return config.google_list_id;
      }
    }

    // Use primary list as fallback
    const primaryConfig = configs.find(c => c.is_primary);
    return primaryConfig?.google_list_id || '@default';
  }

  /**
   * Create a task in Google Tasks
   */
  private async createGoogleTask(task: Task, listId: string, userId: string): Promise<GoogleTask | null> {
    try {
      const response = await supabase.functions.invoke('google-tasks-api', {
        body: {
          action: 'createTask',
          taskListId: listId,
          task: {
            title: task.title,
            notes: task.description || task.notes,
            due: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] + 'T00:00:00.000Z' : undefined,
            status: task.status === 'completed' ? 'completed' : 'needsAction'
          }
        }
      });

      if (response.error) throw response.error;
      
      // Store the mapping
      await supabase
        .from('google_tasks_mappings')
        .insert({
          task_id: task.id,
          google_task_id: response.data.id,
          google_list_id: listId,
          user_id: userId
        });

      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update a task in Google Tasks
   */
  private async updateGoogleTask(task: Task, listId: string, userId: string): Promise<void> {
    try {
      await supabase.functions.invoke('google-tasks-api', {
        body: {
          action: 'updateTask',
          taskListId: listId,
          taskId: task.google_task_id,
          task: {
            title: task.title,
            notes: task.description || task.notes,
            due: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] + 'T00:00:00.000Z' : undefined,
            status: task.status === 'completed' ? 'completed' : 'needsAction'
          }
        }
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Store user's task list preference
   */
  async setTaskListPreference(userId: string, listId: string, listTitle: string): Promise<void> {
    try {
      // Store the preference in local storage for quick access
      localStorage.setItem('googleTasksListId', listId);
      localStorage.setItem('googleTasksListTitle', listTitle);
      
      // Store in sync status table
      await supabase
        .from('google_tasks_sync_status')
        .update({
          selected_list_id: listId,
          selected_list_title: listTitle
        })
        .eq('user_id', userId);
      
      // Store in database for persistence
      await supabase
        .from('google_task_lists')
        .upsert({
          google_list_id: listId,
          title: listTitle,
          is_default: true,
          etag: '',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'google_list_id'
        });
        
      // Set other lists as non-default
      await supabase
        .from('google_task_lists')
        .update({ is_default: false })
        .neq('google_list_id', listId);
        
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get user's selected task list
   */
  async getSelectedTaskList(userId?: string): Promise<{ id: string; title: string } | null> {
    try {
      // First check local storage
      const storedId = localStorage.getItem('googleTasksListId');
      const storedTitle = localStorage.getItem('googleTasksListTitle');
      
      if (storedId && storedTitle) {
        return { id: storedId, title: storedTitle };
      }
      
      // If userId provided, check sync status table
      if (userId) {
        const { data: syncStatus } = await supabase
          .from('google_tasks_sync_status')
          .select('selected_list_id, selected_list_title')
          .eq('user_id', userId)
          .single();
          
        if (syncStatus?.selected_list_id && syncStatus?.selected_list_title) {
          // Cache in local storage
          localStorage.setItem('googleTasksListId', syncStatus.selected_list_id);
          localStorage.setItem('googleTasksListTitle', syncStatus.selected_list_title);
          return { id: syncStatus.selected_list_id, title: syncStatus.selected_list_title };
        }
      }
      
      // Fall back to database default list
      const { data } = await supabase
        .from('google_task_lists')
        .select('google_list_id, title')
        .eq('is_default', true)
        .single();
        
      if (data) {
        return { id: data.google_list_id, title: data.title };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Initialize Google Tasks sync for a user
   * Creates default task list mappings
   */
  async initializeSync(userId: string, listId?: string): Promise<void> {
    try {
      // If listId provided, use that specific list
      if (listId) {
        // Store the task list in our database
        const { data: listData } = await supabase.functions.invoke('google-services-router', {
          body: { action: 'tasks', handlerAction: 'list-tasklists' }
        });
        
        const taskList = listData?.items?.find((list: GoogleTaskList) => list.id === listId);
        if (taskList) {
          await this.storeTaskList(taskList, true);
        }
      } else {
        // Get or create sync status
        const { data, error } = await supabase.functions.invoke('google-services-router', {
          body: { action: 'tasks', handlerAction: 'list-tasklists' }
        });

        if (error) throw error;

        const taskLists = data.items || [];
        
        // Find or create default list
        const defaultList = taskLists.find((list: GoogleTaskList) => 
          list.title === 'Sixty Sales Tasks' || list.id === '@default'
        );

        if (defaultList) {
          // Store the task list in our database
          await this.storeTaskList(defaultList, true);
        }
      }

      // Initialize sync status
      await supabase.rpc('get_or_create_sync_status', { p_user_id: userId });
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all list configurations for a user
   */
  async getListConfigs(userId: string): Promise<ListConfig[]> {
    try {
      const { data, error } = await supabase
        .from('google_tasks_list_configs')
        .select('*')
        .eq('user_id', userId)
        .eq('sync_enabled', true)
        .order('is_primary', { ascending: false })
        .order('display_order');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      return [];
    }
  }
  
  /**
   * Determine which lists a task should sync to based on priority
   */
  getTargetListsForTask(task: Task, configs: ListConfig[]): ListConfig[] {
    const targetLists: ListConfig[] = [];
    
    for (const config of configs) {
      // Check priority filter
      if (config.priority_filter && config.priority_filter.length > 0) {
        if (!task.priority || !config.priority_filter.includes(task.priority)) {
          continue; // Skip this list if priority doesn't match
        }
      }
      
      // Check status filter
      if (config.status_filter && config.status_filter.length > 0) {
        if (!task.status || !config.status_filter.includes(task.status)) {
          continue;
        }
      }
      
      // If we get here, task matches this list's criteria
      targetLists.push(config);
    }
    
    // If no lists matched and we have a primary list, use that
    if (targetLists.length === 0) {
      const primaryList = configs.find(c => c.is_primary);
      if (primaryList) {
        targetLists.push(primaryList);
      }
    }
    
    return targetLists;
  }

  /**
   * Perform full bidirectional sync with multiple lists
   */
  async performSync(userId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksDeleted: 0,
      conflicts: []
    };

    try {
      // Update sync status
      await this.updateSyncStatus(userId, 'syncing');

      // Get all list configurations
      const listConfigs = await this.getListConfigs(userId);
      
      if (listConfigs.length === 0) {
        // Fall back to old single-list behavior
        const selectedList = await this.getSelectedTaskList(userId);
        const taskListId = selectedList?.id || '@default';
        
        // Sync with single list
        const googleResult = await this.syncFromGoogle(userId, null, taskListId);
        result.tasksCreated += googleResult.tasksCreated;
        result.tasksUpdated += googleResult.tasksUpdated;
        result.tasksDeleted += googleResult.tasksDeleted;
        result.conflicts.push(...googleResult.conflicts);

        const localResult = await this.syncToGoogle(userId, taskListId);
        result.tasksCreated += localResult.tasksCreated;
        result.tasksUpdated += localResult.tasksUpdated;
        result.conflicts.push(...localResult.conflicts);
      } else {
        // Sync with multiple lists
        for (const config of listConfigs) {
          // Skip if sync is disabled for this list
          if (!config.sync_enabled) continue;
          
          // Sync from Google to Local (if enabled)
          if (config.sync_direction === 'bidirectional' || config.sync_direction === 'from_google') {
            const googleResult = await this.syncFromGoogle(userId, null, config.google_list_id);
            result.tasksCreated += googleResult.tasksCreated;
            result.tasksUpdated += googleResult.tasksUpdated;
            result.tasksDeleted += googleResult.tasksDeleted;
            result.conflicts.push(...googleResult.conflicts);
          }
          
          // Sync from Local to Google (if enabled)
          if (config.sync_direction === 'bidirectional' || config.sync_direction === 'to_google') {
            const localResult = await this.syncToGoogleWithConfig(userId, config);
            result.tasksCreated += localResult.tasksCreated;
            result.tasksUpdated += localResult.tasksUpdated;
            result.conflicts.push(...localResult.conflicts);
          }
        }
      }

      // Get last sync time for incremental sync
      const { data: syncStatus } = await supabase
        .from('google_tasks_sync_status')
        .select('last_incremental_sync_at')
        .eq('user_id', userId)
        .single();

      const lastSyncTime = syncStatus?.last_incremental_sync_at;

      // Update sync status with success
      await this.updateSyncStatus(userId, 'idle', {
        last_incremental_sync_at: new Date().toISOString(),
        tasks_synced_count: result.tasksCreated + result.tasksUpdated,
        conflicts_count: result.conflicts.length
      });

      result.success = true;

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      
      // Update sync status with error
      await this.updateSyncStatus(userId, 'error', {
        error_message: result.error
      });
    }

    return result;
  }

  /**
   * Sync tasks from Google to local database
   */
  private async syncFromGoogle(userId: string, lastSyncTime?: string, taskListId: string = '@default'): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksDeleted: 0,
      conflicts: []
    };

    try {
      // Get tasks from Google (with incremental sync if available)
      const { data } = await supabase.functions.invoke('google-services-router', {
        body: {
          action: 'tasks',
          handlerAction: 'sync-tasks',
          lastSyncTime: lastSyncTime,
          taskListId: taskListId
        }
      });

      if (!data) {
        throw new Error('No data received from Google Tasks');
      }

      const googleTasks: GoogleTask[] = data.tasks || [];
      const taskLists: GoogleTaskList[] = data.lists || [];

      // Store task lists
      for (const list of taskLists) {
        await this.storeTaskList(list, list.id === taskListId);
      }

      // Process each Google task
      for (const googleTask of googleTasks) {
        try {
          if (googleTask.deleted) {
            // Handle deleted tasks
            await this.handleDeletedGoogleTask(googleTask);
            result.tasksDeleted++;
          } else {
            // Enhanced duplicate detection: check both mappings AND tasks table
            const existingTask = await this.findExistingTaskForGoogleTask(googleTask.id, userId);
            
            if (existingTask) {
              // Task already exists - update it if needed
              const conflict = await this.updateLocalTask(existingTask.id, googleTask, existingTask.google_etag);
              if (conflict) {
                result.conflicts.push(conflict);
              } else {
                result.tasksUpdated++;
              }
              
              // Ensure mapping exists for this task
              await this.ensureTaskMapping(existingTask.id, googleTask);
            } else {
              // Create new local task (with duplicate prevention)
              await this.createLocalTask(googleTask, userId);
              result.tasksCreated++;
            }
          }
        } catch (error) {
        }
      }

      result.success = true;
    } catch (error) {
      throw error;
    }

    return result;
  }

  /**
   * Sync tasks from local database to Google with specific list config
   */
  private async syncToGoogleWithConfig(userId: string, config: ListConfig): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksDeleted: 0,
      conflicts: []
    };

    try {
      // Get local tasks that match this list's filters
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', userId)
        .in('sync_status', ['pending_sync', 'local_only'])
        .order('created_at', { ascending: true });
      
      // Apply priority filter if configured
      if (config.priority_filter && config.priority_filter.length > 0) {
        query = query.in('priority', config.priority_filter);
      }
      
      // Apply status filter if configured
      if (config.status_filter && config.status_filter.length > 0) {
        query = query.in('status', config.status_filter);
      }
      
      const { data: tasks } = await query;

      if (!tasks) return result;

      for (const task of tasks) {
        try {
          // Check if task already exists in this specific list
          const syncedLists = task.synced_to_lists || [];
          const isInList = syncedLists.some((l: any) => l.list_id === config.google_list_id);
          
          if (isInList && task.google_task_id) {
            // Update existing Google task
            const conflict = await this.updateGoogleTaskSync(task);
            if (conflict) {
              result.conflicts.push(conflict);
            } else {
              result.tasksUpdated++;
            }
          } else if (config.auto_create_in_list) {
            // Ensure we're using a valid list ID
            const listId = this.sanitizeListId(config.google_list_id);
            // Create new Google task in this list
            await this.createGoogleTaskSync(task, userId, listId);
            
            // Update synced_to_lists
            const updatedLists = [...syncedLists, { list_id: config.google_list_id, list_title: config.list_title }];
            await supabase
              .from('tasks')
              .update({ synced_to_lists: updatedLists })
              .eq('id', task.id);
            
            result.tasksCreated++;
          }
        } catch (error) {
          // Log the actual list ID being used for debugging
          if (config.google_list_id === 'Business' || (config.google_list_id !== '@default' && config.google_list_id.length < 20)) {
          }
        }
      }

      result.success = true;
    } catch (error) {
      throw error;
    }

    return result;
  }
  
  /**
   * Sync tasks from local database to Google (legacy single list)
   */
  private async syncToGoogle(userId: string, taskListId: string = '@default'): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksDeleted: 0,
      conflicts: []
    };

    try {
      // Get local tasks that need syncing
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', userId)
        .in('sync_status', ['pending_sync', 'local_only'])
        .order('created_at', { ascending: true });

      if (!tasks) return result;

      for (const task of tasks) {
        try {
          if (task.google_task_id) {
            // Update existing Google task
            const conflict = await this.updateGoogleTaskSync(task);
            if (conflict) {
              result.conflicts.push(conflict);
            } else {
              result.tasksUpdated++;
            }
          } else {
            // Create new Google task
            await this.createGoogleTaskSync(task, userId, taskListId);
            result.tasksCreated++;
          }
        } catch (error) {
        }
      }

      result.success = true;
    } catch (error) {
      throw error;
    }

    return result;
  }

  /**
   * Create a local task from Google task
   */
  private async createLocalTask(googleTask: GoogleTask, userId: string): Promise<void> {
    // Double-check that task doesn't already exist (prevent race conditions)
    const existingTask = await this.findExistingTaskForGoogleTask(googleTask.id, userId);
    if (existingTask) {
      return;
    }

    // Map Google task to local task format
    const localTask = {
      title: googleTask.title,
      description: googleTask.notes || null,
      status: googleTask.status === 'completed' ? 'completed' : 'not_started',
      priority: 'medium' as const,
      due_date: googleTask.due ? new Date(googleTask.due).toISOString() : null,
      assigned_to: userId,
      created_by: userId,
      google_task_id: googleTask.id,
      google_list_id: '@default', // Always use @default for consistency
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      google_position: googleTask.position,
      google_etag: googleTask.etag
    };

    // Create the task
    const { data: newTask, error } = await supabase
      .from('tasks')
      .insert(localTask)
      .select()
      .single();

    if (error) {
      // Check if error is due to duplicate google_task_id
      if (error.code === '23505' && error.message.includes('google_task_id')) {
        return;
      }
      throw error;
    }

    // Create mapping with error handling
    try {
      await supabase
        .from('google_task_mappings')
        .insert({
          task_id: newTask.id,
          google_task_id: googleTask.id,
          google_list_id: '@default',
          etag: googleTask.etag,
          sync_direction: 'from_google',
          user_id: userId
        });
    } catch (mappingError) {
      // If mapping creation fails but task was created, log and continue
    }
  }

  /**
   * Update a local task from Google task
   */
  private async updateLocalTask(taskId: string, googleTask: GoogleTask, localEtag?: string): Promise<SyncConflict | null> {
    // Check for conflicts using etag
    if (localEtag && localEtag !== googleTask.etag) {
      // Get local task to check for changes
      const { data: localTask } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (localTask && localTask.sync_status === 'pending_sync') {
        // Conflict detected - local changes exist
        return await this.createConflict(taskId, googleTask, 'update_conflict');
      }
    }

    // No conflict, update local task
    const updates = {
      title: googleTask.title,
      description: googleTask.notes || null,
      status: googleTask.status === 'completed' ? 'completed' : 'not_started',
      due_date: googleTask.due ? new Date(googleTask.due).toISOString() : null,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      google_position: googleTask.position,
      google_etag: googleTask.etag
    };

    await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId);

    // Update mapping
    await supabase
      .from('google_task_mappings')
      .update({
        etag: googleTask.etag,
        last_synced_at: new Date().toISOString()
      })
      .eq('task_id', taskId);

    return null;
  }

  /**
   * Create a Google task from local task (sync version)
   */
  private async createGoogleTaskSync(task: Task, userId: string, taskListId?: string): Promise<void> {
    // Sanitize the provided list ID first
    let listId = this.sanitizeListId(taskListId);
    
    if (!listId) {
      const { data: defaultList } = await supabase
        .from('google_task_lists')
        .select('google_list_id')
        .eq('is_default', true)
        .single();

      listId = defaultList?.google_list_id || '@default';
    }

    // Create task in Google
    const { data, error } = await supabase.functions.invoke('google-services-router', {
      body: {
        action: 'tasks',
        handlerAction: 'create-task',
        taskListId: listId,
        title: task.title,
        notes: task.description || undefined,
        due: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : undefined,
        status: task.status === 'completed' ? 'completed' : 'needsAction'
      }
    });

    if (error) throw error;

    // Update local task with Google info
    await supabase
      .from('tasks')
      .update({
        google_task_id: data.id,
        google_list_id: listId,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        google_etag: data.etag
      })
      .eq('id', task.id);

    // Create mapping
    await supabase
      .from('google_task_mappings')
      .insert({
        task_id: task.id,
        google_task_id: data.id,
        google_list_id: listId,
        etag: data.etag,
        sync_direction: 'to_google'
      });
  }

  /**
   * Update a Google task from local task (sync version)
   */
  private async updateGoogleTaskSync(task: Task): Promise<SyncConflict | null> {
    try {
      // Sanitize the list ID before using it
      const listId = this.sanitizeListId(task.google_list_id);
      
      const { data, error } = await supabase.functions.invoke('google-services-router', {
        body: {
          action: 'tasks',
          handlerAction: 'update-task',
          taskListId: listId,
          taskId: task.google_task_id,
          title: task.title,
          notes: task.description || undefined,
          due: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : undefined,
          status: task.status === 'completed' ? 'completed' : 'needsAction'
        }
      });

      if (error) throw error;

      // Update sync status
      await supabase
        .from('tasks')
        .update({
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
          google_etag: data.etag
        })
        .eq('id', task.id);

      // Update mapping
      await supabase
        .from('google_task_mappings')
        .update({
          etag: data.etag,
          last_synced_at: new Date().toISOString()
        })
        .eq('task_id', task.id);

      return null;
    } catch (error) {
      // If update fails, might be a conflict
      return await this.createConflict(task.id, null, 'update_conflict');
    }
  }

  /**
   * Handle deleted Google tasks
   */
  private async handleDeletedGoogleTask(googleTask: GoogleTask): Promise<void> {
    // Find and delete local task
    const { data: mapping } = await supabase
      .from('google_task_mappings')
      .select('task_id')
      .eq('google_task_id', googleTask.id)
      .single();

    if (mapping) {
      await supabase
        .from('tasks')
        .delete()
        .eq('id', mapping.task_id);
    }
  }

  /**
   * Find existing local task for a Google task ID (comprehensive search)
   */
  private async findExistingTaskForGoogleTask(googleTaskId: string, userId: string): Promise<any | null> {
    // First check mappings table
    const { data: mapping } = await supabase
      .from('google_task_mappings')
      .select(`
        task_id,
        etag,
        tasks!inner(id, google_task_id, google_etag, assigned_to)
      `)
      .eq('google_task_id', googleTaskId)
      .eq('tasks.assigned_to', userId)
      .single();

    if (mapping?.tasks) {
      return mapping.tasks;
    }

    // Also check tasks table directly (in case mapping is missing)
    const { data: task } = await supabase
      .from('tasks')
      .select('id, google_task_id, google_etag, assigned_to')
      .eq('google_task_id', googleTaskId)
      .eq('assigned_to', userId)
      .single();

    return task || null;
  }

  /**
   * Ensure task mapping exists (create if missing)
   */
  private async ensureTaskMapping(taskId: string, googleTask: GoogleTask): Promise<void> {
    const { data: existingMapping } = await supabase
      .from('google_task_mappings')
      .select('id')
      .eq('task_id', taskId)
      .eq('google_task_id', googleTask.id)
      .single();

    if (!existingMapping) {
      // Create missing mapping
      await supabase
        .from('google_task_mappings')
        .insert({
          task_id: taskId,
          google_task_id: googleTask.id,
          google_list_id: '@default',
          etag: googleTask.etag,
          sync_direction: 'from_google',
          user_id: (await supabase.auth.getUser()).data.user?.id
        });
    }
  }

  /**
   * Sanitize list ID to ensure it's valid for Google Tasks API
   */
  private sanitizeListId(listId: string | undefined): string {
    // If no list ID or it's "Business" or another invalid short string, use @default
    if (!listId || listId === 'Business' || (listId !== '@default' && listId.length < 20)) {
      return '@default';
    }
    return listId;
  }

  /**
   * Store a Google task list
   */
  private async storeTaskList(taskList: GoogleTaskList, isDefault: boolean = false): Promise<void> {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    // Get the user's Google integration
    const { data: integration } = await supabase
      .from('google_integrations')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!integration) return;

    await supabase
      .from('google_task_lists')
      .upsert({
        integration_id: integration.id,
        google_list_id: taskList.id,
        title: taskList.title,
        is_default: isDefault,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'integration_id,google_list_id'
      });
  }

  /**
   * Create a sync conflict record
   */
  private async createConflict(
    taskId: string | null,
    googleTask: GoogleTask | null,
    conflictType: SyncConflict['conflict_type']
  ): Promise<SyncConflict> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const conflict = {
      user_id: user.id,
      task_id: taskId,
      google_task_id: googleTask?.id || null,
      google_list_id: googleTask ? '@default' : null,
      conflict_type: conflictType,
      local_data: taskId ? await this.getTaskData(taskId) : null,
      google_data: googleTask || null,
      resolved: false
    };

    const { data, error } = await supabase
      .from('google_tasks_sync_conflicts')
      .insert(conflict)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get task data for conflict resolution
   */
  private async getTaskData(taskId: string): Promise<any> {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();
    return data;
  }

  /**
   * Update sync status
   */
  private async updateSyncStatus(
    userId: string,
    state: 'idle' | 'syncing' | 'error' | 'conflict',
    updates?: Partial<{
      last_incremental_sync_at: string;
      tasks_synced_count: number;
      conflicts_count: number;
      error_message: string;
    }>
  ): Promise<void> {
    await supabase
      .from('google_tasks_sync_status')
      .upsert({
        user_id: userId,
        sync_state: state,
        ...updates,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
  }

  /**
   * Resolve a sync conflict
   */
  async resolveConflict(
    conflictId: string,
    resolution: 'keep_local' | 'keep_google' | 'keep_both' | 'merge'
  ): Promise<void> {
    const { data: conflict } = await supabase
      .from('google_tasks_sync_conflicts')
      .select('*')
      .eq('id', conflictId)
      .single();

    if (!conflict) throw new Error('Conflict not found');

    switch (resolution) {
      case 'keep_local':
        // Update Google with local data
        if (conflict.task_id && conflict.local_data) {
          await this.updateGoogleTaskSync(conflict.local_data);
        }
        break;
      
      case 'keep_google':
        // Update local with Google data
        if (conflict.task_id && conflict.google_data) {
          await this.updateLocalTask(conflict.task_id, conflict.google_data);
        }
        break;
      
      case 'keep_both':
        // Create duplicate task
        if (conflict.google_data) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await this.createLocalTask(conflict.google_data, user.id);
          }
        }
        break;
      
      case 'merge':
        // Merge data (custom logic based on your requirements)
        // This would need more sophisticated merging logic
        break;
    }

    // Mark conflict as resolved
    await supabase
      .from('google_tasks_sync_conflicts')
      .update({
        resolved: true,
        resolution: resolution,
        resolved_at: new Date().toISOString()
      })
      .eq('id', conflictId);
  }

  /**
   * Get unresolved conflicts for a user
   */
  async getUnresolvedConflicts(userId: string): Promise<SyncConflict[]> {
    const { data, error } = await supabase
      .from('google_tasks_sync_conflicts')
      .select('*')
      .eq('user_id', userId)
      .eq('resolved', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Check if Google Tasks is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return false;
      }

      const { data: integration, error } = await supabase
        .from('google_integrations')
        .select('id, scopes')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (error) {
        return false;
      }

      if (!integration) {
        return false;
      }
      // Check if the scopes include Google Tasks scope
      const hasTasksScope = integration.scopes && 
        (integration.scopes.includes('https://www.googleapis.com/auth/tasks') || 
         integration.scopes.includes('tasks'));
      return hasTasksScope;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const googleTasksSync = GoogleTasksSyncService.getInstance();