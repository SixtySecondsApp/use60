# PRD: Landing Page Builder V2

## Introduction

The landing page builder has a strong AI generation pipeline (3-phase: Strategy → Copy → Assembly, multi-agent, research-backed, A/B copy, image + SVG generation). However, it stops at code export — users can't publish, capture leads, upload their own images, start from templates, or optimize for SEO. This PRD covers 5 improvements that transform the builder from a mockup tool into a full lead-generation platform.

## Goals

- Users can publish a landing page to a live URL in under 60 seconds
- Published pages capture leads via working forms, stored and viewable in-app
- Users can upload/replace/crop images instead of relying solely on AI generation
- New users can start from a template and skip the Strategy + Copy phases
- Published pages have proper SEO meta tags and OG images for social sharing

## Feature 1: One-Click Publish to Vercel

### US-001: Published Pages Database Schema
**Description:** As a developer, I want a `published_landing_pages` table so that published page data is persisted and queryable.

**Acceptance Criteria:**
- [ ] Migration creates `published_landing_pages` table with columns: `id` (UUID PK), `session_id` (FK to landing_builder_sessions), `org_id`, `user_id`, `slug` (unique), `title`, `html_content` (text), `meta_description`, `og_image_url`, `custom_domain`, `vercel_deployment_id`, `vercel_url`, `status` (draft/published/unpublished), `published_at`, `updated_at`, `created_at`
- [ ] RLS policies: users can CRUD own org's pages
- [ ] Index on `slug` (unique) and `org_id`
- [ ] Migration uses `DROP POLICY IF EXISTS` before `CREATE POLICY`
- [ ] Typecheck passes

### US-002: Publish Service & Vercel Integration
**Description:** As a developer, I want a `landingPublishService` that deploys HTML to Vercel so that pages go live with a URL.

**Acceptance Criteria:**
- [ ] New service at `src/lib/services/landingPublishService.ts`
- [ ] `publish(sessionId, slug, htmlContent, meta)` method: generates final HTML with SEO tags, calls Vercel Deploy API, stores deployment info in `published_landing_pages`
- [ ] `unpublish(pageId)` method: removes Vercel deployment, updates status
- [ ] `updateSlug(pageId, newSlug)` method: updates slug, triggers redeployment
- [ ] Vercel API token stored in org settings (not VITE_ prefixed)
- [ ] Returns live URL on success
- [ ] Error handling with toast feedback
- [ ] Typecheck passes

### US-003: Image Persistence on Publish
**Description:** As a user, I want my AI-generated images to be permanently hosted so they don't break after publish.

**Acceptance Criteria:**
- [ ] On publish, all base64/temporary image URLs in sections are downloaded and uploaded to Supabase Storage bucket `landing-page-assets`
- [ ] HTML content is updated with permanent Supabase Storage public URLs before deploying to Vercel
- [ ] Storage bucket has public read access, write restricted to authenticated users
- [ ] Handles both base64 data URLs and external URLs
- [ ] Typecheck passes

### US-004: Publish Modal UI
**Description:** As a user, I want a publish button and modal so I can set my page slug and publish with one click.

**Acceptance Criteria:**
- [ ] "Publish" button in `EditorToolbar` (assembly mode only), uses Lucide `Globe` icon
- [ ] Clicking opens a modal with: slug input (auto-suggested from company name), title input, live URL preview (`pages.use60.com/{slug}`), publish/update button
- [ ] Slug validation: lowercase, alphanumeric + hyphens, 3-60 chars, unique check
- [ ] Shows loading state during deployment
- [ ] After publish, shows live URL with copy button and "Open in new tab" link
- [ ] Re-publishing updates existing deployment (not creates new)
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

### US-005: Published Pages List View
**Description:** As a user, I want to see all my published pages so I can manage them.

**Acceptance Criteria:**
- [ ] New route/page at `/landing-pages` showing a table of published pages
- [ ] Columns: title, slug, status, published date, live URL (clickable)
- [ ] Actions per row: copy URL, open page, unpublish, edit (opens builder)
- [ ] Empty state when no pages published
- [ ] Filtered by active org
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

### US-006: Custom Domain Mapping
**Description:** As a user, I want to connect a custom domain to my published page.

**Acceptance Criteria:**
- [ ] Custom domain input field in publish modal (optional, expandable section)
- [ ] Instructions shown: "Add a CNAME record pointing to `cname.vercel-dns.com`"
- [ ] Calls Vercel Domains API to add domain to deployment
- [ ] Stores custom domain in `published_landing_pages.custom_domain`
- [ ] Shows domain verification status (pending/active)
- [ ] Typecheck passes

---

## Feature 2: Form Builder with Lead Capture

### US-007: Form Submissions Database Schema
**Description:** As a developer, I want a `landing_form_submissions` table so that form data from published pages is stored.

**Acceptance Criteria:**
- [ ] Migration creates `landing_form_submissions` table with columns: `id` (UUID PK), `page_id` (FK to published_landing_pages), `org_id`, `form_data` (JSONB), `source_url`, `ip_address`, `user_agent`, `submitted_at`
- [ ] RLS policies: org members can read submissions for their org's pages
- [ ] Index on `page_id` and `org_id`
- [ ] Migration uses `DROP POLICY IF EXISTS` before `CREATE POLICY`
- [ ] Typecheck passes

### US-008: Form Submission Edge Function
**Description:** As a developer, I want an edge function that receives form submissions from published pages so data is captured securely.

**Acceptance Criteria:**
- [ ] New edge function `handle-landing-form-submission/index.ts`
- [ ] Accepts POST with JSON body: `{ page_id, form_data, source_url }`
- [ ] Validates page_id exists and is published
- [ ] Stores submission in `landing_form_submissions`
- [ ] Returns 200 with `{ success: true }`
- [ ] Rate limiting: max 10 submissions per IP per minute per page
- [ ] CORS configured with `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- [ ] JWT verification disabled (public endpoint): `verify_jwt = false`
- [ ] Typecheck passes

### US-009: FormBlock Shared Component
**Description:** As a user, I want CTA sections to have working email capture forms so my landing pages can collect leads.

**Acceptance Criteria:**
- [ ] New shared component `src/components/landing-builder/sections/shared/FormBlock.tsx`
- [ ] Renders configurable form fields: name (text), email (email), phone (tel), company (text), message (textarea)
- [ ] Client-side validation: email format, required fields
- [ ] Submit button with loading state and success/error feedback
- [ ] Form action: POST to `handle-landing-form-submission` edge function
- [ ] Styled to match section's brand config (accent color, fonts)
- [ ] Works in both preview iframe and published HTML
- [ ] Typecheck passes

### US-010: Form Configuration in Section Data Model
**Description:** As a developer, I want sections to support form configuration so the builder can add/configure forms.

**Acceptance Criteria:**
- [ ] Extend `LandingSection` type with optional `form?: { fields: FormField[]; submit_label: string; success_message: string; notification_email?: string }`
- [ ] `FormField` type: `{ name: string; type: 'text' | 'email' | 'tel' | 'textarea'; label: string; required: boolean; placeholder?: string }`
- [ ] CTA section components (`CtaCentered`, `CtaSplitLeft`, `CtaGradient`) render `FormBlock` when `section.form` is defined
- [ ] Default form config for CTA sections: email (required) + name (optional)
- [ ] Typecheck passes

### US-011: Form Editor in Properties Panel
**Description:** As a user, I want to configure form fields in the editor panel so I can customize what data I collect.

**Acceptance Criteria:**
- [ ] New "Form" tab in `PropertiesPanel` when a CTA section is selected
- [ ] Toggle to enable/disable form on the section
- [ ] Add/remove/reorder form fields with drag handles
- [ ] Per-field options: label, placeholder, required toggle, field type dropdown
- [ ] Submit button label editor
- [ ] Success message editor
- [ ] Live preview updates in assembly iframe
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

### US-012: Form Submissions Viewer
**Description:** As a user, I want to view form submissions for my published pages so I can follow up with leads.

**Acceptance Criteria:**
- [ ] Submissions tab on the published pages list view (`/landing-pages`)
- [ ] Click a page → see all submissions in a table
- [ ] Columns: submitted date, email, name, and other submitted fields
- [ ] Export to CSV button
- [ ] Submission count badge on page list row
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

### US-013: Form Submissions to CRM (Follow-up)
**Description:** As a user, I want form submissions to auto-create contacts in 60's pipeline so leads flow into my CRM.

**Acceptance Criteria:**
- [ ] Toggle in page settings: "Auto-create contacts from submissions"
- [ ] When enabled, `handle-landing-form-submission` also creates a `contacts` record with `owner_id` = page owner
- [ ] Maps: email → contact email, name → contact name, company → contact company
- [ ] Creates an `activities` record: "Lead captured from landing page: {page_title}"
- [ ] Deduplicates by email — if contact exists, creates activity only
- [ ] Typecheck passes

---

## Feature 3: Image Upload, Replace & Crop

### US-014: Landing Builder Assets Storage Bucket
**Description:** As a developer, I want a Supabase Storage bucket for user-uploaded landing page assets.

**Acceptance Criteria:**
- [ ] Migration or setup script creates `landing-builder-assets` bucket
- [ ] Public read access for published pages
- [ ] Write access restricted to authenticated users within their org
- [ ] Max file size: 5MB
- [ ] Allowed types: image/jpeg, image/png, image/webp, image/gif, image/svg+xml
- [ ] Typecheck passes

### US-015: Image Upload Service
**Description:** As a developer, I want a service that handles image upload and URL generation for the landing builder.

**Acceptance Criteria:**
- [ ] New service at `src/lib/services/landingAssetService.ts`
- [ ] `uploadImage(file: File, sessionId: string)` → uploads to `landing-builder-assets/{orgId}/{sessionId}/{filename}`, returns public URL
- [ ] `deleteImage(url: string)` → removes from storage
- [ ] File validation: type, size, dimensions (max 4096x4096)
- [ ] Generates unique filenames to prevent collisions
- [ ] Typecheck passes

### US-016: Image Upload Button in Properties Panel
**Description:** As a user, I want to upload my own image for a section so I'm not limited to AI-generated images.

**Acceptance Criteria:**
- [ ] "Upload Image" button in `PropertiesPanel` Assets section (next to existing "Regenerate" button)
- [ ] Opens file picker filtered to image types
- [ ] Shows upload progress indicator
- [ ] On success: updates `section.image_url` with public URL, sets `section.image_status` to `'complete'`
- [ ] Thumbnail preview in panel after upload
- [ ] "Paste URL" input for external images (validates URL loads an image)
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

### US-017: Image Upload in Inline Edit Toolbar
**Description:** As a user, I want to upload an image by clicking on the image slot in the preview so I can replace images intuitively.

**Acceptance Criteria:**
- [ ] Extend `InlineEditController` floating toolbar for image elements
- [ ] Add "Upload" button (Lucide `Upload` icon) alongside existing "Regenerate" and "Remove"
- [ ] Clicking "Upload" opens file picker
- [ ] Upload flow same as US-016
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

### US-018: Image Crop Modal
**Description:** As a user, I want to crop uploaded images so they fit my section layout properly.

**Acceptance Criteria:**
- [ ] After image upload, optional crop step opens a modal
- [ ] Uses `react-easy-crop` (or similar lightweight library) for crop UI
- [ ] Aspect ratio presets: Free, 16:9 (hero), 4:3, 1:1
- [ ] "Apply" saves cropped version to storage, updates section URL
- [ ] "Skip" uses original uncropped image
- [ ] Crop modal also accessible from Properties Panel via "Crop" button on existing images
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

---

## Feature 4: Template Library

### US-019: Template Data Format & Starter Templates
**Description:** As a developer, I want a template format and 6 starter templates so users can start from pre-built pages.

**Acceptance Criteria:**
- [ ] New directory `src/components/landing-builder/templates/`
- [ ] Template type: `{ id: string; name: string; description: string; category: 'saas' | 'agency' | 'product' | 'event' | 'waitlist' | 'portfolio'; thumbnail: string; sections: LandingSection[]; brandConfig: BrandConfig }`
- [ ] 6 templates created: SaaS Hero (classic startup), Agency (services), Product Launch, Event/Webinar, Waitlist/Coming Soon, Minimal Portfolio
- [ ] Each template has 4-8 sections with placeholder copy and pre-assigned layout variants
- [ ] Templates exported from `templates/index.ts`
- [ ] Typecheck passes

### US-020: Template Gallery in Builder Empty State
**Description:** As a user, I want to browse and pick a template when starting a new landing page so I can skip the strategy phase.

**Acceptance Criteria:**
- [ ] New "Start from Template" card in `LandingBuilderEmpty` (alongside existing 4 cards)
- [ ] Clicking opens a template gallery modal/panel showing all templates as cards
- [ ] Each card shows: name, description, category badge, section count, thumbnail preview
- [ ] Category filter tabs (All, SaaS, Agency, Product, etc.)
- [ ] Clicking a template shows a full-width preview using `ReactSectionRenderer`
- [ ] "Use this template" button → loads sections + brand config into assembly mode
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

### US-021: Template Selection Phase Skip
**Description:** As a developer, I want template selection to bypass Strategy + Copy phases so users go straight to editing.

**Acceptance Criteria:**
- [ ] When a template is selected, `setAssemblySections(template.sections)` and `setAssemblyBrandConfig(template.brandConfig)`
- [ ] `setIsAssemblyMode(true)` and `setCurrentPhase(2)` (Assembly)
- [ ] Workspace created with `sections` pre-populated, `current_phase: 2`
- [ ] Asset generation queue NOT started (templates use placeholder images — user can regenerate or upload)
- [ ] Chat available for refinements in assembly mode
- [ ] Typecheck passes

---

## Feature 5: SEO & Analytics

### US-022: SEO Fields Data Model
**Description:** As a developer, I want SEO metadata stored in the workspace/published page so pages have proper meta tags.

**Acceptance Criteria:**
- [ ] Extend `LandingBuilderWorkspace` type with `seo?: { title: string; description: string; og_image_url?: string; keywords?: string[]; canonical_url?: string; gtm_id?: string; facebook_pixel_id?: string }`
- [ ] Auto-generate defaults: `title` from hero headline, `description` from hero subhead + body (first 160 chars)
- [ ] SEO fields saved to workspace and copied to `published_landing_pages` on publish
- [ ] Typecheck passes

### US-023: SEO Settings Panel
**Description:** As a user, I want to edit SEO meta tags for my landing page so it appears correctly in search and social shares.

**Acceptance Criteria:**
- [ ] New "Page Settings" button in `EditorToolbar` (Lucide `Settings` icon)
- [ ] Opens a panel/modal with tabs: SEO, Analytics
- [ ] SEO tab: title input (60 char limit with counter), description textarea (160 char limit), keywords input, OG image preview (auto-generated or upload)
- [ ] Analytics tab: Google Tag Manager ID input, Facebook Pixel ID input, custom `<head>` script textarea
- [ ] Changes auto-saved to workspace
- [ ] Verify in browser on localhost:5175
- [ ] Typecheck passes

### US-024: SEO Tags in HTML Export
**Description:** As a developer, I want the HTML export to include all SEO meta tags so published pages are optimized.

**Acceptance Criteria:**
- [ ] Update `wrapInHtml()` in export flow to include: `<title>`, `<meta name="description">`, `<meta property="og:title">`, `<meta property="og:description">`, `<meta property="og:image">`, `<meta property="og:url">`, `<meta name="twitter:card" content="summary_large_image">`, `<link rel="canonical">`
- [ ] If GTM ID provided, inject GTM script in `<head>` and noscript in `<body>`
- [ ] If Facebook Pixel ID provided, inject pixel script
- [ ] If custom head script provided, inject in `<head>`
- [ ] JSON-LD Organization schema auto-generated from org profile
- [ ] Typecheck passes

### US-025: OG Image Auto-Generation
**Description:** As a user, I want an OG image auto-generated from my hero section so social shares look professional.

**Acceptance Criteria:**
- [ ] On publish (if no custom OG image set), generate a 1200x630 OG image
- [ ] Use the hero section's headline + brand colors to create the image via Nano Banana service
- [ ] Prompt: "Social media preview card for: {headline}. Brand colors: {primary}, {accent}. Clean, professional, no excessive text. 1200x630."
- [ ] Upload to Supabase Storage, set as `og_image_url`
- [ ] Fallback: if generation fails, use hero section's existing image (if any)
- [ ] Typecheck passes

---

## Non-Goals (Out of Scope)

- A/B testing with live traffic splitting (future phase)
- Multi-page sites / site management
- Real-time collaboration between multiple users
- CMS / blog integration
- Localization / multi-language support
- Visual drag-and-drop page builder (we use AI + chat, not Webflow-style)
- Stripe/payment integration on forms
- Email marketing automation from form submissions

## Technical Considerations

### Schema Changes
- New table: `published_landing_pages` (US-001)
- New table: `landing_form_submissions` (US-007)
- New storage bucket: `landing-builder-assets` (US-014)
- Extended types: `LandingSection.form`, workspace `seo` field (US-010, US-022)

### Integrations
- **Vercel API**: Deploy, domains, delete — requires API token in org settings
- **Supabase Storage**: Image persistence and user uploads
- **Nano Banana Service**: OG image generation (reuses existing service)

### Key Files to Modify
- `src/components/landing-builder/LandingPageBuilder.tsx` — template selection, publish button
- `src/components/landing-builder/LandingBuilderEmpty.tsx` — template gallery entry
- `src/components/landing-builder/PropertiesPanel.tsx` — form editor, image upload, SEO panel
- `src/components/landing-builder/sections/shared/AssetSlot.tsx` — upload trigger
- `src/components/landing-builder/sections/shared/CtaButton.tsx` → `FormBlock.tsx` integration
- `src/components/landing-builder/sections/cta/*.tsx` — render FormBlock
- `src/components/landing-builder/EditorToolbar.tsx` — publish + settings buttons
- `src/components/landing-builder/agents/exportPolishAgent.ts` — SEO meta in HTML
- `src/components/landing-builder/sections/shared/InlineEditController.tsx` — upload in toolbar
- `src/components/landing-builder/types.ts` — FormField, SEO types

### Patterns to Follow
- React Query for all DB reads, mutations for writes
- `maybeSingle()` for optional records
- `getCorsHeaders(req)` in edge functions
- Explicit column selection (no `select('*')`)
- Lucide React icons only
- Toast feedback on all errors

### Performance
- Image uploads capped at 5MB
- Crop happens client-side before upload (reduced storage)
- Published HTML is static — no runtime JS except forms + analytics
- Vercel CDN handles caching and global distribution

## Success Metrics

- Time from "approve copy" to live URL < 60 seconds
- Form submission capture rate > 95% (no lost submissions)
- At least 30% of new builder sessions start from a template within 30 days
- All published pages score 90+ on Lighthouse Performance
- OG image present on 100% of published pages

## Open Questions

- Should we offer a free `pages.use60.com` subdomain + paid custom domains, or all custom?
- Rate limiting strategy for form submissions on high-traffic pages?
- Should template thumbnails be static screenshots or live mini-renders?
