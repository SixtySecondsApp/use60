/**
 * Skill Folder Service
 *
 * Manages skill folders, documents, and references for the folder-based skill system.
 * Provides CRUD operations for the skill folder structure.
 */

import { supabase } from '../supabase/clientV2';
import type {
  SkillFolder,
  SkillDocument,
  SkillReference,
  SkillDocumentType,
  SkillReferenceType,
  SkillWithFolders,
  SkillTreeNode,
  SkillDocumentFrontmatter,
  ParsedReference,
  buildSkillTree,
  parseReferences,
  // Skill link types
  SkillLink,
  LinkedSkillPreview,
  LinkingSkill,
  SkillSearchResult,
  CreateSkillLinkInput,
  UpdateSkillLinkInput,
} from '../types/skills';

// =============================================================================
// Folder Operations
// =============================================================================

/**
 * Get the folder tree for a skill
 */
export async function getSkillFolderTree(skillId: string): Promise<SkillFolder[]> {
  const { data, error } = await supabase.rpc('get_skill_folder_tree', {
    p_skill_id: skillId,
  });

  if (error) {
    console.error('[skillFolderService.getSkillFolderTree] Error:', error);
    throw new Error(`Failed to get folder tree: ${error.message}`);
  }

  return data || [];
}

/**
 * Create a new folder in a skill
 */
export async function createFolder(
  skillId: string,
  name: string,
  parentFolderId?: string,
  description?: string
): Promise<SkillFolder> {
  const { data, error } = await supabase
    .from('skill_folders')
    .insert({
      skill_id: skillId,
      name,
      parent_folder_id: parentFolderId || null,
      description,
      sort_order: 0, // Will be updated later if needed
    })
    .select()
    .single();

  if (error) {
    console.error('[skillFolderService.createFolder] Error:', error);
    throw new Error(`Failed to create folder: ${error.message}`);
  }

  return data;
}

/**
 * Update a folder
 */
export async function updateFolder(
  folderId: string,
  updates: { name?: string; description?: string; sort_order?: number }
): Promise<SkillFolder> {
  const { data, error } = await supabase
    .from('skill_folders')
    .update(updates)
    .eq('id', folderId)
    .select()
    .single();

  if (error) {
    console.error('[skillFolderService.updateFolder] Error:', error);
    throw new Error(`Failed to update folder: ${error.message}`);
  }

  return data;
}

/**
 * Delete a folder (cascades to documents and child folders)
 */
export async function deleteFolder(folderId: string): Promise<void> {
  const { error } = await supabase.from('skill_folders').delete().eq('id', folderId);

  if (error) {
    console.error('[skillFolderService.deleteFolder] Error:', error);
    throw new Error(`Failed to delete folder: ${error.message}`);
  }
}

/**
 * Move a folder to a new parent
 */
export async function moveFolder(folderId: string, newParentId: string | null): Promise<SkillFolder> {
  const { data, error } = await supabase
    .from('skill_folders')
    .update({ parent_folder_id: newParentId })
    .eq('id', folderId)
    .select()
    .single();

  if (error) {
    console.error('[skillFolderService.moveFolder] Error:', error);
    throw new Error(`Failed to move folder: ${error.message}`);
  }

  return data;
}

// =============================================================================
// Document Operations
// =============================================================================

/**
 * Get documents for a skill
 */
export async function getDocuments(
  skillId: string,
  folderId?: string | null
): Promise<SkillDocument[]> {
  const { data, error } = await supabase.rpc('get_skill_documents', {
    p_skill_id: skillId,
    p_folder_id: folderId || null,
  });

  if (error) {
    console.error('[skillFolderService.getDocuments] Error:', error);
    throw new Error(`Failed to get documents: ${error.message}`);
  }

  return data || [];
}

/**
 * Get all documents for a skill (across all folders)
 */
export async function getAllDocuments(skillId: string): Promise<SkillDocument[]> {
  const { data, error } = await supabase
    .from('skill_documents')
    .select('*')
    .eq('skill_id', skillId)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (error) {
    console.error('[skillFolderService.getAllDocuments] Error:', error);
    throw new Error(`Failed to get all documents: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a single document by ID
 */
export async function getDocument(documentId: string): Promise<SkillDocument | null> {
  const { data, error } = await supabase
    .from('skill_documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[skillFolderService.getDocument] Error:', error);
    throw new Error(`Failed to get document: ${error.message}`);
  }

  return data;
}

/**
 * Create a new document
 */
export async function createDocument(
  skillId: string,
  data: {
    title: string;
    description?: string;
    doc_type: SkillDocumentType;
    content: string;
    folder_id?: string | null;
    frontmatter?: SkillDocumentFrontmatter;
  }
): Promise<SkillDocument> {
  const { data: created, error } = await supabase
    .from('skill_documents')
    .insert({
      skill_id: skillId,
      title: data.title,
      description: data.description,
      doc_type: data.doc_type,
      content: data.content,
      folder_id: data.folder_id || null,
      frontmatter: data.frontmatter || {},
      sort_order: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[skillFolderService.createDocument] Error:', error);
    throw new Error(`Failed to create document: ${error.message}`);
  }

  // Extract and save references
  await syncDocumentReferences(skillId, created.id, data.content);

  return created;
}

/**
 * Update a document
 */
export async function updateDocument(
  documentId: string,
  updates: {
    title?: string;
    description?: string;
    doc_type?: SkillDocumentType;
    content?: string;
    frontmatter?: SkillDocumentFrontmatter;
    sort_order?: number;
  }
): Promise<SkillDocument> {
  const { data, error } = await supabase
    .from('skill_documents')
    .update(updates)
    .eq('id', documentId)
    .select()
    .single();

  if (error) {
    console.error('[skillFolderService.updateDocument] Error:', error);
    throw new Error(`Failed to update document: ${error.message}`);
  }

  // Re-sync references if content changed
  if (updates.content !== undefined) {
    await syncDocumentReferences(data.skill_id, documentId, updates.content);
  }

  return data;
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const { error } = await supabase.from('skill_documents').delete().eq('id', documentId);

  if (error) {
    console.error('[skillFolderService.deleteDocument] Error:', error);
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}

/**
 * Move a document to a different folder
 */
export async function moveDocument(
  documentId: string,
  newFolderId: string | null
): Promise<SkillDocument> {
  const { data, error } = await supabase
    .from('skill_documents')
    .update({ folder_id: newFolderId })
    .eq('id', documentId)
    .select()
    .single();

  if (error) {
    console.error('[skillFolderService.moveDocument] Error:', error);
    throw new Error(`Failed to move document: ${error.message}`);
  }

  return data;
}

// =============================================================================
// Reference Operations
// =============================================================================

/**
 * Get references for a document
 */
export async function getDocumentReferences(documentId: string): Promise<SkillReference[]> {
  const { data, error } = await supabase.rpc('get_document_references', {
    p_document_id: documentId,
  });

  if (error) {
    console.error('[skillFolderService.getDocumentReferences] Error:', error);
    throw new Error(`Failed to get document references: ${error.message}`);
  }

  return data || [];
}

/**
 * Get all references for a skill
 */
export async function getSkillReferences(skillId: string): Promise<SkillReference[]> {
  const { data, error } = await supabase.rpc('get_skill_references', {
    p_skill_id: skillId,
  });

  if (error) {
    console.error('[skillFolderService.getSkillReferences] Error:', error);
    throw new Error(`Failed to get skill references: ${error.message}`);
  }

  return data || [];
}

/**
 * Sync references for a document (delete old, create new)
 */
async function syncDocumentReferences(
  skillId: string,
  documentId: string,
  content: string
): Promise<void> {
  // Import parseReferences dynamically to avoid circular dependency
  const { parseReferences } = await import('../types/skills');

  // Delete existing references for this document
  await supabase.from('skill_references').delete().eq('source_document_id', documentId);

  // Parse new references from content
  const parsed = parseReferences(content);
  if (parsed.length === 0) return;

  // Resolve references and create records
  const references: Partial<SkillReference>[] = [];

  for (const ref of parsed) {
    const record: Partial<SkillReference> = {
      source_skill_id: skillId,
      source_document_id: documentId,
      target_type: ref.type,
      reference_text: ref.text,
      reference_path: ref.path,
      start_position: ref.start,
      end_position: ref.end,
    };

    if (ref.type === 'variable') {
      record.target_variable = ref.path;
    } else if (ref.type === 'skill' && ref.path) {
      // Look up skill by key
      const { data: skill } = await supabase
        .from('platform_skills')
        .select('id')
        .eq('skill_key', ref.path)
        .eq('is_active', true)
        .single();
      if (skill) {
        record.target_skill_id = skill.id;
      }
    } else if (ref.type === 'document' && ref.path) {
      // Look up document by path
      const { data: doc } = await supabase
        .from('skill_documents')
        .select('id')
        .eq('skill_id', skillId)
        .ilike('title', ref.path.split('/').pop() || '')
        .single();
      if (doc) {
        record.target_document_id = doc.id;
      }
    }

    references.push(record);
  }

  // Insert new references
  if (references.length > 0) {
    const { error } = await supabase.from('skill_references').insert(references);
    if (error) {
      console.error('[skillFolderService.syncDocumentReferences] Error:', error);
      // Don't throw - references are non-critical
    }
  }
}

/**
 * Create a reference manually
 */
export async function createReference(
  sourceSkillId: string,
  sourceDocumentId: string | null,
  targetType: SkillReferenceType,
  referenceText: string,
  options: {
    targetSkillId?: string;
    targetDocumentId?: string;
    targetVariable?: string;
    referencePath?: string;
  }
): Promise<SkillReference> {
  const { data, error } = await supabase
    .from('skill_references')
    .insert({
      source_skill_id: sourceSkillId,
      source_document_id: sourceDocumentId,
      target_type: targetType,
      reference_text: referenceText,
      target_skill_id: options.targetSkillId,
      target_document_id: options.targetDocumentId,
      target_variable: options.targetVariable,
      reference_path: options.referencePath,
    })
    .select()
    .single();

  if (error) {
    console.error('[skillFolderService.createReference] Error:', error);
    throw new Error(`Failed to create reference: ${error.message}`);
  }

  return data;
}

// =============================================================================
// Skill with Folders Operations
// =============================================================================

/**
 * Get a complete skill with its folder structure
 */
export async function getSkillWithFolders(skillId: string): Promise<SkillWithFolders | null> {
  // Get the skill
  const { data: skill, error: skillError } = await supabase
    .from('platform_skills')
    .select('*')
    .eq('id', skillId)
    .single();

  if (skillError) {
    if (skillError.code === 'PGRST116') {
      return null;
    }
    console.error('[skillFolderService.getSkillWithFolders] Error:', skillError);
    throw new Error(`Failed to get skill: ${skillError.message}`);
  }

  // Get folders, documents, references, and linked skills in parallel
  const [folders, documents, references, linkedSkills] = await Promise.all([
    getSkillFolderTree(skillId),
    getAllDocuments(skillId),
    getSkillReferences(skillId),
    getSkillLinksInternal(skillId),
  ]);

  return {
    id: skill.id,
    skill_key: skill.skill_key,
    category: skill.category,
    frontmatter: skill.frontmatter,
    content_template: skill.content_template,
    version: skill.version,
    is_active: skill.is_active,
    created_by: skill.created_by,
    created_at: skill.created_at,
    updated_at: skill.updated_at,
    folders,
    documents,
    references,
    linked_skills: linkedSkills.length > 0 ? linkedSkills : undefined,
  };
}

/**
 * Internal helper to get skill links without throwing on error
 * Returns empty array if no links or error
 */
async function getSkillLinksInternal(parentSkillId: string): Promise<LinkedSkillPreview[]> {
  try {
    const { data, error } = await supabase.rpc('get_skill_links', {
      p_parent_skill_id: parentSkillId,
    });

    if (error) {
      // Don't throw - links are optional
      console.warn('[skillFolderService.getSkillLinksInternal] Warning:', error.message);
      return [];
    }

    return (data || []).map((row: {
      id: string;
      linked_skill_id: string;
      linked_skill_key: string;
      linked_skill_name: string;
      linked_skill_description: string | null;
      linked_skill_category: string;
      folder_id: string | null;
      folder_name: string | null;
      display_order: number;
      created_at: string;
    }) => ({
      id: row.linked_skill_id,
      link_id: row.id,
      skill_key: row.linked_skill_key,
      name: row.linked_skill_name,
      description: row.linked_skill_description || undefined,
      category: row.linked_skill_category,
      folder_id: row.folder_id,
      folder_name: row.folder_name || undefined,
      display_order: row.display_order,
      created_at: row.created_at,
    }));
  } catch {
    // Silently return empty - links may not be set up yet
    return [];
  }
}

/**
 * Get skill by key with folder structure
 */
export async function getSkillByKeyWithFolders(skillKey: string): Promise<SkillWithFolders | null> {
  const { data: skill, error } = await supabase
    .from('platform_skills')
    .select('id')
    .eq('skill_key', skillKey)
    .eq('is_active', true)
    .single();

  if (error || !skill) {
    return null;
  }

  return getSkillWithFolders(skill.id);
}

// =============================================================================
// Autocomplete Helpers
// =============================================================================

/**
 * Search documents for @ mention autocomplete
 */
export async function searchDocumentsForAutocomplete(
  skillId: string,
  query: string,
  limit = 10
): Promise<Array<{ id: string; title: string; path: string; doc_type: SkillDocumentType }>> {
  const { data, error } = await supabase
    .from('skill_documents')
    .select('id, title, folder_id, doc_type')
    .eq('skill_id', skillId)
    .ilike('title', `%${query}%`)
    .limit(limit);

  if (error) {
    console.error('[skillFolderService.searchDocumentsForAutocomplete] Error:', error);
    return [];
  }

  // Get folder paths for documents
  const folders = await getSkillFolderTree(skillId);
  const folderPathMap = new Map<string, string>();
  for (const folder of folders) {
    folderPathMap.set(folder.id, folder.path || folder.name);
  }

  return (data || []).map((doc) => ({
    id: doc.id,
    title: doc.title,
    path: doc.folder_id ? `${folderPathMap.get(doc.folder_id) || ''}/${doc.title}` : doc.title,
    doc_type: doc.doc_type,
  }));
}

/**
 * Search skills for @ mention autocomplete
 */
export async function searchSkillsForAutocomplete(
  query: string,
  limit = 10
): Promise<Array<{ skill_key: string; name: string; category: string }>> {
  const { data, error } = await supabase
    .from('platform_skills')
    .select('skill_key, frontmatter, category')
    .eq('is_active', true)
    .or(`skill_key.ilike.%${query}%,frontmatter->>name.ilike.%${query}%`)
    .limit(limit);

  if (error) {
    console.error('[skillFolderService.searchSkillsForAutocomplete] Error:', error);
    return [];
  }

  return (data || []).map((skill) => ({
    skill_key: skill.skill_key,
    name: skill.frontmatter?.name || skill.skill_key,
    category: skill.category,
  }));
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Reorder items within a folder
 */
export async function reorderItems(
  type: 'folder' | 'document',
  items: Array<{ id: string; sort_order: number }>
): Promise<void> {
  const table = type === 'folder' ? 'skill_folders' : 'skill_documents';

  // Update each item's sort order
  const updates = items.map((item) =>
    supabase.from(table).update({ sort_order: item.sort_order }).eq('id', item.id)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    console.error('[skillFolderService.reorderItems] Errors:', errors);
    throw new Error('Failed to reorder some items');
  }
}

/**
 * Duplicate a folder with its contents
 */
export async function duplicateFolder(
  folderId: string,
  newName?: string
): Promise<SkillFolder> {
  // Get the original folder
  const { data: original, error: fetchError } = await supabase
    .from('skill_folders')
    .select('*')
    .eq('id', folderId)
    .single();

  if (fetchError || !original) {
    throw new Error('Folder not found');
  }

  // Create the new folder
  const newFolder = await createFolder(
    original.skill_id,
    newName || `${original.name} (copy)`,
    original.parent_folder_id,
    original.description
  );

  // Get and duplicate documents in the folder
  const documents = await getDocuments(original.skill_id, folderId);
  for (const doc of documents) {
    await createDocument(original.skill_id, {
      title: doc.title,
      description: doc.description,
      doc_type: doc.doc_type,
      content: doc.content,
      folder_id: newFolder.id,
      frontmatter: doc.frontmatter,
    });
  }

  return newFolder;
}

/**
 * Duplicate a document
 */
export async function duplicateDocument(
  documentId: string,
  newTitle?: string
): Promise<SkillDocument> {
  const original = await getDocument(documentId);
  if (!original) {
    throw new Error('Document not found');
  }

  return createDocument(original.skill_id, {
    title: newTitle || `${original.title} (copy)`,
    description: original.description,
    doc_type: original.doc_type,
    content: original.content,
    folder_id: original.folder_id,
    frontmatter: original.frontmatter,
  });
}

// =============================================================================
// Skill Link Operations (for Sequences / Mega Skills)
// =============================================================================

/**
 * Get linked skills for a parent skill
 * Uses the database function for efficient fetching with preview data
 */
export async function getSkillLinks(parentSkillId: string): Promise<LinkedSkillPreview[]> {
  const { data, error } = await supabase.rpc('get_skill_links', {
    p_parent_skill_id: parentSkillId,
  });

  if (error) {
    console.error('[skillFolderService.getSkillLinks] Error:', error);
    throw new Error(`Failed to get skill links: ${error.message}`);
  }

  // Map database result to LinkedSkillPreview type
  return (data || []).map((row: {
    id: string;
    linked_skill_id: string;
    linked_skill_key: string;
    linked_skill_name: string;
    linked_skill_description: string | null;
    linked_skill_category: string;
    folder_id: string | null;
    folder_name: string | null;
    display_order: number;
    created_at: string;
  }) => ({
    id: row.linked_skill_id,
    link_id: row.id,
    skill_key: row.linked_skill_key,
    name: row.linked_skill_name,
    description: row.linked_skill_description || undefined,
    category: row.linked_skill_category,
    folder_id: row.folder_id,
    folder_name: row.folder_name || undefined,
    display_order: row.display_order,
    created_at: row.created_at,
  }));
}

/**
 * Get skills that link to a given skill (reverse lookup)
 * Useful for showing "used by" information
 */
export async function getSkillsLinkingTo(linkedSkillId: string): Promise<LinkingSkill[]> {
  const { data, error } = await supabase.rpc('get_skills_linking_to', {
    p_linked_skill_id: linkedSkillId,
  });

  if (error) {
    console.error('[skillFolderService.getSkillsLinkingTo] Error:', error);
    throw new Error(`Failed to get linking skills: ${error.message}`);
  }

  // Map database result to LinkingSkill type
  return (data || []).map((row: {
    id: string;
    parent_skill_id: string;
    parent_skill_key: string;
    parent_skill_name: string;
    parent_skill_category: string;
    created_at: string;
  }) => ({
    id: row.parent_skill_id,
    link_id: row.id,
    skill_key: row.parent_skill_key,
    name: row.parent_skill_name,
    category: row.parent_skill_category,
    created_at: row.created_at,
  }));
}

/**
 * Add a skill link (link one skill to another)
 */
export async function addSkillLink(input: CreateSkillLinkInput): Promise<SkillLink> {
  // First check for circular references
  const { data: isCircular, error: circularError } = await supabase.rpc('check_skill_link_circular', {
    p_parent_skill_id: input.parent_skill_id,
    p_linked_skill_id: input.linked_skill_id,
  });

  if (circularError) {
    console.error('[skillFolderService.addSkillLink] Circular check error:', circularError);
    throw new Error(`Failed to check for circular references: ${circularError.message}`);
  }

  if (isCircular) {
    throw new Error('Cannot create link: this would create a circular reference');
  }

  // Create the link
  const { data, error } = await supabase
    .from('skill_links')
    .insert({
      parent_skill_id: input.parent_skill_id,
      linked_skill_id: input.linked_skill_id,
      folder_id: input.folder_id || null,
      display_order: input.display_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      throw new Error('This skill is already linked');
    }
    console.error('[skillFolderService.addSkillLink] Error:', error);
    throw new Error(`Failed to add skill link: ${error.message}`);
  }

  return data;
}

/**
 * Remove a skill link
 */
export async function removeSkillLink(linkId: string): Promise<void> {
  const { error } = await supabase.from('skill_links').delete().eq('id', linkId);

  if (error) {
    console.error('[skillFolderService.removeSkillLink] Error:', error);
    throw new Error(`Failed to remove skill link: ${error.message}`);
  }
}

/**
 * Update a skill link (move to different folder, change order)
 */
export async function updateSkillLink(linkId: string, updates: UpdateSkillLinkInput): Promise<SkillLink> {
  const { data, error } = await supabase
    .from('skill_links')
    .update({
      folder_id: updates.folder_id,
      display_order: updates.display_order,
    })
    .eq('id', linkId)
    .select()
    .single();

  if (error) {
    console.error('[skillFolderService.updateSkillLink] Error:', error);
    throw new Error(`Failed to update skill link: ${error.message}`);
  }

  return data;
}

/**
 * Get preview data for a linked skill
 * Returns full skill data for read-only preview in the editor
 */
export async function getLinkedSkillPreview(skillId: string): Promise<SkillWithFolders | null> {
  // Use the existing getSkillWithFolders function
  return getSkillWithFolders(skillId);
}

/**
 * Search skills available for linking
 * Excludes already-linked skills and the parent skill itself
 */
export async function searchSkillsForLinking(
  parentSkillId: string,
  query: string = '',
  category?: string,
  limit: number = 20
): Promise<SkillSearchResult[]> {
  const { data, error } = await supabase.rpc('search_skills_for_linking', {
    p_parent_skill_id: parentSkillId,
    p_query: query,
    p_category: category || null,
    p_limit: limit,
  });

  if (error) {
    console.error('[skillFolderService.searchSkillsForLinking] Error:', error);
    throw new Error(`Failed to search skills for linking: ${error.message}`);
  }

  // Map database result to SkillSearchResult type
  return (data || []).map((row: {
    id: string;
    skill_key: string;
    name: string;
    description: string | null;
    category: string;
    is_already_linked: boolean;
  }) => ({
    id: row.id,
    skill_key: row.skill_key,
    name: row.name,
    description: row.description || undefined,
    category: row.category,
    is_already_linked: row.is_already_linked,
  }));
}

/**
 * Reorder skill links within a folder (or root)
 */
export async function reorderSkillLinks(
  items: Array<{ id: string; display_order: number }>
): Promise<void> {
  const updates = items.map((item) =>
    supabase.from('skill_links').update({ display_order: item.display_order }).eq('id', item.id)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    console.error('[skillFolderService.reorderSkillLinks] Errors:', errors);
    throw new Error('Failed to reorder some skill links');
  }
}

// =============================================================================
// Export Service Object
// =============================================================================

export const skillFolderService = {
  // Folders
  getSkillFolderTree,
  createFolder,
  updateFolder,
  deleteFolder,
  moveFolder,
  duplicateFolder,

  // Documents
  getDocuments,
  getAllDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  moveDocument,
  duplicateDocument,

  // References
  getDocumentReferences,
  getSkillReferences,
  createReference,

  // Skills with folders
  getSkillWithFolders,
  getSkillByKeyWithFolders,

  // Skill Links (for Sequences / Mega Skills)
  getSkillLinks,
  getSkillsLinkingTo,
  addSkillLink,
  removeSkillLink,
  updateSkillLink,
  getLinkedSkillPreview,
  searchSkillsForLinking,
  reorderSkillLinks,

  // Autocomplete
  searchDocumentsForAutocomplete,
  searchSkillsForAutocomplete,

  // Bulk operations
  reorderItems,
};

export default skillFolderService;
