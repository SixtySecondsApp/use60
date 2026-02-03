# Progress Log — Skills Folder Structure & Editor

## Feature Overview
Restructure skills system to support folder-based organization with:
- Virtual folders within each skill
- Child documents (prompts, examples, assets)
- @ mentions for referencing files/skills
- {variable} interpolation for organization context
- Split-pane detail view UI

---

## Codebase Patterns
<!-- Reusable learnings discovered during implementation -->

- Platform skills stored in `platform_skills` table with JSONB frontmatter
- Organization skills compiled via `skillCompiler.ts` with `${variable}` syntax
- Skills fetched by agent via `get-agent-skills` edge function
- Platform components in `src/components/platform/`
- Existing editor: `SkillDocumentEditor.tsx` (single document, no folders)

---

## Dependency Graph

```
SKILL-001 (folders table)
    ├── SKILL-002 (documents table) ──┬── SKILL-004 (db functions)
    │                                 │        │
    └── SKILL-003 (references table) ─┘        │
                │                              │
                └── SKILL-006 (types) ─────────┤
                        │                      │
                        ├── SKILL-007 (folder service)
                        │        │
                        │        ├── SKILL-009 (folder tree UI)
                        │        └── SKILL-010 (create modals)
                        │                │
                        │                └── SKILL-011 (detail view)
                        │                        │
        SKILL-005 (frontmatter) ── SKILL-008 (compiler) ── SKILL-012 (editor)
                                                                 │
                                                         SKILL-013 (page integration)
                                                                 │
                                                         SKILL-014 (agent API)
```

---

## Session Log

### 2026-01-30 — SKILL-001, SKILL-002, SKILL-003, SKILL-004 ✅
**Story**: Create database schema (folders, documents, references tables + functions)
**Files**: supabase/migrations/20260130000001_skill_folders_structure.sql
**Combined**: All schema stories in single migration
**Gates**: N/A (SQL migration)
**Learnings**: Combined related schema changes into single migration for atomic deployment

---

### 2026-01-30 — SKILL-006 ✅
**Story**: Create TypeScript types for folder structure
**Files**: src/lib/types/skills.ts
**Gates**: TypeScript compilation
**Learnings**: Included helper functions buildSkillTree, parseReferences, getVariableSuggestions

---

### 2026-01-30 — SKILL-007 ✅
**Story**: Create skill folder service
**Files**: src/lib/services/skillFolderService.ts
**Gates**: TypeScript compilation
**Learnings**: Service includes CRUD for folders/documents, reference syncing, autocomplete helpers

---

### 2026-01-30 — SKILL-009 ✅
**Story**: Create SkillFolderTree component
**Files**: src/components/platform/SkillFolderTree.tsx
**Gates**: TypeScript compilation
**Learnings**: Tree component with expand/collapse, context menu, doc type icons

---

### 2026-01-30 — SKILL-010 ✅
**Story**: Create folder/document creation modals
**Files**:
  - src/components/platform/CreateFolderModal.tsx
  - src/components/platform/CreateDocumentModal.tsx
**Gates**: TypeScript compilation

---

### 2026-01-30 — SKILL-011 ✅
**Story**: Create SkillDetailView split-pane layout
**Files**: src/components/platform/SkillDetailView.tsx
**Gates**: TypeScript compilation
**Learnings**: ResizablePanelGroup for split pane, integrated folder tree + content editor

---

### 2026-01-30 — SKILL-012 ✅
**Story**: Create content editor with @ and {variable} autocomplete
**Files**: src/components/platform/SkillContentEditor.tsx
**Gates**: TypeScript compilation
**Learnings**: Autocomplete popup with keyboard navigation, variable picker modal

---

### 2026-01-30 — SKILL-005 ✅
**Story**: Update frontmatter YAML structure for better AI matching
**Files**: supabase/migrations/20260130000002_skill_frontmatter_v2.sql
**Gates**: N/A (SQL migration)
**Learnings**: Added validate_skill_frontmatter, migrate_frontmatter_v1_to_v2, get_skills_by_intent functions

---

### 2026-01-30 — SKILL-008 ✅
**Story**: Update skillCompiler to resolve @ references
**Files**: src/lib/utils/skillCompiler.ts
**Gates**: TypeScript compilation
**Learnings**: Added resolveReferences, resolveShortVariables, buildReferenceContext, compileSkillWithDocuments functions

---

### 2026-01-30 — SKILL-013 ✅
**Story**: Integrate detail view into skills page
**Files**: src/pages/platform/PlatformSkillViewPage.tsx
**Gates**: TypeScript compilation
**Learnings**: Added "Folders" tab to skill view page with SkillDetailView integration

---

### 2026-01-30 — SKILL-014 ✅
**Story**: Update get-agent-skills to include folder documents
**Files**: supabase/functions/get-agent-skills/index.ts
**Gates**: N/A (edge function)
**Learnings**: Added V2 API with include_documents and resolve_references parameters, getSkillFolderStructure helper, resolveSkillReferences for @ mention resolution

---

## Key Decisions

1. **Virtual folders in DB** (not filesystem) - keeps existing Supabase infrastructure
2. **@ syntax** for references - familiar from GitHub/Slack, easy to parse
3. **{variable}** syntax - consistent with existing `${variable}` but shorter
4. **Split-pane UI** - folder tree left, content editor right
5. **Document types**: prompt, example, asset, reference

---

## API Changes

### New Tables
- `skill_folders` - folder hierarchy within skills
- `skill_documents` - child documents in folders
- `skill_references` - @ mention tracking

### Updated
- `platform_skills.frontmatter` - enhanced YAML structure
- `get-agent-skills` - includes resolved folder content

---

## UI Components

| Component | Purpose | Status |
|-----------|---------|--------|
| SkillFolderTree | Tree navigation | ✅ Complete |
| SkillDetailView | Split-pane container | ✅ Complete |
| SkillContentEditor | Editor with autocomplete | ✅ Complete |
| MentionAutocomplete | @ dropdown | ✅ Integrated in SkillContentEditor |
| VariableAutocomplete | {var} dropdown | ✅ Integrated in SkillContentEditor |
| CreateFolderModal | New folder form | ✅ Complete |
| CreateDocumentModal | New document form | ✅ Complete |
