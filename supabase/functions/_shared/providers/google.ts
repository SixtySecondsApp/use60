// supabase/functions/_shared/providers/google.ts
// WS-001: Google provider implementation for WorkspaceClient

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { classifyApiError, type WorkspaceProvider } from '../workspaceErrors.ts';
import { paginateAll } from '../pagination.ts';
import type {
  EmailNamespace,
  CalendarNamespace,
  DriveNamespace,
  ContactsNamespace,
  EmailMessage,
  EmailSendParams,
  CalendarEvent,
  CalendarEventParams,
  DriveFile,
  DriveUploadParams,
  DriveShareParams,
  Contact,
  ListOptions,
  PaginatedList,
} from '../workspaceClient.ts';

const PROVIDER: WorkspaceProvider = 'google';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const PEOPLE_BASE = 'https://people.googleapis.com/v1';

async function googleFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...init?.headers,
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw classifyApiError(PROVIDER, res.status, body);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function decodeHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers?.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function parseGmailMessage(msg: Record<string, unknown>): EmailMessage {
  const payload = msg.payload as Record<string, unknown> | undefined;
  const headers = (payload?.headers || []) as Array<{ name: string; value: string }>;
  const labelIds = (msg.labelIds || []) as string[];
  return {
    id: msg.id as string,
    threadId: msg.threadId as string,
    provider: 'google',
    from: decodeHeader(headers, 'from'),
    to: decodeHeader(headers, 'to').split(',').map((e: string) => e.trim()).filter(Boolean),
    cc: decodeHeader(headers, 'cc').split(',').map((e: string) => e.trim()).filter(Boolean),
    subject: decodeHeader(headers, 'subject'),
    snippet: (msg.snippet as string) || '',
    labels: labelIds,
    isRead: !labelIds.includes('UNREAD'),
    isStarred: labelIds.includes('STARRED'),
    hasAttachments: !!(payload?.parts as Array<Record<string, unknown>>)?.some(
      (p: Record<string, unknown>) => p.filename && (p.filename as string).length > 0
    ),
    receivedAt: new Date(Number(msg.internalDate)).toISOString(),
    rawMetadata: msg,
  };
}

export function createGoogleEmail(accessToken: string, _supabase: ReturnType<typeof createClient>): EmailNamespace {
  return {
    async list(opts: ListOptions = {}): Promise<PaginatedList<EmailMessage>> {
      const { query, maxResults = 20, pageToken } = opts;
      const url = new URL(`${GMAIL_BASE}/messages`);
      if (query) url.searchParams.set('q', query);
      url.searchParams.set('maxResults', String(maxResults));
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await googleFetch(url.toString(), accessToken);
      const data = await res.json();
      const messageStubs = data.messages || [];

      // Fetch full messages in parallel (batches of 10)
      const messages: EmailMessage[] = [];
      for (let i = 0; i < messageStubs.length; i += 10) {
        const batch = messageStubs.slice(i, i + 10);
        const full = await Promise.all(
          batch.map(async (stub: { id: string }) => {
            const r = await googleFetch(
              `${GMAIL_BASE}/messages/${stub.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`,
              accessToken
            );
            return r.json();
          })
        );
        messages.push(...full.map(parseGmailMessage));
      }

      return { items: messages, nextPageToken: data.nextPageToken || undefined };
    },

    async get(messageId: string): Promise<EmailMessage> {
      const res = await googleFetch(`${GMAIL_BASE}/messages/${messageId}?format=full`, accessToken);
      const msg = await res.json();
      return parseGmailMessage(msg);
    },

    async send(params: EmailSendParams): Promise<{ id: string }> {
      const lines = [
        `To: ${params.to}`,
        `Subject: ${params.subject}`,
        params.inReplyTo ? `In-Reply-To: ${params.inReplyTo}` : '',
        params.references ? `References: ${params.references}` : '',
        `Content-Type: ${params.isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
        '',
        params.body,
      ].filter(Boolean);

      const raw = btoa(unescape(encodeURIComponent(lines.join('\r\n'))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const url = params.threadId
        ? `${GMAIL_BASE}/messages/send`
        : `${GMAIL_BASE}/messages/send`;

      const body: Record<string, string> = { raw };
      if (params.threadId) body.threadId = params.threadId;

      const res = await googleFetch(url, accessToken, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const result = await res.json();
      return { id: result.id };
    },

    async reply(messageId: string, params: EmailSendParams): Promise<{ id: string }> {
      // Get original message for threading context
      const original = await this.get(messageId);
      return this.send({
        ...params,
        threadId: original.threadId,
        inReplyTo: messageId,
        references: params.references || messageId,
      });
    },

    async forward(messageId: string, to: string): Promise<{ id: string }> {
      const original = await this.get(messageId);
      return this.send({
        to,
        subject: `Fwd: ${original.subject}`,
        body: original.snippet,
        isHtml: false,
        threadId: original.threadId,
      });
    },

    async archive(messageId: string): Promise<void> {
      await googleFetch(`${GMAIL_BASE}/messages/${messageId}/modify`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
      });
    },

    async trash(messageId: string): Promise<void> {
      await googleFetch(`${GMAIL_BASE}/messages/${messageId}/trash`, accessToken, {
        method: 'POST',
      });
    },

    async markAsRead(messageId: string): Promise<void> {
      await googleFetch(`${GMAIL_BASE}/messages/${messageId}/modify`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function parseGoogleEvent(event: Record<string, unknown>): CalendarEvent {
  const start = event.start as Record<string, string> | undefined;
  const end = event.end as Record<string, string> | undefined;
  return {
    id: event.id as string,
    provider: 'google',
    calendarId: (event.organizer as Record<string, string>)?.email || 'primary',
    summary: (event.summary as string) || '',
    description: (event.description as string) || undefined,
    startTime: start?.dateTime || start?.date || '',
    endTime: end?.dateTime || end?.date || '',
    location: (event.location as string) || undefined,
    attendees: ((event.attendees || []) as Array<Record<string, string>>).map((a) => ({
      email: a.email,
      name: a.displayName || undefined,
      responseStatus: a.responseStatus || undefined,
    })),
    rawMetadata: event,
  };
}

export function createGoogleCalendar(accessToken: string): CalendarNamespace {
  return {
    async listEvents(opts: { calendarId?: string; timeMin?: string; timeMax?: string; maxResults?: number; pageToken?: string } = {}): Promise<PaginatedList<CalendarEvent>> {
      const calId = opts.calendarId || 'primary';
      const url = new URL(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events`);
      if (opts.timeMin) url.searchParams.set('timeMin', opts.timeMin);
      if (opts.timeMax) url.searchParams.set('timeMax', opts.timeMax);
      url.searchParams.set('maxResults', String(opts.maxResults || 50));
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      if (opts.pageToken) url.searchParams.set('pageToken', opts.pageToken);

      const res = await googleFetch(url.toString(), accessToken);
      const data = await res.json();
      return {
        items: (data.items || []).map(parseGoogleEvent),
        nextPageToken: data.nextPageToken || undefined,
      };
    },

    async createEvent(params: CalendarEventParams): Promise<CalendarEvent> {
      const calId = params.calendarId || 'primary';
      const body = {
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.startTime },
        end: { dateTime: params.endTime },
        location: params.location,
        attendees: params.attendees?.map((email) => ({ email })),
      };
      const res = await googleFetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events`, accessToken, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return parseGoogleEvent(await res.json());
    },

    async updateEvent(eventId: string, params: Partial<CalendarEventParams>): Promise<CalendarEvent> {
      const calId = params.calendarId || 'primary';
      const body: Record<string, unknown> = {};
      if (params.summary !== undefined) body.summary = params.summary;
      if (params.description !== undefined) body.description = params.description;
      if (params.startTime) body.start = { dateTime: params.startTime };
      if (params.endTime) body.end = { dateTime: params.endTime };
      if (params.location !== undefined) body.location = params.location;
      if (params.attendees) body.attendees = params.attendees.map((email) => ({ email }));

      const res = await googleFetch(
        `${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events/${eventId}`,
        accessToken,
        { method: 'PATCH', body: JSON.stringify(body) }
      );
      return parseGoogleEvent(await res.json());
    },

    async deleteEvent(eventId: string, calendarId?: string): Promise<void> {
      const calId = calendarId || 'primary';
      await googleFetch(
        `${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events/${eventId}`,
        accessToken,
        { method: 'DELETE' }
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

function parseGoogleFile(file: Record<string, unknown>): DriveFile {
  return {
    id: file.id as string,
    provider: 'google',
    name: (file.name as string) || '',
    mimeType: (file.mimeType as string) || '',
    url: (file.webViewLink as string) || `https://drive.google.com/file/d/${file.id}/view`,
    parentId: ((file.parents as string[]) || [])[0] || undefined,
    createdAt: (file.createdTime as string) || undefined,
    modifiedAt: (file.modifiedTime as string) || undefined,
    size: file.size ? Number(file.size) : undefined,
  };
}

export function createGoogleDrive(accessToken: string): DriveNamespace {
  return {
    async listFiles(opts: { folderId?: string; query?: string; maxResults?: number; pageToken?: string } = {}): Promise<PaginatedList<DriveFile>> {
      const url = new URL(`${DRIVE_BASE}/files`);
      const qParts: string[] = [];
      if (opts.folderId) qParts.push(`'${opts.folderId}' in parents`);
      if (opts.query) qParts.push(`name contains '${opts.query}'`);
      qParts.push('trashed = false');
      url.searchParams.set('q', qParts.join(' and '));
      url.searchParams.set('fields', 'files(id,name,mimeType,webViewLink,parents,createdTime,modifiedTime,size),nextPageToken');
      url.searchParams.set('pageSize', String(opts.maxResults || 50));
      if (opts.pageToken) url.searchParams.set('pageToken', opts.pageToken);

      const res = await googleFetch(url.toString(), accessToken);
      const data = await res.json();
      return {
        items: (data.files || []).map(parseGoogleFile),
        nextPageToken: data.nextPageToken || undefined,
      };
    },

    async createFolder(name: string, parentId?: string): Promise<DriveFile> {
      const body: Record<string, unknown> = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (parentId) body.parents = [parentId];

      const res = await googleFetch(`${DRIVE_BASE}/files?fields=id,name,mimeType,webViewLink,parents,createdTime`, accessToken, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return parseGoogleFile(await res.json());
    },

    async uploadFile(params: DriveUploadParams): Promise<DriveFile> {
      // Simple upload for files < 5MB — uses multipart for metadata + content
      const metadata: Record<string, unknown> = { name: params.name, mimeType: params.mimeType };
      if (params.parentId) metadata.parents = [params.parentId];

      const boundary = '---workspace-upload-boundary';
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${params.mimeType}`,
        'Content-Transfer-Encoding: base64',
        '',
        params.content,
        `--${boundary}--`,
      ].join('\r\n');

      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,parents,createdTime,modifiedTime,size',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw classifyApiError(PROVIDER, res.status, errBody);
      }
      return parseGoogleFile(await res.json());
    },

    async shareFile(fileId: string, params: DriveShareParams): Promise<void> {
      const body = {
        type: params.type || 'user',
        role: params.role,
        emailAddress: params.email,
      };
      await googleFetch(`${DRIVE_BASE}/files/${fileId}/permissions`, accessToken, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    async getFile(fileId: string): Promise<DriveFile> {
      const res = await googleFetch(
        `${DRIVE_BASE}/files/${fileId}?fields=id,name,mimeType,webViewLink,parents,createdTime,modifiedTime,size`,
        accessToken
      );
      return parseGoogleFile(await res.json());
    },

    async deleteFile(fileId: string): Promise<void> {
      await googleFetch(`${DRIVE_BASE}/files/${fileId}`, accessToken, { method: 'DELETE' });
    },

    async search(query: string, maxResults?: number): Promise<DriveFile[]> {
      const result = await this.listFiles({ query, maxResults: maxResults || 20 });
      return result.items;
    },
  };
}

// ---------------------------------------------------------------------------
// Contacts (People API)
// ---------------------------------------------------------------------------

export function createGoogleContacts(accessToken: string): ContactsNamespace {
  return {
    async list(opts: { maxResults?: number; pageToken?: string } = {}): Promise<PaginatedList<Contact>> {
      const url = new URL(`${PEOPLE_BASE}/people/me/connections`);
      url.searchParams.set('personFields', 'names,emailAddresses,organizations,phoneNumbers');
      url.searchParams.set('pageSize', String(opts.maxResults || 100));
      if (opts.pageToken) url.searchParams.set('pageToken', opts.pageToken);

      const res = await googleFetch(url.toString(), accessToken);
      const data = await res.json();

      const contacts: Contact[] = (data.connections || []).map((c: Record<string, unknown>) => {
        const names = (c.names as Array<Record<string, string>>) || [];
        const emails = (c.emailAddresses as Array<Record<string, string>>) || [];
        const orgs = (c.organizations as Array<Record<string, string>>) || [];
        return {
          id: c.resourceName as string,
          provider: 'google' as const,
          name: names[0]?.displayName || '',
          email: emails[0]?.value || '',
          company: orgs[0]?.name || undefined,
          title: orgs[0]?.title || undefined,
        };
      });

      return { items: contacts, nextPageToken: data.nextPageToken || undefined };
    },

    async search(query: string): Promise<Contact[]> {
      const url = new URL(`${PEOPLE_BASE}/people:searchContacts`);
      url.searchParams.set('query', query);
      url.searchParams.set('readMask', 'names,emailAddresses,organizations');

      const res = await googleFetch(url.toString(), accessToken);
      const data = await res.json();

      return (data.results || []).map((r: Record<string, unknown>) => {
        const person = r.person as Record<string, unknown>;
        const names = (person?.names as Array<Record<string, string>>) || [];
        const emails = (person?.emailAddresses as Array<Record<string, string>>) || [];
        const orgs = (person?.organizations as Array<Record<string, string>>) || [];
        return {
          id: person?.resourceName as string,
          provider: 'google' as const,
          name: names[0]?.displayName || '',
          email: emails[0]?.value || '',
          company: orgs[0]?.name || undefined,
          title: orgs[0]?.title || undefined,
        };
      });
    },
  };
}
