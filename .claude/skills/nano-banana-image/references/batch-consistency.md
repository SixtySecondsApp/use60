# Batch Consistency — Cohesive Image Sets

How to generate multiple images that look like they belong together. Critical for landing pages, feature grids, blog series, and social campaigns.

---

## The Shared Prefix Pattern

The most reliable method. Create a style prefix that starts every prompt in the batch.

### Building the Prefix

Extract these locked elements and combine into a single string:

```
LOCKED ELEMENTS:
1. Style descriptor: "Flat vector illustration"
2. Visual characteristics: "soft gradients, rounded shapes, 2px consistent outlines"
3. Color palette: "using palette #8129D7 violet, #2A5EDB blue, #03AD9C teal on #FAFAFA"
4. Composition rules: "centered composition, 30% negative space"
5. Lighting: "soft top-left lighting, subtle shadows"

ASSEMBLED PREFIX:
"Flat vector illustration with soft gradients, rounded shapes, 2px consistent outlines,
using palette #8129D7 violet, #2A5EDB blue, #03AD9C teal on #FAFAFA background,
centered composition with 30% negative space, soft top-left lighting with subtle shadows"
```

### Using the Prefix

Append unique subject matter to the shared prefix for each image:

```typescript
const PREFIX = `Flat vector illustration with soft gradients, rounded shapes,
palette #8129D7, #2A5EDB, #03AD9C on #FAFAFA, centered composition,
soft top-left lighting with subtle shadows`;

const prompts = [
  `${PREFIX}, showing a team of 3 collaborating on a video call interface`,
  `${PREFIX}, showing an analytics dashboard with rising bar charts and sparklines`,
  `${PREFIX}, showing an AI assistant icon surrounded by floating task cards`,
  `${PREFIX}, showing a rocket ship launching from a laptop screen`,
];

// Generate all in parallel
const results = await nanoBananaService.generateBatch(
  prompts.map(prompt => ({ prompt, aspect_ratio: 'square' }))
);
```

---

## What to Lock vs. What to Vary

### Must Lock (Same Across All)

| Element | Why |
|---------|-----|
| **Color palette** | Different palettes = images don't match |
| **Style descriptor** | "Flat illustration" vs "3D render" = visual clash |
| **Outline weight** | Mixing 1px and 3px outlines looks inconsistent |
| **Lighting direction** | Shadows going different directions is jarring |
| **Level of detail** | Mixing simple icons with detailed scenes doesn't cohere |

### Can Vary (Different Per Image)

| Element | How to Vary |
|---------|-------------|
| **Subject matter** | Each image shows a different concept/feature |
| **Composition** | Some centered, some rule-of-thirds — within the same style family |
| **Scale** | Some wide establishing, some close-up detail — adds variety |
| **Color emphasis** | Each image can lean on a different palette color as dominant |
| **Minor elements** | Background details, secondary objects can differ |

---

## Style Family Consistency Patterns

### Pattern 1: Feature Grid (3-6 images)

All images same style, same dimensions, different subjects:

```
Use Case: Landing page feature section
Format: Square, same dimensions
Style: Identical prefix
Variation: Subject only

Example:
- Feature 1: [PREFIX] + "showing a calendar with smart scheduling"
- Feature 2: [PREFIX] + "showing an email composer with AI suggestions"
- Feature 3: [PREFIX] + "showing a pipeline funnel with deal cards"
- Feature 4: [PREFIX] + "showing a contact profile with insights"
```

### Pattern 2: Hero + Supporting (1 hero + 2-3 detail)

One large establishing shot, smaller detail shots:

```
Use Case: Case study, product page
Format: Hero = landscape, details = square
Style: Same prefix, different scale

Example:
- Hero: [PREFIX] + "wide panoramic view of the complete dashboard ecosystem"
- Detail 1: [PREFIX] + "close-up of the analytics chart component"
- Detail 2: [PREFIX] + "close-up of the AI assistant conversation interface"
- Detail 3: [PREFIX] + "close-up of the task management board"
```

### Pattern 3: Process/Timeline (3-5 sequential)

Images that tell a sequential story:

```
Use Case: How it works, onboarding flow
Format: Same dimensions, sequential narrative
Style: Same prefix + consistent subject presence

Example:
- Step 1: [PREFIX] + "a person discovering the product for the first time, looking curious"
- Step 2: [PREFIX] + "the same person setting up their first project, engaged and focused"
- Step 3: [PREFIX] + "the same person seeing results, smiling with satisfaction"
```

### Pattern 4: Social Campaign (4-8 varied)

Same brand, different posts:

```
Use Case: Social media campaign, content series
Format: Square for feed, portrait for stories
Style: Looser consistency — same palette and style family, more creative variation

Example:
- Post 1: [PREFIX] + "bold typographic-style composition with abstract shapes"
- Post 2: [PREFIX] + "product screenshot mockup on gradient background"
- Post 3: [PREFIX] + "metaphorical illustration of the core benefit"
- Post 4: [PREFIX] + "data visualization showing impressive statistics"
```

---

## Anchoring to Known Visual Styles

Reference specific design systems or brands for instant consistency:

```
"in the style of Linear's marketing illustrations"
"following Stripe's clean documentation style"
"inspired by Notion's black-and-white illustration approach"
"in Vercel's dark, minimal, high-contrast aesthetic"
"Apple product photography style — clean, white, precise"
```

**Warning:** Don't copy brands directly. Use them as style anchors, then differentiate:

```
"Inspired by Linear's clean marketing illustration style but with
warmer color tones (#D97706 amber, #059669 green) and more rounded shapes"
```

---

## Quality Control Checklist

After generating a batch, verify:

- [ ] All images use the same color palette (no rogue colors)
- [ ] Style is consistent (all flat OR all 3D, not mixed)
- [ ] Lighting direction is consistent across all images
- [ ] Detail level is consistent (no mix of simple and complex)
- [ ] Subject framing is consistent (all medium shots OR all wide, etc.)
- [ ] Outlines/strokes are same weight across all images
- [ ] Background treatment is consistent
- [ ] Overall mood/energy is consistent

### If One Image Doesn't Match

Don't regenerate the whole batch. Regenerate just the outlier with the same prefix. Nano Banana 2 is fast — iterate on individual images.

---

## Cost Management

Batch generation costs add up. Be strategic:

| Scenario | Images | Strategy |
|----------|--------|----------|
| Feature grid | 3-6 | Generate all at once, expect 80% usable |
| Hero + details | 4 | Generate hero first, lock style, then details |
| Social campaign | 6-8 | Generate in pairs, review between batches |
| Moodboard | 6 | 3 directions x 2 each, then refine winner |

**Rule of thumb:** Ask before generating more than 6 images in a single batch.
