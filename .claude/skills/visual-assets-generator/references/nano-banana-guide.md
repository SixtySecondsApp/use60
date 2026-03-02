# Nano Banana 2 — Image Generation Guide

Reference for generating images using Nano Banana 2 (Google Gemini 3 Pro Image Preview) via OpenRouter.

---

## API Reference

| Field | Value |
|-------|-------|
| Service | `nanoBananaService` from `src/lib/services/nanoBananaService.ts` |
| Model | `google/gemini-3-pro-image-preview` |
| Provider | OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) |
| Auth | `user_settings.ai_provider_keys.openrouter` |
| Output | Base64 data URIs or hosted URLs |

### Method Signature

```typescript
import { nanoBananaService } from '@/lib/services/nanoBananaService';

const result = await nanoBananaService.generateImage({
  prompt: string,              // Required — the image description
  aspect_ratio?: 'square' | 'portrait' | 'landscape',  // Default: 'square'
  num_images?: number,         // Number of images to generate
});

// Returns:
// {
//   images?: string[],        // Array of image URLs or data URIs
//   error?: string,
//   usage?: { promptTokens, completionTokens, totalTokens }
// }
```

### Aspect Ratio Guidance

| Ratio | Use For |
|-------|---------|
| `square` | Social media posts, profile images, app icons, thumbnails |
| `portrait` | Mobile hero sections, stories, email headers, Pinterest |
| `landscape` | Website hero sections, blog headers, presentation slides, OG images |

---

## Prompt Best Practices

### Structure

Put the subject first, then style, then technical details:

```
[SUBJECT] in [STYLE], [COMPOSITION], [COLOR PALETTE], [LIGHTING], [MOOD]
```

### Subject Clarity

Be specific about what you want to see:

```
// WEAK
"a dashboard"

// STRONG
"a modern SaaS dashboard showing analytics charts and metrics, dark theme with glass morphism cards"
```

### Style Descriptors

Use specific art/design terms:

| Category | Examples |
|----------|----------|
| **Illustration** | flat illustration, isometric, line art, watercolor, vector art, paper cut |
| **Photography** | product photography, editorial, lifestyle, aerial view, macro |
| **3D** | 3D render, clay render, low-poly, voxel art, isometric 3D |
| **Abstract** | geometric, minimalist, gradient mesh, fluid art, generative |
| **Marketing** | professional, corporate, startup, SaaS, fintech, healthcare |

### Color Control

Include specific hex codes for brand consistency:

```
"...using a palette of #8129D7 violet, #2A5EDB blue, and #03AD9C teal on a #09090b dark background"
```

### Composition Guidance

Direct the framing:

```
"centered composition with ample negative space"
"rule of thirds, subject on the left"
"bird's eye view, flat lay arrangement"
"close-up detail shot with shallow depth of field"
```

### Lighting Direction

Specify lighting for mood:

```
"soft diffused lighting"          — clean, professional
"dramatic side lighting"          — bold, editorial
"warm golden hour lighting"       — approachable, friendly
"cool blue rim lighting"          — tech, futuristic
"studio lighting, white backdrop" — product photography
```

---

## Style Consistency Across Batches

When generating multiple images that need to look cohesive:

### 1. Shared Prefix

Use the same style prefix for every prompt in the batch:

```
PREFIX: "Flat vector illustration in a modern SaaS style, soft gradients,
rounded shapes, #8129D7 and #2A5EDB color palette on white background,
clean minimal composition"

Image 1: [PREFIX] + "showing a team collaborating on a video call"
Image 2: [PREFIX] + "showing an analytics dashboard with rising charts"
Image 3: [PREFIX] + "showing an AI assistant reviewing a document"
```

### 2. Anchor to Art Movements/Styles

Reference specific visual styles for consistency:

```
"in the style of Dropbox illustrations"
"geometric Bauhaus-inspired"
"Scandinavian minimalist design"
"Memphis design with bold shapes"
```

### 3. Include Lighting Direction

Keep lighting consistent across the batch:

```
"...with soft top-left lighting casting subtle shadows"
```

### 4. Lock Composition Rules

Keep framing consistent:

```
"...centered subject, 30% negative space on edges, no text"
```

---

## Common Prompt Templates

### Marketing / Landing Page Hero

```
A [SUBJECT DESCRIPTION] in a modern, professional style.
[STYLE: e.g. "3D render with glass morphism elements"].
Color palette: [HEX CODES].
[COMPOSITION: e.g. "wide landscape composition with the product centered"].
[LIGHTING: e.g. "soft ambient lighting with subtle purple glow"].
Clean, high-end SaaS aesthetic. No text or watermarks.
```

### Social Media Post

```
[SUBJECT DESCRIPTION] for a social media post.
[STYLE: e.g. "bold flat illustration with thick outlines"].
Square format, visually striking, designed to stop the scroll.
Color palette: [HEX CODES].
Simple composition, strong focal point, ample breathing room.
```

### Icon / Small Illustration

```
A simple [SUBJECT] icon in a [STYLE: e.g. "flat, minimal line art"] style.
Single color: [HEX CODE] on transparent background.
Clean geometry, consistent stroke width, no fine details.
Centered composition, square format.
```

### Abstract Background

```
Abstract [STYLE: e.g. "gradient mesh"] background.
Colors flowing from [COLOR 1] to [COLOR 2] with accents of [COLOR 3].
[COMPOSITION: e.g. "organic flowing shapes, subtle noise texture"].
Suitable as a website section background. No recognizable objects.
```

### Isometric / Technical Illustration

```
Isometric illustration of [SUBJECT: e.g. "a cloud infrastructure diagram"].
[STYLE: e.g. "clean vector isometric, soft shadows"].
Color palette: [HEX CODES].
Detailed but not cluttered, professional tech illustration style.
45-degree isometric projection, consistent line weight.
```

---

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| "OpenRouter API key not configured" | No key in user_settings | Direct user to Settings > AI Provider Settings |
| Empty `images` array | Model returned unexpected format | Check console for `__nanobanana_last_response`, retry |
| Rate limit (429) | Too many requests | Wait 30s, retry. Reduce batch size. |
| Content filtered | Prompt triggered safety filter | Rephrase prompt, remove potentially problematic terms |

---

## Cost Awareness

Nano Banana 2 uses OpenRouter pay-per-use pricing. Be mindful:

- **Moodboard** (6 images) — moderate cost, justified for style alignment
- **Production batch** — generate only what's needed, don't over-generate
- **Express route** (1 image) — minimal cost
- Always ask before generating more than 6 images in a single batch
