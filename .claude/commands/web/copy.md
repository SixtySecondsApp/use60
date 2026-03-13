---
name: web-copy
invoke: /web/copy
description: Generate all page content — headlines, descriptions, feature lists, comparison tables, code examples, technical explanations — before code
---

# /web/copy — Content Generation

**Purpose**: Write all page content before a single line of code. Headlines, body copy, feature descriptions, comparison data, code examples, technical specifications, pricing tables, CTAs. Content shapes layout — not the other way around.

**Input**: $ARGUMENTS

---

## WHY THIS PHASE EXISTS

The difference between a generic landing page and a spacebot.sh-quality product page is the **content**. The words, the data, the examples, the technical depth. Design and code are containers — content is the substance.

Without a dedicated copy phase:
- Build tries to write copy AND code simultaneously, both suffer
- Headlines become generic ("Powerful features for modern teams")
- Technical depth stays shallow because the coder isn't thinking about content
- Tables and comparison data get placeholder'd
- Code examples get skipped ("TODO: add example")

---

## EXECUTION

### Step 1: Load Context

Read in priority order:

1. **`.web/reference.md`** — reference analysis (tone, depth, content patterns to match)
2. **`.web/brief.md`** — section stack, audience, conversion strategy
3. **`.web/style-guide.json`** — mode and aesthetic (affects copy tone — dark/premium sites need sharper copy)
4. **User input** — product details, features, differentiators
5. **CLAUDE.md / product docs** — source material for accurate feature descriptions

### Step 2: Content Architecture

Map every section from the brief to its content needs:

```
CONTENT MAP
===========
Section: Hero
  Headline:    [needed — 5-8 words, sharp value prop]
  Subheadline: [needed — 1-2 sentences expanding the headline]
  CTA:         [needed — button text + supporting text]
  Badge/Tag:   [optional — "Now in beta", "Open source", etc.]

Section: Architecture Overview
  Headline:    [needed]
  Body:        [needed — 2-3 paragraphs explaining the system]
  Diagram:     [needed — describe what the diagram shows]
  Sub-items:   [3-5 architecture components, each with name + 2-line description]

Section: Deep Dive (Feature X)
  Headline:    [needed]
  Body:        [needed — technical explanation]
  Code Block:  [needed — real usage example]
  Data Points: [3-5 specific technical details with values]

...
```

### Step 3: Tone Calibration

Set the copy tone based on reference analysis + brief:

| Tone Axis | Spectrum | Set To |
|-----------|----------|--------|
| Formality | casual ←→ formal | ? |
| Technical depth | accessible ←→ expert | ? |
| Confidence | humble ←→ bold | ? |
| Length | terse ←→ verbose | ? |
| Voice | third-person ←→ first-person | ? |
| Energy | calm ←→ urgent | ? |

State the calibration explicitly:

```
TONE: Bold-confident, technically deep, terse sentences. First-person plural ("we built").
      Short paragraphs. Let the architecture speak. No marketing fluff.
```

If `.web/reference.md` exists, match the reference's tone characteristics.

### Step 4: Write Section Content

For each section in the content map, produce the complete copy. Follow these rules:

**Headlines:**
- Lead with the outcome or capability, not the feature name
- Under 8 words for primary headlines
- Under 15 words for section headlines
- No generic filler ("Powerful", "Revolutionary", "Next-generation")
- If you can't say it specifically, you don't understand the product well enough

**Body Copy:**
- One idea per paragraph
- Max 3 sentences per paragraph
- Active voice
- Specific > vague ("8-type memory graph" not "advanced memory system")
- Numbers and specifics build credibility ("10 LLM providers" not "multiple providers")

**Technical Content:**
- Real code examples, not pseudocode (use the actual product's syntax)
- Config snippets should be copy-pasteable
- Terminal commands should be runnable
- Architecture descriptions should name real components
- Specifications should include actual values

**Comparison Tables:**
- Every cell has a value (no empty cells, use "-" or "N/A")
- Boolean features use checkmarks/crosses, not "Yes"/"No"
- Group features logically
- Highlight the recommended tier

**Feature Lists:**
- Icon + Name + 1-2 sentence description
- Group by category
- Lead each description with what it does, not what it is

**CTAs:**
- Primary: specific action ("Deploy in 60 seconds", "Start building")
- Secondary: lower commitment ("View documentation", "See pricing")
- Each CTA section needs supporting text (1 sentence reducing friction)

### Step 5: Content Review Pass

Check all content against these criteria:

```
CONTENT QA
==========
[ ] Every headline is specific to THIS product (would fail if you swapped the product name)
[ ] No placeholder text or TODOs
[ ] All numbers and specs are accurate (verified against source docs)
[ ] Code examples are syntactically correct and runnable
[ ] Comparison tables have complete data
[ ] CTAs match the conversion strategy from the brief
[ ] Tone is consistent across all sections
[ ] Technical depth matches the reference benchmark
[ ] Content density matches the reference (not thinner OR thicker)
[ ] Progressive disclosure: overview before details
[ ] Every section earns its place (would the page suffer if removed?)
```

If the reference analysis exists, do a side-by-side density check:

```
DENSITY CHECK vs. REFERENCE
============================
Reference sections: [N]     Our sections: [N]     ✓/✗
Reference avg density: [X]  Our avg density: [X]   ✓/✗
Reference code blocks: [N]  Our code blocks: [N]   ✓/✗
Reference data tables: [N]  Our data tables: [N]   ✓/✗
Reference specificity: [H]  Our specificity: [H]   ✓/✗
```

### Step 6: Save Content

Save to `.web/copy.md`:

```markdown
# Page Copy: [Page Name]

Generated: [date]
Tone: [calibration summary]
Reference: [URL if applicable]

---

## Hero

**Headline**: [text]
**Subheadline**: [text]
**CTA Primary**: [text]
**CTA Secondary**: [text]
**Badge**: [text or "none"]

---

## [Section Name]

**Headline**: [text]
**Body**:
[full body copy]

**Sub-items**:
- **[Name]**: [description]
- **[Name]**: [description]

**Code Example**:
```[language]
[code]
```

---

[...repeat for all sections...]
```

### Step 7: Update Pipeline State

```json
{
  "phase": "copy",
  "phaseGates": {
    "brief":  { "status": "complete" },
    "design": { "status": "complete" },
    "copy":   { "status": "complete", "completedAt": "<ISO>" },
    "build":  { "status": "pending" },
    "assets": { "status": "pending" },
    "polish": { "status": "pending" }
  }
}
```

---

## STANDALONE USE

`/web/copy` works independently:

```
/web/copy "write hero + features copy for an AI sales tool"
/web/copy "pricing table content for 4 tiers: free, pro, team, enterprise"
/web/copy "technical architecture section explaining our agent system"
/web/copy --rewrite "make the hero copy punchier and more specific"
```

When running standalone without a brief, it will ask:
1. What's the product?
2. Who's reading this?
3. What should they do after reading?

---

## ITERATION

Copy is the most iterable phase. Common follow-ups:

```
/web/copy --rewrite hero          # Rewrite just the hero section
/web/copy --tone "more technical" # Shift the tone across all sections
/web/copy --add "deployment"      # Add a new section's content
/web/copy --shorten               # Cut everything by 30%
/web/copy --deepen "memory"       # Add more technical depth to a section
```

---

## OUTPUT

```
Page copy complete → saved to .web/copy.md

  Sections: [N] with complete content
  Code examples: [N]
  Data tables: [N]
  Tone: [calibration summary]
  Density: [matches reference ✓ / lighter than reference ✗]

Next: /web/build to turn this content into production code
```
