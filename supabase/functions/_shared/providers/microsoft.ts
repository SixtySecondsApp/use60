// supabase/functions/_shared/providers/microsoft.ts
// WS-009/010/011: Microsoft provider implementations via Graph API

import { classifyApiError, type WorkspaceProvider } from '../workspaceErrors.ts';
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

const PROVIDER: WorkspaceProvider = 'microsoft';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function graphFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) || {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw classifyApiError(PROVIDER, res.status, body?.error?.message || body);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Email (WS-009)
// ---------------------------------------------------------------------------

function parseGraphMessage(msg: Record<string, unknown>): EmailMessage {
  const from = msg.from as Record<string, Record<string, string>> | undefined;
  const toRecipients = (msg.toRecipients || []) as Array<Record<string, Record<string, string>>>;
  const ccRecipients = (msg.ccRecipients || []) as Array<Record<string, Record<string, string>>>;

  return {
    id: msg.id as string,
    threadId: (msg.conversationId as string) || '',
    provider: 'microsoft',
    from: from?.emailAddress?.address || '',
    to: toRecipients.map((r) => r.emailAddress?.address || '').filter(Boolean),
    cc: ccRecipients.map((r) => r.emailAddress?.address || '').filter(Boolean),
    subject: (msg.subject as string) || '',
    snippet: (msg.bodyPreview as string) || '',
    labels: ((msg.categories || []) as string[]),
    isRead: (msg.isRead as boolean) || false,
    isStarred: (msg.flag as Record<string, string>)?.flagStatus === 'flagged',
    hasAttachments: (msg.hasAttachments as boolean) || false,
    receivedAt: (msg.receivedDateTime as string) || '',
    rawMetadata: msg,
  };
}

export function createMicrosoftEmail(accessToken: string): EmailNamespace {
  return {
    async list(opts: ListOptions = {}): Promise<PaginatedList<EmailMessage>> {
      const { query, maxResults = 20, pageToken } = opts;
      let url: string;

      if (pageToken) {
        url = pageToken; // Microsoft uses full URL as nextLink
      } else {
        const u = new URL(`${GRAPH_BASE}/me/messages`);
        u.searchParams.set('$top', String(maxResults));
        u.searchParams.set('$orderby', 'receivedDateTime desc');
        u.searchParams.set('$select', 'id,conversationId,from,toRecipients,ccRecipients,subject,bodyPreview,categories,isRead,flag,hasAttachments,receivedDateTime');
        if (query) u.searchParams.set('$search', `"${query}"`);
        url = u.toString();
      }

      const res = await graphFetch(url, accessToken);
      const data = await res.json();

      return {
        items: (data.value || []).map(parseGraphMessage),
        nextPageToken: data['@odata.nextLink'] || undefined,
      };
    },

    async get(messageId: string): Promise<EmailMessage> {
      const res = await graphFetch(`/me/messages/${messageId}`, accessToken);
      return parseGraphMessage(await res.json());
    },

    async send(params: EmailSendParams): Promise<{ id: string }> {
      const message: Record<string, unknown> = {
        subject: params.subject,
        body: {
          contentType: params.isHtml ? 'HTML' : 'Text',
          content: params.body,
        },
        toRecipients: [{ emailAddress: { address: params.to } }],
      };

      // Thread context
      if (params.threadId) {
        message.conversationId = params.threadId;
      }
      if (params.inReplyTo || params.references) {
        message.internetMessageHeaders = [];
        if (params.inReplyTo) {
          (message.internetMessageHeaders as Array<Record<string, string>>).push(
            { name: 'In-Reply-To', value: params.inReplyTo }
          );
        }
        if (params.references) {
          (message.internetMessageHeaders as Array<Record<string, string>>).push(
            { name: 'References', value: params.references }
          );
        }
      }

      // MS Graph sendMail returns 202 with no body
      await graphFetch('/me/sendMail', accessToken, {
        method: 'POST',
        body: JSON.stringify({ message, saveToSentItems: true }),
      });

      return { id: params.threadId || `ms-${Date.now()}` };
    },

    async reply(messageId: string, params: EmailSendParams): Promise<{ id: string }> {
      await graphFetch(`/me/messages/${messageId}/reply`, accessToken, {
        method: 'POST',
        body: JSON.stringify({
          comment: params.body,
        }),
      });
      return { id: messageId };
    },

    async forward(messageId: string, to: string): Promise<{ id: string }> {
      await graphFetch(`/me/messages/${messageId}/forward`, accessToken, {
        method: 'POST',
        body: JSON.stringify({
          toRecipients: [{ emailAddress: { address: to } }],
        }),
      });
      return { id: messageId };
    },

    async archive(messageId: string): Promise<void> {
      // Move to Archive folder
      const archiveRes = await graphFetch('/me/mailFolders?$filter=displayName eq \'Archive\'', accessToken);
      const archiveData = await archiveRes.json();
      const archiveFolderId = archiveData.value?.[0]?.id;
      if (archiveFolderId) {
        await graphFetch(`/me/messages/${messageId}/move`, accessToken, {
          method: 'POST',
          body: JSON.stringify({ destinationId: archiveFolderId }),
        });
      }
    },

    async trash(messageId: string): Promise<void> {
      await graphFetch(`/me/messages/${messageId}/move`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ destinationId: 'deleteditems' }),
      });
    },

    async markAsRead(messageId: string): Promise<void> {
      await graphFetch(`/me/messages/${messageId}`, accessToken, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: true }),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Calendar (WS-010)
// ---------------------------------------------------------------------------

function parseGraphEvent(event: Record<string, unknown>): CalendarEvent {
  const start = event.start as Record<string, string> | undefined;
  const end = event.end as Record<string, string> | undefined;
  const attendees = (event.attendees || []) as Array<Record<string, unknown>>;

  return {
    id: event.id as string,
    provider: 'microsoft',
    calendarId: 'primary',
    summary: (event.subject as string) || '',
    description: (event.bodyPreview as string) || undefined,
    startTime: start?.dateTime ? `${start.dateTime}Z` : '',
    endTime: end?.dateTime ? `${end.dateTime}Z` : '',
    location: ((event.location as Record<string, string>)?.displayName) || undefined,
    attendees: attendees.map((a) => {
      const ea = a.emailAddress as Record<string, string>;
      return {
        email: ea?.address || '',
        name: ea?.name || undefined,
        responseStatus: (a.status as Record<string, string>)?.response || undefined,
      };
    }),
    rawMetadata: event,
  };
}

export function createMicrosoftCalendar(accessToken: string): CalendarNamespace {
  return {
    async listEvents(opts = {}): Promise<PaginatedList<CalendarEvent>> {
      const { timeMin, timeMax, maxResults = 50, pageToken } = opts;

      let url: string;
      if (pageToken) {
        url = pageToken;
      } else {
        const u = new URL(`${GRAPH_BASE}/me/calendarView`);
        u.searchParams.set('startDateTime', timeMin || new Date().toISOString());
        u.searchParams.set('endDateTime', timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
        u.searchParams.set('$top', String(maxResults));
        u.searchParams.set('$orderby', 'start/dateTime');
        u.searchParams.set('$select', 'id,subject,bodyPreview,start,end,location,attendees,organizer');
        url = u.toString();
      }

      const res = await graphFetch(url, accessToken);
      const data = await res.json();

      return {
        items: (data.value || []).map(parseGraphEvent),
        nextPageToken: data['@odata.nextLink'] || undefined,
      };
    },

    async createEvent(params: CalendarEventParams): Promise<CalendarEvent> {
      const body: Record<string, unknown> = {
        subject: params.summary,
        body: params.description ? { contentType: 'Text', content: params.description } : undefined,
        start: { dateTime: params.startTime.replace('Z', ''), timeZone: 'UTC' },
        end: { dateTime: params.endTime.replace('Z', ''), timeZone: 'UTC' },
        location: params.location ? { displayName: params.location } : undefined,
        attendees: params.attendees?.map((email) => ({
          emailAddress: { address: email },
          type: 'required',
        })),
      };

      const res = await graphFetch('/me/events', accessToken, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return parseGraphEvent(await res.json());
    },

    async updateEvent(eventId: string, params: Partial<CalendarEventParams>): Promise<CalendarEvent> {
      const body: Record<string, unknown> = {};
      if (params.summary !== undefined) body.subject = params.summary;
      if (params.description !== undefined) body.body = { contentType: 'Text', content: params.description };
      if (params.startTime) body.start = { dateTime: params.startTime.replace('Z', ''), timeZone: 'UTC' };
      if (params.endTime) body.end = { dateTime: params.endTime.replace('Z', ''), timeZone: 'UTC' };
      if (params.location !== undefined) body.location = { displayName: params.location };
      if (params.attendees) {
        body.attendees = params.attendees.map((email) => ({
          emailAddress: { address: email },
          type: 'required',
        }));
      }

      const res = await graphFetch(`/me/events/${eventId}`, accessToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return parseGraphEvent(await res.json());
    },

    async deleteEvent(eventId: string): Promise<void> {
      await graphFetch(`/me/events/${eventId}`, accessToken, { method: 'DELETE' });
    },
  };
}

// ---------------------------------------------------------------------------
// Drive / OneDrive (WS-011)
// ---------------------------------------------------------------------------

function parseGraphFile(file: Record<string, unknown>): DriveFile {
  const parentRef = file.parentReference as Record<string, string> | undefined;
  return {
    id: file.id as string,
    provider: 'microsoft',
    name: (file.name as string) || '',
    mimeType: (file.file as Record<string, string>)?.mimeType || 'application/octet-stream',
    url: (file.webUrl as string) || '',
    parentId: parentRef?.id || undefined,
    createdAt: (file.createdDateTime as string) || undefined,
    modifiedAt: (file.lastModifiedDateTime as string) || undefined,
    size: file.size ? Number(file.size) : undefined,
  };
}

export function createMicrosoftDrive(accessToken: string): DriveNamespace {
  return {
    async listFiles(opts = {}): Promise<PaginatedList<DriveFile>> {
      const { folderId, query, maxResults = 50, pageToken } = opts;

      let url: string;
      if (pageToken) {
        url = pageToken;
      } else if (query) {
        const u = new URL(`${GRAPH_BASE}/me/drive/root/search(q='${encodeURIComponent(query)}')`);
        u.searchParams.set('$top', String(maxResults));
        url = u.toString();
      } else {
        const base = folderId
          ? `${GRAPH_BASE}/me/drive/items/${folderId}/children`
          : `${GRAPH_BASE}/me/drive/root/children`;
        const u = new URL(base);
        u.searchParams.set('$top', String(maxResults));
        u.searchParams.set('$select', 'id,name,file,webUrl,parentReference,createdDateTime,lastModifiedDateTime,size');
        url = u.toString();
      }

      const res = await graphFetch(url, accessToken);
      const data = await res.json();

      return {
        items: (data.value || []).map(parseGraphFile),
        nextPageToken: data['@odata.nextLink'] || undefined,
      };
    },

    async createFolder(name: string, parentId?: string): Promise<DriveFile> {
      const base = parentId
        ? `/me/drive/items/${parentId}/children`
        : '/me/drive/root/children';

      const res = await graphFetch(base, accessToken, {
        method: 'POST',
        body: JSON.stringify({
          name,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        }),
      });
      return parseGraphFile(await res.json());
    },

    async uploadFile(params: DriveUploadParams): Promise<DriveFile> {
      // Simple upload for files < 4MB
      const base = params.parentId
        ? `/me/drive/items/${params.parentId}:/${encodeURIComponent(params.name)}:/content`
        : `/me/drive/root:/${encodeURIComponent(params.name)}:/content`;

      const binaryContent = Uint8Array.from(atob(params.content), (c) => c.charCodeAt(0));

      const res = await fetch(`${GRAPH_BASE}${base}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': params.mimeType,
        },
        body: binaryContent,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw classifyApiError(PROVIDER, res.status, body?.error?.message || body);
      }
      return parseGraphFile(await res.json());
    },

    async shareFile(fileId: string, params: DriveShareParams): Promise<void> {
      if (params.type === 'anyone') {
        await graphFetch(`/me/drive/items/${fileId}/createLink`, accessToken, {
          method: 'POST',
          body: JSON.stringify({
            type: params.role === 'writer' ? 'edit' : 'view',
            scope: 'anonymous',
          }),
        });
      } else if (params.email) {
        await graphFetch(`/me/drive/items/${fileId}/invite`, accessToken, {
          method: 'POST',
          body: JSON.stringify({
            recipients: [{ email: params.email }],
            roles: [params.role === 'writer' ? 'write' : 'read'],
            requireSignIn: true,
            sendInvitation: false,
          }),
        });
      }
    },

    async getFile(fileId: string): Promise<DriveFile> {
      const res = await graphFetch(
        `/me/drive/items/${fileId}?$select=id,name,file,webUrl,parentReference,createdDateTime,lastModifiedDateTime,size`,
        accessToken
      );
      return parseGraphFile(await res.json());
    },

    async deleteFile(fileId: string): Promise<void> {
      await graphFetch(`/me/drive/items/${fileId}`, accessToken, { method: 'DELETE' });
    },

    async search(query: string, maxResults?: number): Promise<DriveFile[]> {
      const result = await this.listFiles({ query, maxResults: maxResults || 20 });
      return result.items;
    },
  };
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export function createMicrosoftContacts(accessToken: string): ContactsNamespace {
  return {
    async list(opts = {}): Promise<PaginatedList<Contact>> {
      const { maxResults = 100, pageToken } = opts;
      const url = pageToken || (() => {
        const u = new URL(`${GRAPH_BASE}/me/contacts`);
        u.searchParams.set('$top', String(maxResults));
        u.searchParams.set('$select', 'id,displayName,emailAddresses,companyName,jobTitle');
        return u.toString();
      })();

      const res = await graphFetch(url, accessToken);
      const data = await res.json();

      const contacts: Contact[] = (data.value || []).map((c: Record<string, unknown>) => {
        const emails = (c.emailAddresses || []) as Array<Record<string, string>>;
        return {
          id: c.id as string,
          provider: 'microsoft' as const,
          name: (c.displayName as string) || '',
          email: emails[0]?.address || '',
          company: (c.companyName as string) || undefined,
          title: (c.jobTitle as string) || undefined,
        };
      });

      return { items: contacts, nextPageToken: data['@odata.nextLink'] || undefined };
    },

    async search(query: string): Promise<Contact[]> {
      const u = new URL(`${GRAPH_BASE}/me/contacts`);
      u.searchParams.set('$filter', `startswith(displayName,'${query}') or startswith(emailAddresses/any(a:a/address),'${query}')`);
      u.searchParams.set('$top', '20');

      const res = await graphFetch(u.toString(), accessToken);
      const data = await res.json();

      return (data.value || []).map((c: Record<string, unknown>) => {
        const emails = (c.emailAddresses || []) as Array<Record<string, string>>;
        return {
          id: c.id as string,
          provider: 'microsoft' as const,
          name: (c.displayName as string) || '',
          email: emails[0]?.address || '',
          company: (c.companyName as string) || undefined,
          title: (c.jobTitle as string) || undefined,
        };
      });
    },
  };
}
