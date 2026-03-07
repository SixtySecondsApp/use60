// supabase/functions/ms-graph-email/outlook-actions.ts
// Helper functions for Microsoft Graph email operations

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function graphFetch(accessToken: string, url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const graphErr = err.error as Record<string, string> | undefined;
    throw new Error(graphErr?.message || graphErr?.code || `Graph API ${response.status}`);
  }
  // Some endpoints return 204 No Content or 202 Accepted
  if (response.status === 204 || response.status === 202) return null;
  return response.json();
}

/** List messages with optional folder, filter, pagination, and search */
export async function listMessages(accessToken: string, params: {
  folder?: string;
  filter?: string;
  top?: number;
  skip?: number;
  select?: string;
  orderby?: string;
  search?: string;
}) {
  const base = params.folder
    ? `${GRAPH_BASE}/me/mailFolders/${encodeURIComponent(params.folder)}/messages`
    : `${GRAPH_BASE}/me/messages`;

  const qp = new URLSearchParams();
  if (params.filter) qp.set('$filter', params.filter);
  if (params.top) qp.set('$top', String(params.top));
  if (params.skip) qp.set('$skip', String(params.skip));
  if (params.select) qp.set('$select', params.select);
  if (params.orderby) qp.set('$orderby', params.orderby);
  if (params.search) qp.set('$search', `"${params.search}"`);

  const qs = qp.toString();
  const url = qs ? `${base}?${qs}` : base;
  return graphFetch(accessToken, url);
}

/** Get a single message by ID */
export async function getMessage(accessToken: string, params: { id: string; select?: string }) {
  const qp = new URLSearchParams();
  if (params.select) qp.set('$select', params.select);
  const qs = qp.toString();
  const encodedId = encodeURIComponent(params.id);
  const url = qs
    ? `${GRAPH_BASE}/me/messages/${encodedId}?${qs}`
    : `${GRAPH_BASE}/me/messages/${encodedId}`;
  return graphFetch(accessToken, url);
}

/** Mark a message as read or unread */
export async function markAsRead(accessToken: string, params: { id: string; isRead: boolean }) {
  return graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ isRead: params.isRead }),
  });
}

/** Flag or unflag a message */
export async function flagMessage(accessToken: string, params: { id: string; flagged: boolean }) {
  return graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      flag: { flagStatus: params.flagged ? 'flagged' : 'notFlagged' },
    }),
  });
}

/** Move a message to the archive folder */
export async function archiveMessage(accessToken: string, params: { id: string }) {
  return graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(params.id)}/move`, {
    method: 'POST',
    body: JSON.stringify({ destinationId: 'archive' }),
  });
}

/** Move a message to the deleted items folder */
export async function trashMessage(accessToken: string, params: { id: string }) {
  return graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(params.id)}/move`, {
    method: 'POST',
    body: JSON.stringify({ destinationId: 'deleteditems' }),
  });
}

/** Create an unsent draft message */
export async function createDraft(accessToken: string, params: {
  subject: string;
  body: string;
  isHtml?: boolean;
  to: string[];
  cc?: string[];
  bcc?: string[];
}) {
  const toRecipients = params.to.map(addr => ({ emailAddress: { address: addr } }));
  const ccRecipients = params.cc?.map(addr => ({ emailAddress: { address: addr } }));
  const bccRecipients = params.bcc?.map(addr => ({ emailAddress: { address: addr } }));

  const message: Record<string, unknown> = {
    subject: params.subject,
    body: {
      contentType: params.isHtml !== false ? 'HTML' : 'Text',
      content: params.body,
    },
    toRecipients,
  };
  if (ccRecipients?.length) message.ccRecipients = ccRecipients;
  if (bccRecipients?.length) message.bccRecipients = bccRecipients;

  return graphFetch(accessToken, `${GRAPH_BASE}/me/messages`, {
    method: 'POST',
    body: JSON.stringify(message),
  });
}

/** Reply to a message */
export async function replyToMessage(accessToken: string, params: {
  id: string;
  comment: string;
  isHtml?: boolean;
}) {
  // Graph /reply only supports text comments natively. For HTML we use /createReply + send.
  if (params.isHtml) {
    // Create a reply draft, update body, then send
    const draft = await graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(params.id)}/createReply`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (draft?.id) {
      await graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(draft.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          body: { contentType: 'HTML', content: params.comment },
        }),
      });
      return graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(draft.id)}/send`, {
        method: 'POST',
      });
    }
  }
  return graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(params.id)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ comment: params.comment }),
  });
}

/** Forward a message to one or more recipients */
export async function forwardMessage(accessToken: string, params: {
  id: string;
  to: string[];
  comment?: string;
  isHtml?: boolean;
}) {
  const toRecipients = params.to.map(addr => ({ emailAddress: { address: addr } }));

  if (params.isHtml && params.comment) {
    // Create a forward draft, update body with HTML, then send
    const draft = await graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(params.id)}/createForward`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (draft?.id) {
      await graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(draft.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          toRecipients,
          body: { contentType: 'HTML', content: params.comment },
        }),
      });
      return graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(draft.id)}/send`, {
        method: 'POST',
      });
    }
  }

  return graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(params.id)}/forward`, {
    method: 'POST',
    body: JSON.stringify({ comment: params.comment || '', toRecipients }),
  });
}

/** List mail folders */
export async function listFolders(accessToken: string) {
  return graphFetch(accessToken, `${GRAPH_BASE}/me/mailFolders`);
}

/** List Outlook master categories */
export async function listCategories(accessToken: string) {
  return graphFetch(accessToken, `${GRAPH_BASE}/me/outlook/masterCategories`);
}

/** Set categories on a message */
export async function categorizeMessage(accessToken: string, params: { id: string; categories: string[] }) {
  return graphFetch(accessToken, `${GRAPH_BASE}/me/messages/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ categories: params.categories }),
  });
}
