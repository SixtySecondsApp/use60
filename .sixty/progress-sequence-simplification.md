# Progress Log — Sequence Simplification

## Feature Overview

**Goal**: Simplify sequences by making them "mega skills" that reference other skills via `@skill-name` in the folder tree. Same editor UI, HITL is just another skill, copilot prefers sequences over individual skills.

## Architecture Summary

```
Sequence (category: agent-sequence)
├── SKILL.md              # Orchestration guide - how to use linked skills
├── folders/
│   ├── @research/company-lookup     # Dynamic link (read-only preview)
│   ├── @hitl/slack-approval         # HITL is just a skill
│   └── @writing/cold-email          # Another linked skill
```

**Copilot Decision Flow:**
1. Check sequences first (pre-built, tested orchestrations)
2. If match → use sequence (preferred)
3. If no match → fall back to individual skills (autonomous)

---

## Codebase Patterns

<!-- Reusable learnings across stories -->

- Skill links stored in `skill_links` table
- Linked skills render as read-only in SkillDetailView
- HITL skills pause execution with `job_id`
- Sequences = skills with `category: agent-sequence`

---

## Session Log

### Plan Created — 2025-02-03

**Stories**: 10 total
**Estimated**: 3.5 hours

| ID | Title | Est |
|----|-------|-----|
| SEQ-001 | Create skill_links database table | 15m |
| SEQ-002 | Create TypeScript types for skill links | 10m |
| SEQ-003 | Update skillFolderService for skill links | 20m |
| SEQ-004 | Update SkillFolderTree for linked skills | 25m |
| SEQ-005 | Create AddSkillLinkModal component | 20m |
| SEQ-006 | Update SkillDetailView for read-only preview | 20m |
| SEQ-007 | Create HITL skill template | 20m |
| SEQ-008 | Create sequence execution engine | 30m |
| SEQ-009 | Update copilot routing to prefer sequences | 25m |
| SEQ-010 | Simplify AgentSequencesPage | 25m |

---

<!-- Session entries will be added below as stories complete -->

### SEQ-001 ✅ — Create skill_links database table

**File**: `supabase/migrations/20260203000000_skill_links.sql`

**Created**:
- `skill_links` table with id, parent_skill_id, linked_skill_id, folder_id, display_order
- Foreign keys to platform_skills (both parent and linked)
- Optional folder_id for placement in folder tree
- RLS policies matching platform_skills patterns (admin-only write, public read for active skills)
- Unique constraint on (parent_skill_id, linked_skill_id)
- Check constraint preventing self-references

**Functions**:
- `get_skill_links(parent_skill_id)` - Get linked skills with preview data
- `get_skills_linking_to(linked_skill_id)` - Reverse lookup for "used by"
- `check_skill_link_circular(parent, linked)` - Prevent circular dependencies
- `search_skills_for_linking(parent, query, category, limit)` - Search available skills

---

### SEQ-002 ✅ — Create TypeScript types for skill links

**File**: `src/lib/types/skills.ts`

**Added Types**:
- `SkillLink` - Database row type for skill links
- `LinkedSkillPreview` - Minimal data for rendering linked skills in tree
- `LinkingSkill` - Reverse lookup result type
- `SkillSearchResult` - Search result for linking modal
- `CreateSkillLinkInput` / `UpdateSkillLinkInput` - Input types for service

**Updated Types**:
- `SkillWithFolders` - Added optional `linked_skills` array
- `SkillTreeNode` - Added `'linked-skill'` type and linked skill fields

**Updated Functions**:
- `buildSkillTree()` - Now accepts optional `linkedSkills` param and renders them with @ prefix

---

### SEQ-003 ✅ — Update skillFolderService for skill links

**File**: `src/lib/services/skillFolderService.ts`

**Added Functions**:
- `getSkillLinks(parentSkillId)` - Get linked skills with preview data
- `getSkillsLinkingTo(linkedSkillId)` - Reverse lookup for "used by"
- `addSkillLink(input)` - Create link with circular reference check
- `removeSkillLink(linkId)` - Remove a link
- `updateSkillLink(linkId, updates)` - Move link to folder, change order
- `getLinkedSkillPreview(skillId)` - Get full skill data for read-only preview
- `searchSkillsForLinking(parentId, query, category, limit)` - Search available skills
- `reorderSkillLinks(items)` - Reorder links within folder

**Updated Functions**:
- `getSkillWithFolders()` - Now fetches linked_skills in parallel with folders/documents

---

### SEQ-004 ✅ — Update SkillFolderTree for linked skills

**File**: `src/components/platform/SkillFolderTree.tsx`

**New Props**:
- `linkedSkills?: LinkedSkillPreview[]` - Linked skills to display
- `onAddSkillLink?: (folderId?) => void` - Open link modal
- `onRemoveSkillLink?: (link) => void` - Remove a link
- `onEditOriginalSkill?: (link) => void` - Navigate to original skill

**UI Changes**:
- Linked skills display with @ prefix and indigo color scheme
- Category badge shown next to linked skill name
- Special border/background styling to distinguish from regular docs
- Context menu: "Edit Original" and "Remove Link" options
- "Link Skill" option in folder context menu and header dropdown
- Properly passes linked skill handlers through tree recursion

---

### SEQ-005 ✅ — Create AddSkillLinkModal component

**File**: `src/components/platform/AddSkillLinkModal.tsx`

**Features**:
- Skill search input with debounced queries
- Results grouped by category with color-coded badges
- Shows "Already linked" badge for skills already linked
- Preview of selected skill before linking
- Folder selector for placement (optional)
- Error handling and loading states
- Category config for labels and colors (sales-ai, writing, hitl, etc.)

---

### SEQ-006 ✅ — Update SkillDetailView for read-only linked skill preview

**Files**:
- `src/components/platform/SkillDetailView.tsx`
- `src/components/platform/SkillContentEditor.tsx`

**SkillDetailView Changes**:
- New props: `isLinkedSkill`, `linkedFrom`, `onEditOriginal`
- Linked skill banner with "Linked from" info and "Edit Original" button
- Shows read-only badge when viewing linked skill
- Nested SkillDetailView for viewing linked skills from folder tree
- Passes linked_skills to SkillFolderTree
- Skill link handlers: `handleAddSkillLink`, `handleRemoveSkillLink`, `handleEditOriginalSkill`
- AddSkillLinkModal integration

**SkillContentEditor Changes**:
- New prop: `readOnly?: boolean`
- `isReadOnly` now considers both readOnly prop and hidePreviewToggle
- Input fields become read-only with visual styling when readOnly=true

---

### SEQ-007 ✅ — Create HITL skill template

**File**: `supabase/migrations/20260203000001_hitl_skill_template.sql`

**Skills Created**:
1. `hitl-slack-approval` - Slack-based approval with interactive buttons
2. `hitl-inapp-approval` - In-app approval with preview and edit capability

**Frontmatter Includes**:
- Proper V2 schema with triggers, inputs, outputs
- `execution_mode: async` for pause/resume
- `timeout_ms` configuration
- Input/output schemas for job_id, approval_status, approver info

**Content Template Includes**:
- How it works documentation
- Slack Block Kit format for messages
- Input/output variable descriptions
- Example usage in sequences
- Timeout behavior documentation

---

### SEQ-008 ✅ — Create sequence execution engine

**Files**:
- `supabase/migrations/20260203000002_sequence_jobs.sql`
- `src/lib/services/sequenceExecutionService.ts`

**Database**:
- `sequence_job_status` enum: pending, running, waiting_approval, completed, failed, cancelled, timeout
- `sequence_jobs` table with: id, sequence_skill_id, user_id, status, current_step, context, step_results, HITL tracking
- Functions: start_sequence_job, update_sequence_job_step, pause_sequence_job, resume_sequence_job, complete_sequence_job, get_sequence_job_status
- RLS policies for user-owned jobs
- Indexes for status and waiting_approval queries

**TypeScript Service**:
- Types: SequenceJob, StepResult, JobStatusInfo, ApprovalData
- Job lifecycle: startSequence, getJob, getJobStatus, completeJob, cancelJob
- Step management: updateJobStep
- HITL support: pauseJob, resumeJob, getJobsWaitingApproval
- Context management: getJobContext, updateJobContext
- Queries: getUserJobs, getSequenceJobHistory

---

### SEQ-009 ✅ — Update copilot routing to prefer sequences

**Files**:
- `src/lib/services/copilotRoutingService.ts`
- `supabase/migrations/20260203000003_copilot_routing_logs.sql`

**Routing Service**:
- Types: SkillMatch, RoutingDecision
- `routeToSkill(message, context)` - Main routing function
- `logRoutingDecision(userId, message, decision)` - Analytics logging
- `calculateTriggerMatch(message, triggers, keywords)` - Confidence scoring

**Decision Flow**:
1. Check sequences first (category: agent-sequence)
2. If sequence matches with confidence > 0.7, use it
3. Otherwise, fall back to individual skills
4. Returns: selectedSkill, candidates, isSequenceMatch, reason

**Database**:
- `copilot_routing_logs` table for analytics
- `get_routing_analytics(days)` function for dashboards
- Indexes for user, skill, created_at queries
- RLS: users see own logs, admins see all

---

### SEQ-010 ✅ — Simplify AgentSequencesPage

**File**: `src/pages/platform/AgentSequencesPage.tsx`

**Changes**:
- Updated `handleCreateNew` to navigate to `/platform/skills/new?category=agent-sequence`
- Updated `handleEdit` to navigate to `/platform/skills/{skill_key}` (same editor as skills)
- Updated `handleTest` to navigate to `/platform/skills/{skill_key}?tab=test`
- Added `Link2` icon import for linked skills display
- Stats now show both `steps` (old format) and `linked_skills_count` (new format)
- Updated component JSDoc to explain mega skills architecture

**Result**:
- Sequences now use the same PlatformSkillViewPage editor as regular skills
- Create sequence uses standard skill flow with category preset
- Card display supports both old step-based and new link-based sequences

---

## 🎉 Feature Complete!

All 10 stories completed. The sequence simplification feature is now ready:

1. **Database**: skill_links table, sequence_jobs table, routing logs
2. **Types**: SkillLink, LinkedSkillPreview, SequenceJob, RoutingDecision
3. **Services**: skillFolderService (links), sequenceExecutionService, copilotRoutingService
4. **Components**: AddSkillLinkModal, SkillFolderTree (linked skills), SkillDetailView (read-only preview)
5. **Templates**: hitl-slack-approval, hitl-inapp-approval skills

**Architecture**:
- Sequences are skills with `category: agent-sequence`
- They link to other skills via `skill_links` table
- Linked skills display with @ prefix in folder tree
- Clicking linked skill shows read-only preview
- Copilot checks sequences first (confidence > 0.7) before individual skills
