---
name: web-reference
invoke: /web/reference
description: Deep-analyze a reference website — extract section architecture, content patterns, visual approach, copy tone, and technical depth for replication
---

# /web/reference — Reference Site Analysis

**Purpose**: Deconstruct a reference website into replicable patterns. Extracts information architecture, section types, content density, visual approach, copy tone, and technical depth. Output feeds directly into `/web/brief` and `/web/copy` as a quality benchmark.

**Input**: $ARGUMENTS (URL or site name)

---

## WHEN TO USE

- User says "build something like [URL]"
- User says "this is the standard" or "aim for this"
- User provides a competitor or inspiration URL
- Starting a complex product page (not a simple marketing landing)

---

## EXECUTION

### Step 1: Fetch and Parse

Fetch the target URL with WebFetch. If the site has multiple pages, analyze the primary page first, then note the sitemap structure.

Extract raw content: headings, body text, code blocks, images, interactive elements, navigation.

### Step 2: Information Architecture

Map the full section structure in order:

```
SECTION MAP
===========
1. [Section Type] — [Purpose]
   Content: [what's in it — headlines, body, visuals, code, data]
   Density: [light / medium / heavy]
   Interactive: [static / tabs / accordion / toggle / animation]

2. [Section Type] — [Purpose]
   ...
```

Classify each section into one of these types:

| Section Type | Description | Example |
|-------------|-------------|---------|
| `hero` | Opening hook with value proposition | Headline + subhead + CTA + visual |
| `architecture` | System design explanation with diagram | Channels → Branches → Workers |
| `deep-dive` | Technical feature breakdown with examples | Memory Cortex, 8 types, how it works |
| `integration-grid` | Supported tools/platforms in a grid | 10 LLM providers, messaging platforms |
| `feature-matrix` | Features with icons + descriptions | Tool categories with capabilities |
| `code-example` | Inline code blocks showing usage | Docker run, config snippets, cron syntax |
| `comparison-table` | Side-by-side feature/pricing comparison | Plans with feature rows |
| `pricing` | Pricing tiers with feature breakdown | Pod / Outpost / Nebula / Titan |
| `social-proof` | Testimonials, logos, stats | User quotes, company logos |
| `process-flow` | Step-by-step how it works | 3-5 steps with descriptions |
| `tech-stack` | Technology choices with rationale | Built with Rust, Tokio, SQLite... |
| `deployment` | Setup/install instructions | Self-host vs cloud, Docker command |
| `faq` | Questions and answers | Accordion or list format |
| `cta` | Final conversion section | Sign up, get started, contact |
| `data-table` | Structured data in table format | Specs, limits, compatibility |
| `taxonomy` | Categorized list or tree | Memory types, tool categories |
| `narrative` | Story-driven explanation | Origin, philosophy, differentiators |

### Step 3: Content Patterns

Analyze the copy/content approach:

```
CONTENT ANALYSIS
================
Tone:           [technical-authoritative / friendly-casual / bold-confident / etc.]
Reading Level:  [technical / intermediate / accessible]
Headline Style: [short-punchy / descriptive / question-based / statement]
Body Style:     [concise-bullets / narrative-paragraphs / mixed]
Code Presence:  [none / light / heavy]
Data Density:   [light / medium / heavy]
Technical Depth: [surface / mid / deep]

Copy Examples:
  Headlines: "[example]", "[example]", "[example]"
  Body:      "[example sentence showing tone]"
  CTAs:      "[example]", "[example]"
```

### Step 4: Visual Patterns

Extract the visual approach (what you can infer, not pixel-perfect):

```
VISUAL ANALYSIS
===============
Mode:          [dark / light / mixed]
Color Strategy: [monochrome+accent / multi-color / gradient-heavy / etc.]
Typography:     [geometric-sans / humanist / monospace-heavy / mixed]
Spacing:        [tight-dense / comfortable / generous-airy]
Section Rhythm: [uniform / alternating / varied]
Visual Weight:  [text-heavy / balanced / visual-heavy]
Diagrams:       [none / simple / complex / interactive]
Code Styling:   [none / inline / blocks / terminal-style]
Animation:      [none / subtle / moderate / cinematic]
Atmosphere:     [clean-minimal / glassy / gradient-mesh / dark-glow / etc.]
```

### Step 5: Replicable Patterns

Distill the reference into patterns the team can replicate:

```
REPLICABLE PATTERNS
===================
1. Section Flow:
   [ordered list of section types and transitions]

2. Content Rhythm:
   [how the page alternates between explanation, visualization, and proof]

3. Progressive Disclosure:
   [how complex information is layered — overview first, then depth]

4. Technical Credibility Signals:
   [what makes it feel authoritative — code examples, architecture diagrams, specific numbers]

5. Conversion Architecture:
   [how CTAs are placed, what gates the conversion, pricing strategy]

6. Information Density Handling:
   [how dense content stays scannable — tables, grids, icons, whitespace]

7. Distinctive Elements:
   [what makes this site memorable vs generic — unique section types, interactions, visual signatures]
```

### Step 6: Gap Analysis

If the user has an existing site or product, compare:

```
GAP ANALYSIS
============
Reference has, we lack:
  - [pattern/section/approach]
  - [pattern/section/approach]

We have, reference lacks:
  - [advantage to preserve]

Priority improvements:
  1. [highest impact change]
  2. [second highest]
  3. [third]
```

### Step 7: Save Analysis

Save to `.web/reference.md`:

```markdown
# Reference Analysis: [Site Name]

Source: [URL]
Analyzed: [date]

## Section Map
[from Step 2]

## Content Patterns
[from Step 3]

## Visual Patterns
[from Step 4]

## Replicable Patterns
[from Step 5]

## Gap Analysis
[from Step 6, if applicable]

## Recommendations for /web/brief
[specific guidance for the brief phase]

## Recommendations for /web/copy
[tone, depth, content types to include]

## Recommendations for /web/build
[section types to implement, interaction patterns, code block styling]
```

---

## V8 LEARNINGS: REFERENCE ANALYSIS APPROACH

When analyzing reference sites, extract these six dimensions systematically:

1. **Section architecture** — ordered section types, count, flow logic
2. **Visual style** — color mode, palette strategy, typography, spacing, atmosphere
3. **Copy patterns** — headline length/style, body tone, CTA language
4. **Component patterns** — recurring UI components, layout primitives, interaction patterns
5. **Conversion architecture** — CTA placement, form design, trust signals, demo strategy
6. **Technical patterns** — animation approach, responsive strategy, performance tradeoffs

### Known Reference Patterns

**Harmonic.ai pattern** (light mode B2B SaaS):
- Light mode default, clean and professional
- Short aspirational headlines (3-6 words)
- Email-only demo request forms (low friction)
- Logo trust bar immediately after hero section
- 3-step feature narrative (problem -> capability -> outcome)
- Inline testimonials between feature sections (trust at point of interest, not isolated)
- Persistent header CTA (always visible conversion path)
- Dark footer for visual grounding

---

## MULTIPLE REFERENCES

If given multiple URLs, analyze each and produce a synthesis:

```
SYNTHESIS
=========
Common patterns across all references:
  - [pattern]

Best-in-class from each:
  - [Site A]: [what it does best]
  - [Site B]: [what it does best]

Recommended hybrid approach:
  - [take X from A, Y from B]
```

---

## OUTPUT

```
Reference analysis complete → saved to .web/reference.md

Key findings:
  - [section count] sections, [density] content density
  - [tone] copy tone, [depth] technical depth
  - [distinctive element 1]
  - [distinctive element 2]

Next: /web/brief to build strategy using this reference as benchmark
  or: /web/ship to run the full pipeline with reference-informed quality
```
