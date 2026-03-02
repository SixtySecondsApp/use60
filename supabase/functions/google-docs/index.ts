import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

interface CreateDocumentRequest {
  name: string;
  type: 'document' | 'spreadsheet' | 'presentation' | 'form';
  content?: string;
  templateId?: string;
  folderId?: string;
  shareWith?: string[];
  permissionLevel?: 'view' | 'comment' | 'edit';
  contactId?: string;
  dealId?: string;
}

interface GetDocumentRequest {
  documentId: string;
}

interface UpdateDocumentRequest {
  documentId: string;
  content?: string;
  name?: string;
}

interface ShareDocumentRequest {
  documentId: string;
  emails: string[];
  permissionLevel: 'view' | 'comment' | 'edit';
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Verify the JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid authentication token');
    }
    // Get user's Google integration
    const { data: integration, error: integrationError } = await supabase
      .from('google_integrations')
      .select('id, access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      throw new Error('Google integration not found. Please connect your Google account first.');
    }

    // Check if token needs refresh
    const expiresAt = new Date(integration.expires_at);
    const now = new Date();
    let accessToken = integration.access_token;
    
    if (expiresAt <= now) {
      accessToken = await refreshAccessToken(integration.refresh_token, supabase, user.id);
    }

    // Parse request based on method and URL
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    let requestBody: any = {};
    if (req.method === 'POST') {
      requestBody = await req.json();
    }

    let response;

    switch (action) {
      case 'create':
        response = await createDocument(accessToken, requestBody as CreateDocumentRequest, supabase, integration.id, user.id);
        break;
      
      case 'get':
        response = await getDocument(accessToken, requestBody as GetDocumentRequest);
        break;
      
      case 'update':
        response = await updateDocument(accessToken, requestBody as UpdateDocumentRequest);
        break;
      
      case 'share':
        response = await shareDocument(accessToken, requestBody as ShareDocumentRequest);
        break;
      
      case 'list':
        response = await listDocuments(accessToken);
        break;
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Log the successful operation
    await supabase
      .from('google_service_logs')
      .insert({
        integration_id: integration.id,
        service: 'docs',
        action: action || 'unknown',
        status: 'success',
        request_data: requestBody,
        response_data: { success: true },
      });

    return new Response(
      JSON.stringify(response),
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: 'Google Docs service error'
      }),
      {
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
      }
    );
  }
});

async function refreshAccessToken(refreshToken: string, supabase: any, userId: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error('Failed to refresh access token');
  }

  const data = await response.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;
  
  // Update the integration with new token
  const expiresAt = new Date(Date.now() + (expiresIn * 1000));
  await supabase
    .from('google_integrations')
    .update({
      access_token: newAccessToken,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  return newAccessToken;
}

async function createDocument(
  accessToken: string, 
  request: CreateDocumentRequest,
  supabase: any,
  integrationId: string,
  userId: string
): Promise<any> {
  let createUrl: string;
  let body: any = {};
  
  // Determine the API endpoint based on document type
  switch (request.type) {
    case 'document':
      createUrl = 'https://docs.googleapis.com/v1/documents';
      body = { title: request.name };
      break;
    
    case 'spreadsheet':
      createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
      body = { 
        properties: { title: request.name },
        sheets: [{ properties: { title: 'Sheet1' } }]
      };
      break;
    
    case 'presentation':
      createUrl = 'https://slides.googleapis.com/v1/presentations';
      body = { title: request.name };
      break;
    
    case 'form':
      createUrl = 'https://forms.googleapis.com/v1/forms';
      body = { info: { title: request.name } };
      break;
    
    default:
      throw new Error(`Unsupported document type: ${request.type}`);
  }

  // Create the document
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!createResponse.ok) {
    const errorData = await createResponse.json();
    throw new Error(`Google API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const document = await createResponse.json();
  const documentId = document.documentId || document.spreadsheetId || document.presentationId || document.formId;
  // Build the document URL
  let documentUrl: string;
  switch (request.type) {
    case 'document':
      documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
      break;
    case 'spreadsheet':
      documentUrl = `https://docs.google.com/spreadsheets/d/${documentId}/edit`;
      break;
    case 'presentation':
      documentUrl = `https://docs.google.com/presentation/d/${documentId}/edit`;
      break;
    case 'form':
      documentUrl = `https://docs.google.com/forms/d/${documentId}/edit`;
      break;
    default:
      documentUrl = '';
  }

  // If content is provided and it's a document, update it with content
  if (request.content && request.type === 'document') {
    await updateDocumentContent(accessToken, documentId, request.content);
  }

  // Move to folder if specified
  if (request.folderId) {
    await moveToFolder(accessToken, documentId, request.folderId);
  }

  // Share with specified users
  if (request.shareWith && request.shareWith.length > 0) {
    await shareDocument(accessToken, {
      documentId,
      emails: request.shareWith,
      permissionLevel: request.permissionLevel || 'view',
    });
  }

  // Store document reference in database
  const { error: dbError } = await supabase
    .from('contact_documents')
    .insert({
      contact_id: request.contactId || null,
      deal_id: request.dealId || null,
      integration_id: integrationId,
      google_doc_id: documentId,
      document_name: request.name,
      document_type: request.type,
      document_url: documentUrl,
      folder_id: request.folderId || null,
      is_shared: (request.shareWith && request.shareWith.length > 0) || false,
      shared_with: request.shareWith || [],
      permission_level: request.permissionLevel || 'view',
      template_id: request.templateId || null,
    });

  if (dbError) {
    // Don't throw - document was created successfully
  }

  return {
    success: true,
    documentId,
    documentUrl,
    name: request.name,
    type: request.type,
  };
}

async function updateDocumentContent(accessToken: string, documentId: string, content: string): Promise<void> {
  const requests = [
    {
      insertText: {
        location: { index: 1 },
        text: content,
      },
    },
  ];

  const response = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to update document content: ${errorData.error?.message || 'Unknown error'}`);
  }
}

async function moveToFolder(accessToken: string, fileId: string, folderId: string): Promise<void> {
  // First, get the current parent folders
  const getParentsResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!getParentsResponse.ok) {
    return;
  }

  const { parents } = await getParentsResponse.json();
  const previousParents = parents ? parents.join(',') : '';

  // Move the file to the new folder
  const moveResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}&removeParents=${previousParents}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!moveResponse.ok) {
  }
}

async function getDocument(accessToken: string, request: GetDocumentRequest): Promise<any> {
  const response = await fetch(`https://docs.googleapis.com/v1/documents/${request.documentId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Google API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const document = await response.json();
  
  return {
    success: true,
    document,
  };
}

async function updateDocument(accessToken: string, request: UpdateDocumentRequest): Promise<any> {
  const requests: any[] = [];

  if (request.content) {
    // Clear existing content and insert new content
    requests.push(
      {
        deleteContentRange: {
          range: {
            startIndex: 1,
            endIndex: -1,
          },
        },
      },
      {
        insertText: {
          location: { index: 1 },
          text: request.content,
        },
      }
    );
  }

  if (requests.length === 0) {
    return { success: true, message: 'No updates to apply' };
  }

  const response = await fetch(`https://docs.googleapis.com/v1/documents/${request.documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Google API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  return {
    success: true,
    message: 'Document updated successfully',
  };
}

async function shareDocument(accessToken: string, request: ShareDocumentRequest): Promise<any> {
  const results = [];

  for (const email of request.emails) {
    const role = request.permissionLevel === 'view' ? 'reader' : 
                 request.permissionLevel === 'comment' ? 'commenter' : 'writer';

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${request.documentId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role,
        type: 'user',
        emailAddress: email,
      }),
    });

    if (response.ok) {
      results.push({ email, success: true });
    } else {
      const errorData = await response.json();
      results.push({ email, success: false, error: errorData.error?.message });
    }
  }

  return {
    success: true,
    results,
  };
}

async function listDocuments(accessToken: string): Promise<any> {
  const mimeTypes = [
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
    'application/vnd.google-apps.form',
  ];

  const query = mimeTypes.map(type => `mimeType='${type}'`).join(' or ');

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,createdTime,modifiedTime,webViewLink)`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Google API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  
  return {
    success: true,
    documents: data.files || [],
  };
}