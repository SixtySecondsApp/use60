import { supabase } from '@/lib/supabase/clientV2';

export interface GoogleDoc {
  documentId: string;
  title: string;
  url: string;
  createdAt: string;
}

export interface DocContent {
  title: string;
  content: string;
  metadata?: {
    meetingId?: string;
    participants?: string[];
    date?: string;
    duration?: number;
  };
}

export class GoogleDocsService {
  /**
   * Create a new Google Doc with content
   * Uses Edge Function to handle Google Docs API
   */
  static async createDocument(docContent: DocContent): Promise<GoogleDoc> {
    try {
      // Get current session for authorization
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('User not authenticated - please log in');
      }

      // Call Edge Function using direct fetch for better header control
      const functionUrl = `${supabase.supabaseUrl}/functions/v1/google-services-router`;
      const requestBody = {
        action: 'docs_create',
        title: docContent.title,
        content: docContent.content,
        metadata: docContent.metadata
      };
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabase.supabaseKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edge Function failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // The error variable is no longer used since we're using direct fetch
      if (!data || !data.documentId) {
        throw new Error('No document ID received from Google Docs API');
      }

      if (!data?.documentId) {
        throw new Error('No document ID received from Google Docs API');
      }

      // Return the created document info
      return {
        documentId: data.documentId,
        title: data.title || docContent.title,
        url: `https://docs.google.com/document/d/${data.documentId}/edit`,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a meeting transcript document
   */
  static async createMeetingTranscript(
    meetingTitle: string,
    transcript: string,
    participants: Array<{ name: string; email: string }>,
    date: string,
    duration?: number
  ): Promise<GoogleDoc> {
    // Format the document content
    const formattedContent = this.formatTranscriptContent(
      meetingTitle,
      transcript,
      participants,
      date,
      duration
    );

    return this.createDocument({
      title: `${meetingTitle} - Transcript`,
      content: formattedContent,
      metadata: {
        meetingId: meetingTitle,
        participants: participants.map(p => p.email),
        date,
        duration
      }
    });
  }

  /**
   * Format transcript content for Google Docs
   */
  private static formatTranscriptContent(
    meetingTitle: string,
    transcript: string,
    participants: Array<{ name: string; email: string }>,
    date: string,
    duration?: number
  ): string {
    const durationText = duration ? `${Math.floor(duration / 60)} minutes` : 'Unknown duration';
    const participantList = participants
      .map(p => `• ${p.name} (${p.email})`)
      .join('\n');

    return `
Meeting: ${meetingTitle}
Date: ${new Date(date).toLocaleString()}
Duration: ${durationText}

Participants:
${participantList}

Transcript:
${transcript}
    `.trim();
  }

  /**
   * Get a document by ID
   */
  static async getDocument(documentId: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('google-docs-get', {
      body: { documentId }
    });

    if (error) {
      throw new Error(error.message || 'Failed to get Google Doc');
    }

    return data;
  }

  /**
   * Update document content
   */
  static async updateDocument(documentId: string, content: string): Promise<void> {
    const { error } = await supabase.functions.invoke('google-docs-update', {
      body: { 
        documentId,
        content 
      }
    });

    if (error) {
      throw new Error(error.message || 'Failed to update Google Doc');
    }
  }

  /**
   * Share document with specific users
   */
  static async shareDocument(
    documentId: string, 
    emails: string[], 
    role: 'reader' | 'writer' | 'commenter' = 'reader'
  ): Promise<void> {
    const { error } = await supabase.functions.invoke('google-docs-share', {
      body: { 
        documentId,
        emails,
        role 
      }
    });

    if (error) {
      throw new Error(error.message || 'Failed to share Google Doc');
    }
  }
}