# Implementation Plan: Fix Field Deletion Bug

**Project**: Viewpoint Airtable
**Feature**: Field deletion (clearing fields) not persisting
**Created**: 2026-02-04

---

## Problem Analysis

### Root Cause
When users clear/delete field values in the company modal, the changes don't persist. Upon reopening the modal, the old values reappear.

**Technical Issue** (server.js:1171):
```javascript
const shouldInclude = isRelevantCompetitors
    ? (companyData[key] !== undefined)
    : (fieldMapping[key] && companyData[key] !== null && companyData[key] !== '' && !isEmptyArray);
```

This logic **excludes** fields with:
- `null` values
- Empty strings `''`
- Empty arrays `[]`

When excluded, they're not added to the SQL UPDATE query, so the database keeps the old value.

### Impact
- Text fields: Cannot be cleared (old text persists)
- Email fields: Cannot be removed (old email persists)
- Multi-select fields: Cannot be cleared to empty (old tags persist)
- Date fields: Cannot be cleared (old date persists)

---

## Solution Design

### Approach: Explicit NULL Updates

Instead of excluding empty values, we need to:
1. Include fields with empty/null values in the UPDATE query
2. Explicitly set them to NULL in PostgreSQL
3. Differentiate between "field not sent" (undefined) vs "field cleared" (null/empty)

### Field Types & Clearing Behavior

| Field Type | User Action | Frontend Sends | Backend Stores |
|------------|-------------|----------------|----------------|
| Text | Clear input | `""` (empty string) | `NULL` |
| Email | Clear input | `""` (empty string) | `NULL` |
| Number | Clear input | `null` | `NULL` |
| Date | Clear input | `null` | `NULL` |
| Multi-select | Remove all tags | `[]` (empty array) | `[]` (empty array) |
| Single-select | Deselect | `null` | `NULL` |
| Checkbox | Uncheck | `false` | `false` |

### Key Principle
- **undefined** = field not included in form data (don't update)
- **null, "", []** = field explicitly cleared (update to NULL/empty)

---

## Implementation Stories

### FIELD-001: Update server-side shouldInclude logic
**Type**: Backend
**Priority**: P0
**Estimated**: 15 min

**Changes**:
- Modify `server.js` PUT endpoint logic (line 1162-1171)
- Change shouldInclude to allow null/empty values
- Only exclude `undefined` values

**Acceptance Criteria**:
- [ ] Fields with `null` values are included in UPDATE query
- [ ] Fields with `""` (empty string) are included in UPDATE query
- [ ] Fields with `[]` (empty array) are included in UPDATE query
- [ ] Fields with `undefined` are still excluded (not sent from frontend)

**Files**:
- `server.js` (lines 1162-1280)

---

### FIELD-002: Handle NULL conversions for text fields
**Type**: Backend
**Priority**: P0
**Estimated**: 10 min

**Changes**:
- Convert empty strings to NULL for text/email fields
- Preserve empty arrays for multi-select fields
- Add field type detection logic

**Acceptance Criteria**:
- [ ] Text fields: `""` → `NULL` in database
- [ ] Email field: `""` → `NULL` in database
- [ ] Multi-select fields: `[]` → `[]` in database (not NULL)
- [ ] Number fields: `null` → `NULL` in database

**Files**:
- `server.js` (PUT endpoint handler)

---

### FIELD-003: Add server-side logging for debugging
**Type**: Backend
**Priority**: P1
**Estimated**: 5 min

**Changes**:
- Log which fields are being updated
- Log excluded fields (undefined)
- Log NULL conversions

**Acceptance Criteria**:
- [ ] Console logs show UPDATE query parameters
- [ ] Console logs show which fields were excluded
- [ ] Console logs show NULL conversions

**Files**:
- `server.js`

---

### FIELD-004: Frontend - Ensure empty values are sent
**Type**: Frontend
**Priority**: P0
**Estimated**: 10 min

**Changes**:
- Review `collectFormData()` in validation-script.js
- Ensure empty strings are sent (not converted to undefined)
- Ensure empty arrays are sent for multi-selects

**Acceptance Criteria**:
- [ ] Empty text inputs send `""` (not undefined)
- [ ] Cleared multi-selects send `[]` (not undefined)
- [ ] Cleared single-selects send `null` (not undefined)

**Files**:
- `validation-script.js` (lines 2950-3086)

---

### FIELD-005: Manual testing of all field types
**Type**: Testing
**Priority**: P0
**Estimated**: 15 min

**Test Cases**:
1. Clear text field (name, description) → verify NULL in DB
2. Clear email field → verify NULL in DB
3. Remove all tags from multi-select → verify [] in DB
4. Clear date field → verify NULL in DB
5. Clear number field (revenue) → verify NULL in DB
6. Reopen modal → verify empty fields stay empty

**Acceptance Criteria**:
- [ ] All field types can be cleared
- [ ] Cleared fields persist after save
- [ ] Reopening modal shows cleared fields as empty
- [ ] No console errors

**Files**:
- Manual testing (no code changes)

---

### FIELD-006: Add change tracking comparison (optional enhancement)
**Type**: Frontend
**Priority**: P2
**Estimated**: 20 min

**Changes**:
- Store original company data when opening modal
- Compare current form data to original on save
- Only send changed fields (optimization)
- Show "unsaved changes" indicator

**Acceptance Criteria**:
- [ ] Original data stored in `this.originalCompanyData`
- [ ] Only changed fields sent to backend
- [ ] UI shows "unsaved changes" indicator
- [ ] Works with field deletions

**Files**:
- `validation-script.js` (openCompanyModal, saveProgress)

**Note**: This is optional - FIELD-001 through FIELD-005 will fix the bug without this.

---

## Execution Plan

### Phase 1: Critical Fixes (P0)
**Order**: Sequential
**Estimated**: 50 min

1. FIELD-001 → Backend shouldInclude logic
2. FIELD-002 → NULL conversions
3. FIELD-004 → Frontend data collection
4. FIELD-003 → Logging (can be parallel with testing)
5. FIELD-005 → Manual testing

**Dependencies**:
- FIELD-002 depends on FIELD-001 (same code section)
- FIELD-005 depends on all others

### Phase 2: Enhancements (P1-P2)
**Order**: After Phase 1
**Estimated**: 20 min

6. FIELD-006 → Change tracking (optional)

---

## Technical Details

### Code Changes - FIELD-001 & FIELD-002

**Before** (server.js:1169-1171):
```javascript
const shouldInclude = isRelevantCompetitors
    ? (companyData[key] !== undefined)
    : (fieldMapping[key] && companyData[key] !== null && companyData[key] !== '' && !isEmptyArray);
```

**After**:
```javascript
// Only exclude undefined (field not sent from frontend)
// Include null, "", [] to allow clearing fields
const shouldInclude = fieldMapping[key] && companyData[key] !== undefined;

// Special handling: convert empty strings to NULL for text fields
// but preserve empty arrays for multi-select fields
```

### SQL Query Behavior

**Current** (broken):
```sql
-- User clears email field, frontend sends contactEmail: ""
-- shouldInclude returns false (excluded because empty string)
UPDATE companies
SET name = $1, website = $2  -- email not in query!
WHERE id = $3;
-- Result: Old email value remains in database
```

**Fixed**:
```sql
-- User clears email field, frontend sends contactEmail: ""
-- shouldInclude returns true, converts "" to NULL
UPDATE companies
SET name = $1, website = $2, contact_email = NULL  -- explicitly set to NULL
WHERE id = $3;
-- Result: Email is cleared in database
```

---

## Testing Checklist

### Field Type Coverage

- [ ] **Text fields**: name, website, description, notes
- [ ] **Email field**: contactEmail
- [ ] **Multi-select**: thesisTags, companyTags, industryTags, locationCityState
- [ ] **Single-select**: investmentStage, sourceOfIntroduction
- [ ] **Date fields**: dateInitialOutreach, dateFirstContact, dateMostRecentContact
- [ ] **Number fields**: revenue, yoyRevenueGrowth
- [ ] **Checkbox fields**: underNda, doNotUse, haveWeReachedOut
- [ ] **JSONB field**: relevantCompetitors

### Test Scenarios

1. **Clear single field**
   - Open company → clear email → save → reopen
   - Expected: Email field is empty

2. **Clear multiple fields**
   - Open company → clear email + remove tags + clear date → save → reopen
   - Expected: All cleared fields are empty

3. **Partial clear**
   - Open company → clear one tag but leave others → save → reopen
   - Expected: Only cleared tag is removed

4. **Edit then clear**
   - Open company → edit email → save → reopen → clear email → save → reopen
   - Expected: Email is cleared (not reverted to original)

5. **No changes**
   - Open company → change nothing → save → reopen
   - Expected: All fields unchanged (no accidental NULLs)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Accidentally NULL fields that shouldn't be cleared | High | Only NULL when frontend explicitly sends null/""/[] |
| Break existing validation logic | Medium | Test all field types after changes |
| Airtable sync issues with NULL values | Medium | Verify airtable-integration.js handles NULLs |
| Performance impact from sending all fields | Low | Optional: Implement change tracking (FIELD-006) |

---

## Success Criteria

✅ **Bug Fixed**:
- User can clear any field type
- Cleared fields persist after save
- Reopening modal shows cleared fields as empty

✅ **No Regressions**:
- Existing edit functionality still works
- Airtable sync still works
- No new console errors

✅ **User Experience**:
- No confusing behavior (fields reverting unexpectedly)
- Save button works reliably
- Changes are predictable

---

## Next Steps

1. Review this plan
2. Run `60/run` to execute FIELD-001 through FIELD-005
3. Manual testing session
4. Commit changes
5. Optional: Implement FIELD-006 for change tracking enhancement
