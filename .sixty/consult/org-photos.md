# Consult Report: Organization Profile Photos
Generated: 2026-02-03 16:00:00

## User Request
"I want to be able to give the organizations the ability to add a company profile photo, this should be able to be added inside of the organization management area by Owners. Can you make it work just like profile photos do."

## Clarifications

**Q: Should organization profile photos be visible to all organization members, or only to admins/owners?**
**A: Visible to all organization members**

**Database Environment:** Use .env.staging for database operations

---

## Agent Findings

### Codebase Scout - Existing Assets

#### ✅ Reusable Components & Patterns

| Asset | Path | Relevance | Notes |
|-------|------|-----------|-------|
| **AvatarUpload Component** | `src/components/AvatarUpload.tsx` | **Critical** | Complete reference implementation for file upload with validation, storage, and database update |
| **Storage Bucket** | Supabase `avatars` bucket | High | Proven infrastructure (5MB limit, public read, RLS policies) |
| **Profile Upload Pattern** | `src/pages/Profile.tsx` | High | Shows two-step preview → save flow |
| **AvatarCell Component** | `src/components/projects/AvatarCell.tsx` | High | Smart avatar display with initials fallback |
| **Organization Management UI** | `src/pages/settings/OrganizationManagementPage.tsx` | Critical | Target integration point (Settings tab) |
| **Permission System** | `src/lib/contexts/OrgContext.tsx` | Critical | `permissions.canManageSettings` for owners/admins |
| **Avatar Migrations** | `supabase/migrations/20260202140000_*.sql` | High | Schema patterns to replicate |
| **Storage RLS Policies** | `supabase/migrations/20260202190000_*.sql` | High | RLS policy patterns to copy |

#### 📁 Suggested File Locations

```
src/
├── components/
│   └── OrgLogoUpload.tsx          # NEW - clone of AvatarUpload.tsx
├── pages/settings/
│   └── OrganizationManagementPage.tsx  # MODIFY - add logo section
└── lib/contexts/
    └── OrgContext.tsx              # MODIFY - add logo_url to type

supabase/migrations/
├── 20260203160000_add_org_logo_columns.sql          # NEW - schema
└── 20260203160100_setup_org_logos_bucket_rls.sql    # NEW - storage
```

---

### Patterns Analyst - Coding Conventions

#### State Management Pattern

```typescript
// Server State: React Query for database data
const { data: activeOrg } = useQuery(['organization', orgId]);

// UI State: Zustand for transient state (if needed)
const { setPendingUpload } = useUploadStore();
```

**For org photos:** Use React Query only - logo URL comes from database.

#### Component Pattern

```typescript
// Functional components with TypeScript
export function OrgLogoUpload({
  orgId,
  currentLogoUrl,
  orgName
}: OrgLogoUploadProps) {
  // Implementation...
}

// Props interface defined above
interface OrgLogoUploadProps {
  orgId: string;
  currentLogoUrl?: string | null;
  orgName: string;
  onUploadComplete?: (url: string) => void;
}
```

#### File Upload Pattern (from AvatarUpload.tsx)

```typescript
// 1. Client-side validation
if (file.size > 5 * 1024 * 1024) {
  toast.error('Image size must be less than 5MB');
  return;
}

// 2. Upload to storage
const fileName = `${orgId}-${Date.now()}.${fileExt}`;
const { error } = await supabase.storage
  .from('org-logos')
  .upload(fileName, file, { upsert: false });

// 3. Get public URL with cache-busting
const { data } = supabase.storage.from('org-logos').getPublicUrl(fileName);
const logoUrl = `${data.publicUrl}?v=${Date.now()}`;

// 4. Update database
await supabase
  .from('organizations')
  .update({
    logo_url: logoUrl,
    remove_logo: false,
    updated_at: new Date().toISOString()
  })
  .eq('id', orgId);

// 5. Invalidate React Query cache
queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
```

#### Error Handling Pattern

```typescript
try {
  // Operation
  await uploadLogo();
  toast.success('Organization logo updated successfully');
} catch (error) {
  console.error('Upload failed:', error);
  toast.error('Failed to upload logo. Please try again.');
} finally {
  setUploading(false);
}
```

#### Database Query Pattern

```typescript
// When record MUST exist (organizations always exist)
const { data, error } = await supabase
  .from('organizations')
  .select('id, name, logo_url, remove_logo')
  .eq('id', orgId)
  .single();  // ✅ Safe - org must exist

// When record might not exist - use maybeSingle()
const { data } = await supabase
  .from('uploads')
  .select('*')
  .eq('id', uploadId)
  .maybeSingle();  // ✅ Returns null gracefully
```

#### Must-Follow Rules

1. **Never expose service role key to frontend** - Use anon key only
2. **Absolute paths for file operations** - No relative imports
3. **Explicit column selection** - Never use `select('*')` in edge functions
4. **Cache-busting URLs** - Always append `?v=${Date.now()}`
5. **Permission checks** - Use `permissions.canManageSettings` from OrgContext
6. **TypeScript strict mode** - No `any` types without justification

---

### Risk Scanner - Potential Issues

#### 🔴 High Severity Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Database migration on live staging** | Could affect active users | Run migration during low-traffic window; test locally first with dump |
| **RLS policy complexity** | Storage policies can't directly query org_memberships | Use filename pattern `{orgId}-{timestamp}` to enforce ownership via JWT |

#### 🟡 Medium Severity Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Large logo files slow page loads** | Poor UX for users with slow connections | Enforce 5MB limit + client-side validation; consider future optimization |
| **Old logos not cleaned up** | Storage costs grow over time | Accept for MVP; add cleanup job later if needed |
| **Cross-org logo access** | Users might guess other org logo URLs | This is acceptable - logos are non-sensitive public data |

#### 🟢 Low Severity Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **No image optimization** | Logos displayed at uploaded resolution | Accept for MVP; add edge function for resizing later if performance issues arise |
| **Cache invalidation delay** | Logo might not update immediately | Use cache-busting timestamp in URL |

#### Security Checklist

- ✅ Unauthenticated uploads blocked (RLS requires `authenticated` role)
- ✅ File type validation (client + bucket MIME type restrictions)
- ✅ File size validation (client 5MB + bucket limit 5MB)
- ✅ Org access control (permission check via `permissions.canManageSettings`)
- ✅ Public read is safe (logos are non-sensitive)
- ⚠️ Storage RLS needs org role check (use JWT + filename pattern)

#### Database Column Gotcha

**CRITICAL:** Organizations table uses consistent column naming - no gotchas like `meetings.owner_user_id`.

```typescript
// ✅ CORRECT - organizations table
organizations.logo_url     // Standard naming
organizations.remove_logo  // Boolean flag

// ⚠️ Don't confuse with other tables:
// meetings.owner_user_id (not user_id!)
// tasks.owner_id (not user_id!)
// organizations.created_by (tracks creator, NOT owner role)
```

#### Questions for User

1. ✅ **Visibility:** All org members (ANSWERED: Yes)
2. ❓ **Logo dimensions:** Any restrictions on aspect ratio? (Default: accept any, display as circle)
3. ❓ **Migration timing:** When to run migration? (Use staging environment per user request)

---

### Scope Sizer - Effort Estimation

#### Total Estimate

| Estimate Type | Time |
|---------------|------|
| **Optimistic** | 2 hours |
| **Realistic** | 3 hours |
| **Pessimistic** | 4 hours |
| **Confidence** | High (proven pattern to replicate) |

#### Story Breakdown

##### Phase 1: Database Setup (35 min)
- **ORG-001** (15 min): Add logo_url columns to organizations table
- **ORG-002** (20 min): Create org-logos bucket with RLS policies

##### Phase 2: Frontend Components (55 min)
- **ORG-003** (30 min): Build OrgLogoUpload component
- **ORG-004** (25 min): Add logo upload UI to OrganizationManagementPage

##### Phase 3: Integration (35 min)
- **ORG-005** (15 min): Update organization context to include logo_url
- **ORG-006** (20 min): Add logo display to org selector/header

##### Phase 4: Testing (25 min)
- **ORG-007** (25 min): Test upload/remove/permissions flow

#### Parallel Execution Opportunities

```
ORG-001 (schema)
    ↓
ORG-002 (bucket)
    ↓
ORG-003 (component) ←─┬─→ ORG-005 (context)
    ↓                  │        ↓
ORG-004 (UI)  ←────────┴────────┘
    ↓
ORG-006 (display)
    ↓
ORG-007 (test)
```

**Parallel Groups:**
- After ORG-002: ORG-003 + ORG-005 can run in parallel (different files)
- **Time saved:** ~15 minutes

**Sequential Dependencies:**
- ORG-001 → ORG-002 (schema must exist before bucket creation)
- ORG-003 → ORG-004 (component must exist before integration)
- ORG-004 + ORG-005 → ORG-006 (both needed for display)
- ORG-006 → ORG-007 (complete feature needed for testing)

#### MVP Suggestion

**Minimum Viable:**
- Stories: ORG-001, ORG-002, ORG-003, ORG-004
- Estimate: 1.5 hours
- Delivers: Working logo upload in settings
- Deferred: Header display (ORG-006), comprehensive testing

**Recommended Full Scope:**
- All 7 stories
- Estimate: 2.5-3 hours
- Delivers: Complete feature with testing
- Reason: Header display is high-value, testing is critical for production

---

## Synthesis & Recommendations

### ✅ Agreements (All Agents Aligned)

1. **Reuse AvatarUpload pattern** - Proven, battle-tested, minimal adaptation needed
2. **Separate bucket needed** - `org-logos` distinct from `avatars` for logical separation
3. **Follow existing permissions** - Use `permissions.canManageSettings` (owners/admins)
4. **Public read access is safe** - Organization logos are non-sensitive
5. **Cache-busting required** - Append timestamp to prevent stale images
6. **Total estimate: 2.5-3 hours** - High confidence based on proven patterns

### 🔍 Key Implementation Decisions

#### Decision 1: Bucket Strategy
**Options:**
- A) Separate `org-logos` bucket ✅ **CHOSEN**
- B) Subdirectory in `avatars` (e.g., `avatars/organizations/`)

**Rationale:** Separate bucket provides:
- Independent RLS policies
- Clearer organization
- Easier future scaling/optimization

#### Decision 2: Filename Pattern
**Pattern:** `{orgId}-{timestamp}.{ext}` ✅ **CHOSEN**

**Why:**
- Enforces org ownership via RLS
- Prevents filename collisions
- Matches user avatar pattern
- Enables cache-busting

#### Decision 3: Permission Gating
**Use:** `permissions.canManageSettings` ✅ **CHOSEN**

**Why:**
- Already implemented in OrgContext
- Covers owners + admins
- Consistent with other org settings

#### Decision 4: Image Optimization
**Approach:** No optimization for MVP ✅ **CHOSEN**

**Why:**
- 5MB limit + client validation sufficient for MVP
- Can add edge function later if performance issues arise
- Faster implementation (no additional infrastructure)

---

## Recommended Execution Plan

### Story Summary

| # | ID | Title | Est. | Type | Dependencies |
|---|----|-------|------|------|--------------|
| 1 | ORG-001 | Add logo_url columns | 15m | schema | None |
| 2 | ORG-002 | Create org-logos bucket | 20m | schema | ORG-001 |
| 3 | ORG-003 | Build OrgLogoUpload | 30m | frontend | ORG-002 |
| 4 | ORG-004 | Add logo UI to management page | 25m | frontend | ORG-003 |
| 5 | ORG-005 | Update org context | 15m | backend | ORG-001 |
| 6 | ORG-006 | Display logo in header | 20m | frontend | ORG-004, ORG-005 |
| 7 | ORG-007 | End-to-end testing | 25m | test | ORG-006 |

**Total:** 150 minutes (2.5 hours) with parallel execution

---

## Files to Create/Modify

### Create (4 new files)

```
supabase/migrations/
├── 20260203160000_add_org_logo_columns.sql
└── 20260203160100_setup_org_logos_bucket_rls.sql

src/components/
└── OrgLogoUpload.tsx
```

### Modify (4 existing files)

```
src/
├── pages/settings/OrganizationManagementPage.tsx
├── lib/contexts/OrgContext.tsx
├── lib/supabase/database.types.ts
└── components/AppLayout.tsx
```

---

## Success Metrics

**Technical:**
- ✅ Migration runs without errors on staging
- ✅ RLS policies enforce owner/admin upload permissions
- ✅ File validation prevents invalid uploads
- ✅ Cache-busting prevents stale images

**User Experience:**
- ✅ Owners/admins can upload logos in <3 clicks
- ✅ Logo appears immediately after upload
- ✅ All org members can see the logo
- ✅ Remove logo functionality works correctly

**Code Quality:**
- ✅ Follows existing patterns (AvatarUpload, permissions)
- ✅ TypeScript types updated
- ✅ No new dependencies required
- ✅ Passes manual testing checklist

---

## Next Steps

1. **Review plan** - Confirm story breakdown looks correct
2. **Run `60/run`** - Begin execution
3. **Test on staging** - Use .env.staging per user request
4. **Deploy to production** - After staging validation

---

## Reference Files

**Primary References:**
- `src/components/AvatarUpload.tsx` - Complete upload pattern
- `src/pages/settings/OrganizationManagementPage.tsx` - Integration target
- `supabase/migrations/20260202140000_add_avatar_and_email_change_features.sql` - Schema pattern
- `supabase/migrations/20260202190000_add_avatars_bucket_rls_policies.sql` - RLS pattern

**Permission System:**
- `src/lib/contexts/OrgContext.tsx` - Permission definitions

**Display Components:**
- `src/components/projects/AvatarCell.tsx` - Avatar display with fallback
- `src/components/AppLayout.tsx` - Header integration point

---

*Generated by 60/consult AI Requirements Discovery*
