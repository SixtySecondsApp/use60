# Moodboard Workflow

Methodology for creating 3-direction moodboards that help users discover and lock their visual style before production.

---

## The 3-Direction Framework

Every moodboard presents **3 distinct style directions**. This gives the user real choices without overwhelming them.

### Direction A: Faithful Interpretation

The closest interpretation of what the user described. If they said "clean and minimal", this is clean and minimal.

- Directly maps their style signals to visual output
- Feels safe and expected
- Validates that you understood their intent

### Direction B: Bolder Take

Pushes the concept further — more dramatic, more distinctive, more ambitious.

- Amplifies the strongest element of their description
- Shows what's possible beyond their initial vision
- Often becomes the user's actual preference

### Direction C: Contrasting Alternative

Something the user didn't ask for but might love. A different visual angle on the same brief.

- Provides a genuine alternative, not just a variation
- Challenges assumptions about what "looks right"
- Sometimes unlocks a direction they hadn't considered

---

## Prompt Variation Strategy

Within each direction, generate **2 images** that vary along these axes while keeping the direction's core identity:

### What to Vary

| Axis | Image 1 | Image 2 |
|------|---------|---------|
| **Composition** | Centered, symmetrical | Off-center, dynamic |
| **Color temperature** | Cooler tones | Warmer tones |
| **Detail level** | Simplified, iconic | Rich, detailed |
| **Scale** | Wide/environmental | Close-up/intimate |

### What to Keep Consistent (within a direction)

- Core color palette
- Style descriptor (flat illustration, 3D render, etc.)
- Lighting quality
- Overall mood/feeling
- Subject matter

### Example Prompt Pairs

**Direction A: "Clean Corporate"**
```
Image 1: "A team of diverse professionals in a bright modern office,
flat vector illustration, soft blues #2563EB and grays #6B7280,
centered composition, soft overhead lighting, professional and approachable"

Image 2: "A close-up of hands collaborating on a digital tablet showing analytics,
flat vector illustration, soft blues #2563EB and grays #6B7280,
dynamic diagonal composition, soft overhead lighting, professional and approachable"
```

**Direction B: "Bold Tech"**
```
Image 1: "A futuristic command center with holographic displays showing data,
3D render with neon accents, deep purple #8129D7 and electric blue #2A5EDB
on dark background #09090b, wide cinematic composition, dramatic rim lighting"

Image 2: "Abstract data visualization flowing through a neural network,
3D render with neon accents, deep purple #8129D7 and electric blue #2A5EDB
on dark background #09090b, close-up detail view, dramatic rim lighting"
```

---

## Presentation Format

Present moodboard results in clear, labeled groups:

```
## Moodboard: [Project Name]

### Direction A: [Short Name]
> [1-line description of the style direction]

[Image 1] [Image 2]

### Direction B: [Short Name]
> [1-line description of the style direction]

[Image 1] [Image 2]

### Direction C: [Short Name]
> [1-line description of the style direction]

[Image 1] [Image 2]

---

**Which direction speaks to you?** You can:
- Pick one direction to develop further
- Blend elements ("A's color palette with B's composition style")
- Ask for more options in any direction
```

### Include Prompts (Optional)

For users who want control, include the prompt used for each image. This lets them understand and refine the prompt language themselves.

---

## Iteration Patterns

After the user responds, follow these patterns:

### "I like Direction A"
→ Lock Direction A's style parameters. Proceed to Phase 3 (First Assets).

### "I like A's style but B's colors"
→ Blend: take A's style descriptor and composition, replace palette with B's colors. Generate 2 new blended images for confirmation.

### "None of these are right"
→ Ask 2 targeted follow-up questions:
  - "What specifically feels off — the style, the colors, or the composition?"
  - "Can you share a link to something closer to what you envision?"
→ Generate 3 new directions based on updated signals.

### "Direction B but more [adjective]"
→ Adjust B's prompts to emphasize the requested quality. Generate 2 refinement images.

### "I like elements from all three"
→ Ask which specific elements: "Which palette? Which composition style? Which level of detail?"
→ Synthesize a new blended direction. Generate 2 images.

---

## Style Lock Document

Once a direction is selected, document the locked style for production use:

```
## Style Lock: [Project Name]

**Direction**: [Name] (based on Direction [A/B/C/blend])

**Palette**:
- Primary: #[hex] — [usage]
- Secondary: #[hex] — [usage]
- Accent: #[hex] — [usage]
- Background: #[hex]

**Style**: [e.g. "Flat vector illustration, soft gradients, rounded shapes, 2px consistent stroke"]

**Composition**: [e.g. "Centered subject, 30% negative space, landscape orientation"]

**Lighting**: [e.g. "Soft top-left diffused, subtle shadows"]

**Mood**: [1-2 words, e.g. "Professional warmth"]

**Prompt Prefix** (use for all production assets):
"[The locked prefix string that starts every prompt]"
```

This document becomes the reference for Phase 4 production.
