// supabase/functions/_shared/workspaceClient.ts
// WS-001: Provider-Abstracted Client Interface
//
// Single entry point for all Google and Microsoft API calls.
// Usage: const client = await createWorkspaceClient('google', userId, supabase);
//        const messages = await client.email.list({ maxResults: 10 });

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { WorkspaceProvider } from './workspaceErrors.ts';
import { WorkspaceError } from './workspaceErrors.ts';
import { getValidToken } from './tokenManager.ts';
import {
  createGoogleEmail,
  createGoogleCalendar,
  createGoogleDrive,
  createGoogleContacts,
} from './providers/google.ts';
import {
  createMicrosoftEmail,
  createMicrosoftCalendar,
  createMicrosoftDrive,
  createMicrosoftContacts,
} from './providers/microsoft.ts';

// ---------------------------------------------------------------------------
// Shared types — exported for provider implementations
// ---------------------------------------------------------------------------

export interface ListOptions {
  query?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface PaginatedList<T> {
  items: T[];
  nextPageToken?: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  provider: WorkspaceProvider;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  receivedAt: string;
  rawMetadata?: Record<string, unknown>;
}

export interface EmailSendParams {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface CalendarEvent {
  id: string;
  provider: WorkspaceProvider;
  calendarId: string;
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees: Array<{ email: string; name?: string; responseStatus?: string }>;
  rawMetadata?: Record<string, unknown>;
}

export interface CalendarEventParams {
  calendarId?: string;
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees?: string[];
}

export interface DriveFile {
  id: string;
  provider: WorkspaceProvider;
  name: string;
  mimeType: string;
  url: string;
  parentId?: string;
  createdAt?: string;
  modifiedAt?: string;
  size?: number;
}

export interface DriveUploadParams {
  name: string;
  parentId?: string;
  content: string; // base64
  mimeType: string;
}

export interface DriveShareParams {
  email?: string;
  role: 'reader' | 'writer' | 'commenter';
  type?: 'user' | 'anyone';
}

export interface Contact {
  id: string;
  provider: WorkspaceProvider;
  name: string;
  email: string;
  company?: string;
  title?: string;
}

// ---------------------------------------------------------------------------
// Namespace interfaces
// ---------------------------------------------------------------------------

export interface EmailNamespace {
  list(opts?: ListOptions): Promise<PaginatedList<EmailMessage>>;
  get(messageId: string): Promise<EmailMessage>;
  send(params: EmailSendParams): Promise<{ id: string }>;
  reply(messageId: string, params: EmailSendParams): Promise<{ id: string }>;
  forward(messageId: string, to: string): Promise<{ id: string }>;
  archive(messageId: string): Promise<void>;
  trash(messageId: string): Promise<void>;
  markAsRead(messageId: string): Promise<void>;
}

export interface CalendarNamespace {
  listEvents(opts?: { calendarId?: string; timeMin?: string; timeMax?: string; maxResults?: number; pageToken?: string }): Promise<PaginatedList<CalendarEvent>>;
  createEvent(params: CalendarEventParams): Promise<CalendarEvent>;
  updateEvent(eventId: string, params: Partial<CalendarEventParams>): Promise<CalendarEvent>;
  deleteEvent(eventId: string, calendarId?: string): Promise<void>;
}

export interface DriveNamespace {
  listFiles(opts?: { folderId?: string; query?: string; maxResults?: number; pageToken?: string }): Promise<PaginatedList<DriveFile>>;
  createFolder(name: string, parentId?: string): Promise<DriveFile>;
  uploadFile(params: DriveUploadParams): Promise<DriveFile>;
  shareFile(fileId: string, params: DriveShareParams): Promise<void>;
  getFile(fileId: string): Promise<DriveFile>;
  deleteFile(fileId: string): Promise<void>;
  search(query: string, maxResults?: number): Promise<DriveFile[]>;
}

export interface ContactsNamespace {
  list(opts?: { maxResults?: number; pageToken?: string }): Promise<PaginatedList<Contact>>;
  search(query: string): Promise<Contact[]>;
}

// ---------------------------------------------------------------------------
// WorkspaceClient
// ---------------------------------------------------------------------------

export interface WorkspaceClient {
  provider: WorkspaceProvider;
  userId: string;
  email: EmailNamespace;
  calendar: CalendarNamespace;
  drive: DriveNamespace;
  contacts: ContactsNamespace;
}

/**
 * Create a workspace client for a user.
 *
 * Fetches the user's active integration tokens and returns a provider-specific client
 * with a unified interface.
 */
export async function createWorkspaceClient(
  provider: WorkspaceProvider,
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<WorkspaceClient> {
  if (provider === 'google') {
    const { data: integration, error } = await supabase
      .from('google_integrations')
      .select('access_token, refresh_token, expires_at, email')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !integration) {
      throw new WorkspaceError('Google integration not connected', {
        code: 'not_connected',
        statusCode: 401,
        retryable: false,
        provider: 'google',
      });
    }

    // Use centralized token manager for proactive refresh
    const { accessToken } = await getValidToken('google', userId, supabase);

    return {
      provider: 'google',
      userId,
      email: createGoogleEmail(accessToken, supabase),
      calendar: createGoogleCalendar(accessToken),
      drive: createGoogleDrive(accessToken),
      contacts: createGoogleContacts(accessToken),
    };
  }

  if (provider === 'microsoft') {
    const { data: integration, error } = await supabase
      .from('microsoft_integrations')
      .select('access_token, refresh_token, expires_at, email')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !integration) {
      throw new WorkspaceError('Microsoft integration not connected', {
        code: 'not_connected',
        statusCode: 401,
        retryable: false,
        provider: 'microsoft',
      });
    }

    const { accessToken } = await getValidToken('microsoft', userId, supabase);

    return {
      provider: 'microsoft',
      userId,
      email: createMicrosoftEmail(accessToken),
      calendar: createMicrosoftCalendar(accessToken),
      drive: createMicrosoftDrive(accessToken),
      contacts: createMicrosoftContacts(accessToken),
    };
  }

  throw new WorkspaceError(`Unsupported provider: ${provider}`, {
    code: 'invalid_provider',
    statusCode: 400,
    retryable: false,
    provider: provider as WorkspaceProvider,
  });
}
