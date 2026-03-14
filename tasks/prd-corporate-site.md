# PRD: Sixty Seconds Corporate Website (sixtyseconds.ai)

## Introduction

Build a premium corporate website for Sixty Seconds — the parent company behind 60 (AI sales command center) and a suite of GTM video/outreach tools. The site positions Sixty Seconds as "a product company that also does services" — like Anthropic to Claude. Dark, minimal, authoritative design matching the use60.com aesthetic.

Deployed as a separate Vercel project from `packages/corporate/`. Blog system with MDX for SEO/AEO/GEO content. Structured data (JSON-LD) on every page for AI search engine optimisation.

## Goals

- Establish Sixty Seconds as a credible, premium parent brand
- Showcase 10-product portfolio with clear navigation to individual product sites
- Drive traffic to use60.com (primary CTA: "Explore 60")
- Rank for GTM, AI sales, and video outreach queries via blog content
- Appear in AI-generated answers (AEO/GEO) through structured data and long-form product pages
- Attract customers, investors, and potential hires (all three audiences)

## User Stories

### US-001: Project scaffolding and build system
**Description:** As a developer, I want a new `packages/corporate/` package with Vite + React + Tailwind so that the corporate site can be developed and deployed independently.

**Acceptance Criteria:**
- [ ] `packages/corporate/` exists with its own `package.json`, `vite.config.ts`, `tailwind.config.js`
- [ ] `npm run dev` starts dev server on a unique port (e.g., 5176)
- [ ] `npm run build` produces static output in `dist/`
- [ ] `vercel.json` configured for SPA routing with cache headers
- [ ] Plausible analytics script included in `index.html`
- [ ] Shared Tailwind config extends the use60.com design system (colors, fonts, spacing)
- [ ] Typecheck passes

### US-002: Site layout shell (navbar + footer + routing)
**Description:** As a visitor, I want consistent navigation across all pages so that I can explore the site easily.

**Acceptance Criteria:**
- [ ] Navbar: Logo, Products, Services, Case Studies, Blog, About, Contact + "Explore 60" CTA button
- [ ] Footer: Company info, product links, social links (LinkedIn, Twitter), legal (Privacy, Terms, Cookie Policy)
- [ ] React Router with routes for: `/`, `/products`, `/services`, `/case-studies`, `/blog`, `/about`, `/contact`
- [ ] Dark mode default with optional light toggle (matching use60.com NavbarV19 pattern)
- [ ] Mobile responsive hamburger menu
- [ ] Smooth scroll for hash links
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5176

### US-003: Homepage — hero + company overview
**Description:** As a visitor, I want to immediately understand what Sixty Seconds is and what it offers so that I can decide where to go next.

**Acceptance Criteria:**
- [ ] Hero: Bold headline establishing Sixty Seconds as a product company ("We build the tools that make sales teams faster")
- [ ] Subtext: Company positioning (10 years GTM expertise, product + services)
- [ ] Primary CTA: "Explore 60" linking to use60.com
- [ ] Secondary CTA: "See our products" scrolling to product grid
- [ ] Credibility bar: "10 years", "200+ clients", "$500M+ pipeline", "40% close rate lift" (animated count-up)
- [ ] Product showcase: Grid of 3-4 featured products with icons, descriptions, and links to their domains
- [ ] Testimonial snippet (Viewpoint or existing)
- [ ] Background: Dark gradient with subtle grid lines (matching use60.com hero)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5176

### US-004: Products page — full portfolio grid
**Description:** As a visitor, I want to see all Sixty Seconds products in one place so that I can find the right tool for my needs.

**Acceptance Criteria:**
- [ ] Hero: "Products" heading with "GTM tools built from 10 years of doing it ourselves"
- [ ] Featured product card: 60 (larger, highlighted, links to use60.com)
- [ ] Product grid with 10 products, each showing: icon, name, one-liner, category tag, link to product domain
- [ ] Products grouped by category: AI Platform, Video, Data, Outreach, Campaigns
- [ ] Each product card links to external domain (use60.com or sixtyseconds.video) in new tab
- [ ] JSON-LD `Product` schema markup for each product
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5176

### US-005: Services page — managed GTM offering
**Description:** As a potential client, I want to understand Sixty Seconds' managed services so that I can decide whether to engage them.

**Acceptance Criteria:**
- [ ] Hero: "Services" heading with positioning ("We don't just build the tools — we run the campaigns")
- [ ] 3-4 service cards: Campaign Management, GTM Development, Sales Workflow Design, Custom Integration
- [ ] "How we work" section: Discovery → Build → Launch → Optimise
- [ ] CTA: "Book a call" linking to contact page or Calendly
- [ ] Social proof: Client logos or metrics
- [ ] JSON-LD `Service` schema markup
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5176

### US-006: Case Studies page — social proof
**Description:** As a potential customer, I want to see real results from Sixty Seconds' work so that I can trust their products and services.

**Acceptance Criteria:**
- [ ] Hero: "Case Studies" heading
- [ ] Case study cards: title, client name, key metric, brief summary, link to full study
- [ ] Full case study pages for each (at minimum: Viewpoint + 2 existing)
- [ ] Viewpoint case study with both testimonials (Joanna McNamara + Geordan Mandell)
- [ ] Existing case studies carried over from current sixtyseconds.ai site
- [ ] JSON-LD `Article` schema markup per case study
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5176

### US-007: Blog system with MDX
**Description:** As a content creator, I want to publish blog posts via MDX files so that we can build SEO/AEO/GEO presence without a CMS dependency.

**Acceptance Criteria:**
- [ ] Blog posts stored as `.mdx` files in `packages/corporate/src/content/blog/`
- [ ] MDX frontmatter: title, description, date, author, tags, image, slug
- [ ] Blog index page at `/blog` with post cards (title, excerpt, date, read time)
- [ ] Individual post pages at `/blog/:slug` with full MDX rendering
- [ ] Code syntax highlighting (if code blocks used)
- [ ] Table of contents auto-generated from headings
- [ ] JSON-LD `Article` + `BlogPosting` schema markup per post
- [ ] Open Graph + Twitter Card meta tags per post
- [ ] RSS feed at `/blog/rss.xml`
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5176

### US-008: About page — lean team + company story
**Description:** As a visitor, I want to learn about the team and company history so that I can decide if Sixty Seconds is trustworthy.

**Acceptance Criteria:**
- [ ] Company story section: Founded 2020 (or actual date), mission, evolution from agency to product company
- [ ] Founder card: Andrew Bryce — photo, title, brief bio
- [ ] "Team of X" section: headcount, key roles, culture snippet (no individual bios)
- [ ] Values or principles section (2-3 bullets: "Speed wins", "Default to action", etc.)
- [ ] Certifications: Cyber Essentials badge
- [ ] JSON-LD `Organization` schema markup
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5176

### US-009: Contact page
**Description:** As a prospect, I want to easily get in touch so that I can start a conversation.

**Acceptance Criteria:**
- [ ] Heading: "Let's talk"
- [ ] Embedded Calendly or booking link for demo/call
- [ ] Contact form (name, email, company, message) — submits to Supabase edge function or email service
- [ ] Company info: email, LinkedIn, registered address
- [ ] JSON-LD `ContactPoint` schema markup
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5176

### US-010: SEO/AEO/GEO foundation
**Description:** As a marketer, I want every page to have proper structured data and meta tags so that we rank in traditional search and appear in AI-generated answers.

**Acceptance Criteria:**
- [ ] Global `<head>` component with: title, description, canonical URL, OG tags, Twitter cards
- [ ] JSON-LD schemas on every page: Organization (global), Product (products page), Service (services), Article (blog/case studies), FAQ (if present), BreadcrumbList (all pages)
- [ ] `robots.txt` allowing all crawlers including AI bots (GPTBot, ClaudeBot, PerplexityBot)
- [ ] `sitemap.xml` auto-generated from routes + blog posts
- [ ] Semantic HTML throughout (proper heading hierarchy, landmark elements, alt text)
- [ ] Page load under 1.5s on 3G (Lighthouse performance > 90)
- [ ] Typecheck passes

### US-011: Vercel deployment config
**Description:** As a developer, I want the corporate site deployable to Vercel independently so that it can be live at sixtyseconds.ai.

**Acceptance Criteria:**
- [ ] `vercel.json` in `packages/corporate/` with correct build config
- [ ] Build command: `cd ../.. && npm install && cd packages/corporate && npm run build`
- [ ] Output directory: `dist`
- [ ] SPA rewrites for client-side routing
- [ ] Cache headers for static assets
- [ ] Domain: sixtyseconds.ai configured in Vercel
- [ ] Typecheck passes

## Functional Requirements

- FR-1: All pages render server-side or are pre-built as static HTML for SEO
- FR-2: Blog posts are authored as MDX files — no external CMS dependency
- FR-3: Every page includes JSON-LD structured data appropriate to its content type
- FR-4: Product links open in new tabs (external domains)
- FR-5: Navigation highlights the active page
- FR-6: All images use lazy loading with blur placeholders
- FR-7: Contact form submissions are stored or emailed (not lost)
- FR-8: Site is fully responsive (mobile-first)
- FR-9: Dark mode is default; light mode available via toggle
- FR-10: Plausible analytics tracks pageviews and CTA clicks

## Non-Goals (Out of Scope)

- Authentication or user accounts on the corporate site
- E-commerce or direct purchasing (that's on product domains)
- Complex CMS admin interface (MDX files in repo are sufficient)
- Multi-language / i18n (English only for launch)
- Individual product feature pages (those live on product domains)
- Video hosting or playback (link to product sites instead)

## Technical Considerations

- **Framework:** React + Vite + React Router (matching existing monorepo patterns)
- **Styling:** Tailwind CSS extending use60.com design tokens (colors, fonts, glassmorphism)
- **Blog:** MDX with `@mdx-js/rollup` or similar Vite plugin
- **Structured Data:** `react-helmet-async` or custom `<Head>` component for per-page meta
- **Deployment:** Vercel with `packages/corporate/vercel.json`
- **Monorepo:** npm workspaces (already configured), new entry in root `package.json`
- **Design system:** Dark navy (#070b18), emerald accent (#37bd7e), blue accent for light mode, Manrope/Inter fonts
- **Analytics:** Plausible script (already have: `pa-A_WaQYHrhFg5GaOumoqVW`)

## Success Metrics

- Site live at sixtyseconds.ai within 1 week
- Lighthouse performance score > 90 on all pages
- JSON-LD validated on all pages (Google Rich Results Test)
- Blog system functional with at least 1 seed post
- At least 3 case studies published (Viewpoint + 2 existing)
- Primary CTA ("Explore 60") click-through tracked in Plausible

## Open Questions

- What is the actual founding year? (Current site says 2020, need to confirm)
- Do you have high-res team/founder photos for the About page?
- Which existing case studies from the current site should we carry over? (Need client names + key metrics)
- Calendly booking link for the Contact page?
