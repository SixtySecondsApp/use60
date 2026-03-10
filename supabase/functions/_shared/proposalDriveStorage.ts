// supabase/functions/_shared/proposalDriveStorage.ts
// WS-023/028: Store proposals in user's Google Drive / OneDrive
//
// Usage in proposal pipeline:
//   const result = await uploadProposalToDrive(supabase, userId, pdfBuffer, metadata);
//   if (result) {
//     // Store Drive URL instead of S3
//     await supabase.from('proposals').update({
//       pdf_url: result.url,
//       storage_provider: result.provider,
//       drive_file_id: result.fileId,
//     }).eq('id', proposalId);
//   }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { createWorkspaceClient } from './workspaceClient.ts';
import type { WorkspaceProvider } from './workspaceErrors.ts';

interface ProposalMetadata {
  company: string;
  title?: string;
  recipientEmail?: string;
}

interface DriveUploadResult {
  provider: 'drive' | 'onedrive';
  fileId: string;
  url: string;
  folderId: string;
}

const PROPOSALS_FOLDER_NAME = '60 Proposals';

/**
 * Upload a proposal PDF to the user's Drive or OneDrive.
 * Returns null if no Drive/OneDrive is connected (caller should fall back to S3).
 */
export async function uploadProposalToDrive(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  pdfBase64: string,
  metadata: ProposalMetadata
): Promise<DriveUploadResult | null> {
  // Try Google Drive first, then OneDrive
  const providers: Array<{ provider: WorkspaceProvider; storageProvider: 'drive' | 'onedrive' }> = [
    { provider: 'google', storageProvider: 'drive' },
    { provider: 'microsoft', storageProvider: 'onedrive' },
  ];

  for (const { provider, storageProvider } of providers) {
    try {
      const client = await createWorkspaceClient(provider, userId, supabase);

      // Find or create "60 Proposals" folder
      const existingFiles = await client.drive.search(PROPOSALS_FOLDER_NAME, 5);
      let folder = existingFiles.find((f) => f.name === PROPOSALS_FOLDER_NAME && f.mimeType.includes('folder'));

      if (!folder) {
        folder = await client.drive.createFolder(PROPOSALS_FOLDER_NAME);
      }

      // Generate filename
      const date = new Date().toISOString().split('T')[0];
      const fileName = `${metadata.company} - ${metadata.title || 'Proposal'} - ${date}.pdf`;

      // Upload PDF
      const file = await client.drive.uploadFile({
        name: fileName,
        parentId: folder.id,
        content: pdfBase64,
        mimeType: 'application/pdf',
      });

      // Share with recipient if email provided
      if (metadata.recipientEmail) {
        try {
          await client.drive.shareFile(file.id, {
            email: metadata.recipientEmail,
            role: 'reader',
            type: 'user',
          });
        } catch (shareErr) {
          console.warn(`[proposalDriveStorage] Share failed for ${metadata.recipientEmail}:`, shareErr);
          // Non-critical — file is uploaded, sharing can be done manually
        }
      }

      return {
        provider: storageProvider,
        fileId: file.id,
        url: file.url,
        folderId: folder.id,
      };
    } catch (err) {
      // This provider not connected or errored — try next
      const msg = (err as Error).message || '';
      if (!msg.includes('not connected')) {
        console.warn(`[proposalDriveStorage] ${provider} upload failed:`, err);
      }
      continue;
    }
  }

  // No Drive/OneDrive connected — caller falls back to S3
  return null;
}
