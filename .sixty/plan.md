# TSK-0450: Breaking the Onboarding Process

**Date:** 2026-02-19
**Branch:** `fix/TSK-0450-onboarding-fixes`
**Base:** `staging`
**Summary:** Seven stories fixing onboarding UX bugs — placeholder text, dead URL references, domain mismatch handling, input character limits, repeatable list caps, welcome credits grant with green banner, and credit dropdown cleanup.

---

## Story 1 — TSK-0450-S1: Replace "acme.com" placeholder with "mycompany.com"

**Type:** fix | **Risk:** Low | **Dependencies:** None

### Files
- `src/pages/onboarding/v2/WebsiteInputStep.tsx`
- `src/pages/auth/signup.tsx`

### Changes

**WebsiteInputStep.tsx:**
1. **Line 115** — Error message string
   FROM: `'Please enter a valid website (e.g., acme.com)'`
   TO: `'Please enter a valid website (e.g., mycompany.com)'`

2. **Line 257** — Input placeholder attribute
   FROM: `placeholder="acme.com"`
   TO: `placeholder="mycompany.com"`

**signup.tsx:**
3. **Line 123** — Validation toast
   FROM: `toast.error('Please enter a valid company domain (e.g., acme.com)')`
   TO: `toast.error('Please enter a valid company domain (e.g., mycompany.com)')`

4. **Line 319** — Company domain input placeholder
   FROM: `placeholder="acme.com"`
   TO: `placeholder="mycompany.com"`

### Acceptance Criteria
- [ ] WebsiteInputStep error message reads "mycompany.com"
- [ ] WebsiteInputStep input placeholder reads "mycompany.com"
- [ ] Signup page company domain validation toast reads "mycompany.com"
- [ ] Signup page company domain input placeholder reads "mycompany.com"

---

## Story 2 — TSK-0450-S2: Replace sixty.io waitlist reference with use60.com/waitlist

**Type:** fix | **Risk:** Low | **Dependencies:** None

### Files
- `src/components/AccessCodeInput.tsx`
- `supabase/functions/_shared/corsHelper.ts`

### Changes

**AccessCodeInput.tsx:**
1. **Line 119** — Helper text (inside `<p className="text-xs text-gray-500">`)
   FROM: `Need a code? Join our waitlist at sixty.io to request access.`
   TO (JSX):
   ```tsx
   Need a code? Join our waitlist at{' '}
   <a
     href="https://www.use60.com/waitlist"
     target="_blank"
     rel="noopener noreferrer"
     className="text-blue-400 hover:underline"
   >
     use60.com/waitlist
   </a>{' '}
   to request access.
   ```

**corsHelper.ts:**
2. **Lines 31–33** — Remove legacy `sixty.io` CORS origins (product was rebranded):
   FROM:
   ```ts
   'https://sixty.io',
   'https://www.sixty.io',
   'https://app.sixty.io',
   ```
   TO: *(delete all three lines)*

Note: `src/App.tsx` already correctly redirects `/waitlist` to `https://www.use60.com/waitlist` — no change needed there.

### Acceptance Criteria
- [ ] Helper text in AccessCodeInput shows "use60.com/waitlist" as a clickable link
- [ ] Link opens `https://www.use60.com/waitlist` in a new tab
- [ ] `sixty.io` is removed from the CORS allowlist in `corsHelper.ts`
- [ ] `use60.com` entries remain in the CORS allowlist (already present, do not touch)
- [ ] No user-facing references to `sixty.io` remain anywhere in `src/`

---

## Story 3 — TSK-0450-S3: Domain mismatch detection — ask which domain to use for research

**Type:** feature | **Risk:** Medium | **Dependencies:** None

### Context
The real mismatch scenario: a user signs up with a **business email** (e.g., `john@bigcorp.com`) and optionally enters a different **company domain** in the signup form (e.g., `corp-us.com`). The onboarding store currently ignores the signup company domain — it always extracts the domain from the email address for enrichment. This means users who entered a different website at signup never get asked which to use.

The fix goes into `setUserEmail()` in `onboardingV2Store.ts` — the single place where email domain extraction happens for business users — NOT `WebsiteInputStep.tsx` (which is only for personal-email users and has no email domain to compare against).

### Files
- `src/lib/stores/onboardingV2Store.ts`
- `src/pages/onboarding/v2/EnrichmentLoadingStep.tsx`

### Changes

**1. Add state fields to `OnboardingV2State` interface** (around line 236):
```ts
// Domain mismatch detection
hasDomainMismatch: boolean;
emailDomain: string | null;
signupCompanyDomain: string | null;  // company_domain from signup metadata
resolvedResearchDomain: string | null; // user's chosen domain (null = use emailDomain)
```

**2. Add initial values** for new fields in `create()` (around line 390):
```ts
hasDomainMismatch: false,
emailDomain: null,
signupCompanyDomain: null,
resolvedResearchDomain: null,
```

**3. Add store action `resolveDomainMismatch`** (alongside other actions):
```ts
resolveDomainMismatch: (chosenDomain: string) => {
  set({ resolvedResearchDomain: chosenDomain, hasDomainMismatch: false });
},
```

**4. Modify `setUserEmail()` action** — after `const domain = extractDomain(email)` (line 478), read `company_domain` from user metadata and check for mismatch:
```ts
// Check if signup company_domain differs from email domain
const { data: { session } } = await supabase.auth.getSession();
const signupCompanyDomain = session?.user?.user_metadata?.company_domain
  ? extractDomain(session.user.user_metadata.company_domain)
  : null;

if (
  signupCompanyDomain &&
  signupCompanyDomain !== domain &&
  !isPersonalEmailDomain(signupCompanyDomain)
) {
  set({
    hasDomainMismatch: true,
    emailDomain: domain,
    signupCompanyDomain,
  });
}
```

Insert this block immediately after `const domain = extractDomain(email)` at line 478, before the existing org-lookup logic. The existing logic still proceeds with `domain` (email domain) as the default — but the enrichment step will intercept if `hasDomainMismatch` is true.

**5. Modify `startEnrichment()` action** — when calling the edge function, use `resolvedResearchDomain` if set:
```ts
// Use resolved domain (from mismatch picker) or default email domain
const researchDomain = get().resolvedResearchDomain || domain;
// ... pass researchDomain to supabase.functions.invoke('deep-enrich-organization', ...)
```

Find the `supabase.functions.invoke('deep-enrich-organization', ...)` call (around line 1314-1321) and replace the `domain` variable with `researchDomain`.

**6. Add domain picker UI to `EnrichmentLoadingStep.tsx`** — at the top of the component render, before the loading spinner, check for mismatch and show an inline picker:

Import `useOnboardingV2Store` (already imported). Add destructure:
```tsx
const { hasDomainMismatch, emailDomain, signupCompanyDomain, resolveDomainMismatch } = useOnboardingV2Store();
```

Render the picker as the first thing in the returned JSX (before the loading animation), wrapped in a conditional:
```tsx
{hasDomainMismatch && emailDomain && signupCompanyDomain && (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="w-full max-w-lg mx-auto px-4 mb-6"
  >
    <div className="rounded-2xl border border-amber-700/50 bg-amber-900/20 p-6">
      <h3 className="text-lg font-semibold text-white mb-2">
        Which domain should we research?
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        Your email (@{emailDomain}) and the website you entered ({signupCompanyDomain}) are different. Choose which domain to use for your company research.
      </p>
      <div className="flex gap-3">
        <Button
          onClick={() => resolveDomainMismatch(emailDomain)}
          variant="outline"
          className="flex-1 border-gray-600 text-white hover:bg-gray-800"
        >
          {emailDomain}
          <span className="block text-xs text-gray-400 mt-0.5">from your email</span>
        </Button>
        <Button
          onClick={() => resolveDomainMismatch(signupCompanyDomain)}
          variant="outline"
          className="flex-1 border-gray-600 text-white hover:bg-gray-800"
        >
          {signupCompanyDomain}
          <span className="block text-xs text-gray-400 mt-0.5">from your website</span>
        </Button>
      </div>
    </div>
  </motion.div>
)}
```

After the user picks, `resolveDomainMismatch()` sets `hasDomainMismatch: false` and `resolvedResearchDomain`, then the loading step proceeds to call `startEnrichment()` which uses the resolved domain.

### Acceptance Criteria
- [ ] Personal email users (gmail etc.) are unaffected — no mismatch check applies
- [ ] Business email user whose email domain matches their signup company domain sees NO picker
- [ ] Business email user with `john@bigcorp.com` who entered `corp-us.com` at signup sees the domain picker before enrichment starts
- [ ] Picker shows both domains with labels ("from your email" / "from your website")
- [ ] Choosing a domain resolves the mismatch and proceeds to enrichment using the chosen domain
- [ ] The deep-enrich edge function call uses `resolvedResearchDomain` when set
- [ ] State resets correctly if user starts over

---

## Story 4 — TSK-0450-S4: Character limits on ManualEnrichmentStep inputs

**Type:** fix | **Risk:** Low | **Dependencies:** None

### Files
- `src/pages/onboarding/v2/ManualEnrichmentStep.tsx`

### Changes

**1. Add constants** (after imports, before `QUESTIONS` array):
```tsx
const MAX_CHAR_SINGLE = 200;
const MAX_CHAR_MULTI = 800;
```

**2. Multiline textarea** (line ~220–229) — add `maxLength`, guard `onChange`, add character counter:
```tsx
<textarea
  value={answers[currentQuestion.id] || ''}
  onChange={(e) => {
    if (e.target.value.length <= MAX_CHAR_MULTI) {
      setAnswers({ ...answers, [currentQuestion.id]: e.target.value });
      setError(null);
    }
  }}
  maxLength={MAX_CHAR_MULTI}
  placeholder={currentQuestion.placeholder}
  rows={3}
  className="w-full px-4 py-4 rounded-xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all resize-none"
  autoFocus
/>
<p className="text-xs text-gray-500 text-right mt-1">
  {(answers[currentQuestion.id] || '').length}/{MAX_CHAR_MULTI}
</p>
```

**3. Single-line input** (line ~232–242) — add `maxLength` and guard `onChange`:
```tsx
<input
  type="text"
  value={answers[currentQuestion.id] || ''}
  onChange={(e) => {
    if (e.target.value.length <= MAX_CHAR_SINGLE) {
      setAnswers({ ...answers, [currentQuestion.id]: e.target.value });
      setError(null);
    }
  }}
  maxLength={MAX_CHAR_SINGLE}
  onKeyDown={handleKeyDown}
  placeholder={currentQuestion.placeholder}
  className="w-full px-4 py-4 rounded-xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all"
  autoFocus
/>
```

### Acceptance Criteria
- [ ] Single-line inputs (`company_name`, `industry`, `competitors`) are capped at 200 characters
- [ ] Multiline textareas (`company_description`, `target_customers`, `main_products`) are capped at 800 characters
- [ ] Character counter (e.g., "45/800") shown below multiline textareas only
- [ ] HTML `maxLength` attribute is present on all inputs/textareas
- [ ] JS guard in `onChange` prevents overflow if HTML limit is bypassed

---

## Story 5 — TSK-0450-S5: Max 10 items for repeatable lists in SkillsConfigStep

**Type:** fix | **Risk:** Low | **Dependencies:** None

### Files
- `src/components/onboarding/AddItemButton.tsx` — add `disabled` prop
- `src/pages/onboarding/v2/SkillsConfigStep.tsx` — enforce limit across 6 list sections

### Changes to `AddItemButton.tsx`

Add `disabled?: boolean` to the props interface. Pass `disabled` to the inner `<button>` element. When disabled, apply `opacity-50 cursor-not-allowed` classes and block the `onClick` handler.

### Changes to `SkillsConfigStep.tsx`

**Add constant** (after line 44):
```tsx
const MAX_ITEMS = 10;
```

Apply the following pattern to all 6 add-item locations. For `AddItemButton` usages add a `disabled` prop:
```tsx
<AddItemButton
  onAdd={(value) => updateSkillConfig('lead_qualification', {
    criteria: [...(activeConfig.criteria || []), value],
  })}
  placeholder="Add qualification criterion"
  disabled={(activeConfig.criteria?.length ?? 0) >= MAX_ITEMS}
/>
{(activeConfig.criteria?.length ?? 0) >= MAX_ITEMS && (
  <p className="text-xs text-amber-500 mt-1">Maximum {MAX_ITEMS} items reached</p>
)}
```

For plain `<button>` add-item elements (lead enrichment questions, objection handling, brand voice avoid words), add `disabled={(count) >= MAX_ITEMS}` attribute and update className to show `cursor-not-allowed opacity-50` when disabled. Add the amber limit message below each.

**6 sections to update:**
1. Lead qualification criteria (`AddItemButton`)
2. Lead qualification disqualifiers (`AddItemButton`)
3. Lead enrichment questions (plain button)
4. Brand voice avoid words (plain button)
5. Objection handling objections (plain button)
6. ICP buying signals (`AddItemButton`)

### Acceptance Criteria
- [ ] `AddItemButton` accepts and respects `disabled` prop
- [ ] All 6 list sections are hard-capped at 10 items
- [ ] Add buttons are visually disabled when at 10 items
- [ ] Amber "Maximum 10 items reached" message appears when at limit
- [ ] Deleting an item from a full list re-enables the add button immediately

---

## Story 6 — TSK-0450-S6: Grant 10 free AI credits on onboarding completion + welcome banner

**Type:** feature | **Risk:** Medium | **Dependencies:** Requires edge function deployment first

### ⚠️ Requires a new Supabase Edge Function — deploy to staging before testing frontend

### Files to Create
- `supabase/functions/grant-welcome-credits/index.ts`

### Files to Modify
- `src/pages/onboarding/v2/CompletionStep.tsx`
- `src/components/credits/LowBalanceBanner.tsx`

---

### Part A: Edge Function `grant-welcome-credits`

Create `supabase/functions/grant-welcome-credits/index.ts`:
- Uses `getCorsHeaders(req)` from `_shared/corsHelper.ts` (NOT legacy `corsHeaders`)
- Pins `@supabase/supabase-js@2.43.4` on `esm.sh`
- Validates JWT internally (gateway uses `--no-verify-jwt` for staging)
- Verifies caller is a member of the target org
- **Idempotent**: checks for existing "Welcome" bonus transaction before granting
- Calls `add_credits` RPC with `type = 'bonus'`, `description = 'Welcome — 10 free AI credits'`
- Returns `{ success: true, already_granted: boolean }`

**Deploy command (staging):**
```bash
npx supabase functions deploy grant-welcome-credits --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
```

---

### Part B: Call edge function from CompletionStep

**File:** `src/pages/onboarding/v2/CompletionStep.tsx`

In `handleGoToDashboard()`, after `await completeStep('complete')` (line 115), before `setActiveOrg`:
```tsx
// Grant 10 welcome credits to new org (non-blocking)
if (organizationId) {
  try {
    await supabase.functions.invoke('grant-welcome-credits', {
      body: { org_id: organizationId },
    });
    localStorage.setItem(`sixty_welcome_credits_${organizationId}`, 'pending');
  } catch (err) {
    console.error('[CompletionStep] Failed to grant welcome credits:', err);
    // Non-fatal — do not block navigation
  }
}
```

Apply the same block to `handleNavigation` in the "What's next?" section (after `await completeStep('complete')` ~line 234).

---

### Part C: Welcome banner in LowBalanceBanner

**File:** `src/components/credits/LowBalanceBanner.tsx`

1. Add `Sparkles` to lucide-react import (line 11).

2. Add welcome banner state (after line 24):
```tsx
const welcomeKey = orgId ? `sixty_welcome_credits_${orgId}` : null;
const [showWelcome, setShowWelcome] = useState(() =>
  welcomeKey ? localStorage.getItem(welcomeKey) === 'pending' : false
);
```

3. Insert green welcome banner render BEFORE the `if (!isZero && !isRedLow && !isAmberLow) return null;` check (line 38):
```tsx
// Welcome credits banner — shown once after onboarding
if (showWelcome && data && data.balance > 0) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200">
      <Sparkles className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">10 Free AI credits have been added!</span>
      <button
        onClick={() => {
          if (welcomeKey) localStorage.removeItem(welcomeKey);
          setShowWelcome(false);
        }}
        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
```

### Acceptance Criteria
- [ ] Edge function deployed to staging
- [ ] Completing onboarding grants exactly 10 credits to the org
- [ ] Function is idempotent — a second call does NOT grant another 10 credits
- [ ] Function validates JWT and org membership before granting
- [ ] Green banner appears on first dashboard load after onboarding
- [ ] Banner reads "10 Free AI credits have been added!" with `Sparkles` icon (Lucide, no emoji)
- [ ] Dismissing banner removes it permanently (clears localStorage key)
- [ ] Credit grant failure does NOT block onboarding completion

---

## Story 7 — TSK-0450-S7: Remove "View All" button from credit dropdown

**Type:** fix | **Risk:** Low | **Dependencies:** None

### Files
- `src/components/credits/CreditWidgetDropdown.tsx`

### Changes

1. **Remove "View All" button** (lines 203–211) — delete entire button element:
```tsx
// DELETE:
<button
  onClick={() => {
    closeDropdown();
    navigate('/settings/credits');
  }}
  className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
>
  View All
</button>
```

2. **Fix footer layout** (line 193) — remove `justify-between` since only one button remains:
   FROM: `<div className="flex items-center justify-between px-3 pt-2 pb-1">`
   TO: `<div className="flex items-center px-3 pt-2 pb-1">`

### Acceptance Criteria
- [ ] "View All" button is gone from the credits dropdown
- [ ] "Top Up Credits" button remains and navigates to `/settings/credits?action=topup`
- [ ] Footer has no awkward empty space

---

## Execution Order

```
Parallel Batch 1 (all independent — run simultaneously):
  S1  acme.com placeholder fix (WebsiteInputStep + signup)
  S2  sixty.io URL fix + CORS cleanup
  S3  Domain mismatch detection (store + EnrichmentLoadingStep — no file overlap)
  S4  ManualEnrichmentStep char limits
  S5  SkillsConfigStep max items
  S7  Remove "View All" from dropdown

Separate track (requires edge function first):
  S6  Welcome credits + green banner (deploy edge function, then frontend)
```

---

## Critical File Reference

| Story | File |
|-------|------|
| S1, S3 | `src/pages/onboarding/v2/WebsiteInputStep.tsx` |
| S2 | `src/components/AccessCodeInput.tsx` |
| S4 | `src/pages/onboarding/v2/ManualEnrichmentStep.tsx` |
| S5 | `src/pages/onboarding/v2/SkillsConfigStep.tsx`, `src/components/onboarding/AddItemButton.tsx` |
| S6 | `supabase/functions/grant-welcome-credits/index.ts` (new), `src/pages/onboarding/v2/CompletionStep.tsx`, `src/components/credits/LowBalanceBanner.tsx` |
| S7 | `src/components/credits/CreditWidgetDropdown.tsx` |
