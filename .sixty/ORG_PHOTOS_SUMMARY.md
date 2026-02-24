# Organization Profile Photos - Implementation Plan

## 📋 Overview

**Feature:** Organization Profile Photos
**Status:** Ready for execution
**Estimated Time:** 2.5-3 hours (with parallel execution)
**Stories:** 7 (ORG-001 through ORG-007)
**Risk Level:** Low (proven pattern replication)

---

## 🎯 What This Feature Does

Enables organization owners and admins to upload and manage company profile photos that are visible to all organization members. Works exactly like user profile photos but at the organization level.

**Key Capabilities:**
- ✅ Upload organization logo (JPEG, PNG, GIF, WebP, max 5MB)
- ✅ Remove organization logo (reverts to organization initials)
- ✅ Display in organization header/selector
- ✅ Visible to all organization members (public read)
- ✅ Upload/remove restricted to owners/admins only

---

## 🏗️ Architecture

### Database Changes
```sql
-- organizations table (2 new columns)
ALTER TABLE organizations
  ADD COLUMN logo_url text,
  ADD COLUMN remove_logo boolean DEFAULT false;
```

### Storage
- **New Bucket:** `org-logos` (separate from user avatars)
- **Size Limit:** 5MB
- **Public Read:** Yes (logos are non-sensitive)
- **Upload Permissions:** Org owners/admins only

### Frontend Components
```
src/components/
  └── OrgLogoUpload.tsx          [NEW] - Logo upload component

src/pages/settings/
  └── OrganizationManagementPage.tsx [MODIFY] - Add logo section

src/components/
  └── AppLayout.tsx              [MODIFY] - Display logo in header
```

---

## 📦 Stories Breakdown

### Phase 1: Database Setup (35 min)

#### ORG-001: Add logo_url columns (15 min)
**What:** Add `logo_url` and `remove_logo` columns to organizations table
**Files:** `supabase/migrations/20260203160000_add_org_logo_columns.sql`
**Dependencies:** None (can start immediately)

#### ORG-002: Create org-logos bucket (20 min)
**What:** Set up dedicated storage bucket with RLS policies
**Files:** `supabase/migrations/20260203160100_setup_org_logos_bucket_rls.sql`
**Dependencies:** ORG-001

---

### Phase 2: Frontend Components (55 min)

#### ORG-003: Build OrgLogoUpload component (30 min)
**What:** Create reusable upload component (copy AvatarUpload pattern)
**Files:** `src/components/OrgLogoUpload.tsx`
**Dependencies:** ORG-002
**Pattern:**
```typescript
<OrgLogoUpload
  orgId={activeOrgId}
  currentLogoUrl={activeOrg?.logo_url}
  orgName={activeOrg?.name}
/>
```

#### ORG-004: Add logo UI to settings page (25 min)
**What:** Integrate upload component into OrganizationManagementPage
**Files:** `src/pages/settings/OrganizationManagementPage.tsx`
**Dependencies:** ORG-003
**Parallel With:** ORG-005 ✨

---

### Phase 3: Integration (35 min)

#### ORG-005: Update organization context (15 min)
**What:** Add logo_url to Organization type and queries
**Files:** `src/lib/contexts/OrgContext.tsx`, `src/lib/supabase/database.types.ts`
**Dependencies:** ORG-001
**Parallel With:** ORG-004 ✨

#### ORG-006: Display logo in header (20 min)
**What:** Show organization logo in AppLayout header
**Files:** `src/components/AppLayout.tsx`
**Dependencies:** ORG-004, ORG-005

---

### Phase 4: Testing (25 min)

#### ORG-007: End-to-end testing (25 min)
**What:** Manual testing with multiple roles on staging
**Test Cases:**
- Owner can upload ✓
- Admin can upload ✓
- Member cannot upload ✓
- Logo displays correctly ✓
- Remove functionality works ✓
- File validation works ✓

---

## 🚀 Execution Flow

```
┌─────────────────────────────────────────────┐
│        SEQUENTIAL DEPENDENCIES              │
└─────────────────────────────────────────────┘

ORG-001 (Schema: Add columns)
   ↓
ORG-002 (Storage: Create bucket)
   ↓
   ├──→ ORG-003 (Component) ──→ ORG-004 (UI Integration) ─┐
   │                                                       │
   └──→ ORG-005 (Context) ────────────────────────────────┤
                                                           ↓
                                                      ORG-006 (Display)
                                                           ↓
                                                      ORG-007 (Testing)

┌─────────────────────────────────────────────┐
│      PARALLEL OPPORTUNITIES ✨               │
└─────────────────────────────────────────────┘

Group 1: ORG-004 + ORG-005 (after ORG-002)
  → Time saved: ~15 minutes
  → Reason: Different files, no overlap
```

---

## 🔑 Key Implementation Details

### 1. Filename Pattern
```typescript
const fileName = `${orgId}-${Date.now()}.${ext}`;
// Example: "abc123-1707062400000.jpg"
```
**Why:** Enforces org ownership via RLS, prevents collisions

### 2. Cache-Busting
```typescript
const logoUrl = `${publicUrl}?v=${Date.now()}`;
// Example: "https://.../logo.jpg?v=1707062400000"
```
**Why:** Prevents browser from showing stale cached images

### 3. Permission Check
```typescript
{permissions.canManageSettings && (
  <OrgLogoUpload orgId={activeOrgId} {...props} />
)}
```
**Why:** Only owners/admins should see upload UI

### 4. RLS Policy Pattern
```sql
-- Upload policy example
CREATE POLICY "Org admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND name ILIKE (
      SELECT id::text || '-%'
      FROM organizations
      WHERE get_org_role(auth.uid(), id) IN ('owner', 'admin')
    )
  );
```

---

## ✅ Acceptance Criteria

### Database
- [ ] organizations.logo_url column exists (text, nullable)
- [ ] organizations.remove_logo column exists (boolean, default: false)
- [ ] Migration runs on staging without errors

### Storage
- [ ] org-logos bucket created with 5MB limit
- [ ] Public read access enabled
- [ ] Owner/admin upload permissions enforced

### Frontend
- [ ] OrgLogoUpload component functional
- [ ] Settings page shows upload UI (owners/admins only)
- [ ] Header displays logo beside org name
- [ ] Initials fallback when no logo
- [ ] Cache-busting prevents stale images

### Permissions
- [ ] Owners can upload
- [ ] Admins can upload
- [ ] Members CANNOT upload
- [ ] All members can VIEW logos

### Testing
- [ ] File validation (type, size) works
- [ ] Upload → immediate display
- [ ] Remove → reverts to initials
- [ ] Old logos can be replaced

---

## 📚 Reference Files

**Copy These Patterns:**
- `src/components/AvatarUpload.tsx` - Complete upload flow
- `supabase/migrations/20260202140000_add_avatar_and_email_change_features.sql` - Schema
- `supabase/migrations/20260202190000_add_avatars_bucket_rls_policies.sql` - RLS

**Integration Points:**
- `src/pages/settings/OrganizationManagementPage.tsx` - Settings tab (line ~773)
- `src/lib/contexts/OrgContext.tsx` - Organization type & queries
- `src/components/AppLayout.tsx` - Header display

**Display Pattern:**
- `src/components/projects/AvatarCell.tsx` - Avatar with initials fallback

---

## 🎯 Success Metrics

**Technical:**
- Migration completes without rollback
- RLS policies enforce correct permissions
- No new dependencies required
- Follows existing code patterns

**User Experience:**
- Upload completes in <3 clicks
- Logo visible immediately after upload
- Remove functionality intuitive
- All org members see the logo

**Code Quality:**
- TypeScript strict mode passes
- No `any` types introduced
- Cache invalidation working
- Manual tests pass

---

## 🔄 Next Steps

1. **Review this plan** - Confirm approach makes sense
2. **Run `60/run`** - Start execution (or manual implementation)
3. **Test on staging** - Use .env.staging per user request
4. **Validate with real users** - Owner, admin, member roles
5. **Deploy to production** - After staging validation

---

## ⚠️ Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Migration on live staging | Medium | Run during low-traffic window |
| RLS policy complexity | Medium | Use proven filename pattern |
| Large file uploads | Low | 5MB limit + client validation |
| Old logos not cleaned up | Low | Accept for MVP |

---

## 💡 Future Enhancements (Not in MVP)

- Image optimization/resizing edge function
- Multiple logo variants (light/dark mode)
- Logo crop/preview before upload
- Automated cleanup of old logos
- CDN integration for faster loading

---

*Generated by 60/plan - Organization Profile Photos Feature*
*Date: 2026-02-03*
*Estimated: 2.5-3 hours | Stories: 7 | Risk: Low*
