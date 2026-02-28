---
name: nano-banana-image
description: |
  God-tier image generation powered by Nano Banana 2 (Gemini 3 Pro Image via OpenRouter).
  Produces cinematic, photorealistic, and stylized images by treating prompts like a cinematographer's
  shot sheet — specifying subject, action, composition, environment, lighting, style, and technical gloss.
  Use for hero images, social graphics, illustrations, product shots, OG images, and brand visuals.
metadata:
  author: sixty-ai
  version: "1"
  category: frontend
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/hero-image"
    description: "Generate god-tier images with Nano Banana 2"
    icon: "camera"
  agent_affinity:
    - frontend
    - design
    - landing
    - outreach
  requires_capabilities:
    - openrouter_api
  triggers:
    - pattern: "hero image"
      intent: "hero_image"
      confidence: 0.95
      examples:
        - "generate a hero image"
        - "create a hero image for the landing page"
        - "hero section image"
    - pattern: "nano banana"
      intent: "nano_banana"
      confidence: 0.95
      examples:
        - "use nano banana"
        - "generate with nano banana"
        - "nano banana image"
    - pattern: "generate image"
      intent: "generate_image"
      confidence: 0.90
      examples:
        - "generate an image for"
        - "create an image of"
        - "make me an image"
    - pattern: "product shot"
      intent: "product_shot"
      confidence: 0.88
      examples:
        - "product photography"
        - "create a product shot"
        - "studio product image"
    - pattern: "social media graphic"
      intent: "social_graphic"
      confidence: 0.88
      examples:
        - "social media image"
        - "create an Instagram graphic"
        - "LinkedIn banner image"
    - pattern: "OG image"
      intent: "og_image"
      confidence: 0.90
      examples:
        - "generate an OG image"
        - "open graph image"
        - "social share image"
    - pattern: "illustration"
      intent: "illustration"
      confidence: 0.85
      examples:
        - "create an illustration"
        - "generate an illustration of"
        - "flat illustration"
    - pattern: "AI image"
      intent: "ai_image"
      confidence: 0.88
      examples:
        - "generate an AI image"
        - "AI-generated image"
        - "create with AI"
  keywords:
    - "image"
    - "hero"
    - "photo"
    - "illustration"
    - "generate"
    - "nano banana"
    - "product shot"
    - "social media"
    - "OG image"
    - "graphic"
    - "cinematic"
    - "photorealistic"
    - "render"
    - "3D"
    - "visual"
  inputs:
    - name: subject
      type: string
      description: "What to generate — the subject, scene, or concept"
      required: true
    - name: style
      type: string
      description: "Visual style: photorealistic, illustration, 3d-render, abstract, cinematic"
      required: false
    - name: aspect_ratio
      type: string
      description: "Aspect ratio: square, portrait, landscape"
      required: false
      default: "landscape"
    - name: brand_colors
      type: array
      description: "Array of hex color codes to incorporate (e.g. ['#8129D7', '#2A5EDB'])"
      required: false
    - name: mood
      type: string
      description: "Emotional tone: professional, bold, warm, dark, playful, elegant"
      required: false
    - name: num_images
      type: number
      description: "Number of images to generate (1-4)"
      required: false
      default: 1
  outputs:
    - name: images
      type: array
      description: "Generated image URLs or base64 data URIs"
    - name: prompt_used
      type: string
      description: "The exact prompt sent to the model — useful for iteration"
  priority: high
  tags:
    - "image"
    - "hero"
    - "nano banana"
    - "photorealistic"
    - "illustration"
    - "social media"
    - "landing page"
    - "brand"
    - "cinematic"
---

# Nano Banana Image Generator

God-tier image generation powered by Nano Banana 2 (Gemini 3 Pro Image via OpenRouter). Stop thinking of prompts as search bars — think cinematographer, lighting director, and lead illustrator.

**The difference between average and god-tier:** Vague concepts yield average results. Extreme specificity — especially regarding lighting, composition, and technical camera details — yields masterpieces.

---

## ROUTE DETECTION

| Scenario | Entry Point |
|----------|-------------|
| Quick single image, user knows what they want | **Express** — 1 image, fast |
| Hero image for landing page with brand alignment | **Hero** — landscape, style-matched |
| Batch of consistent images (blog, social, features) | **Batch** — shared style prefix |
| User exploring styles, no clear direction | **Moodboard** — 3 directions, 2 each |
| Refining/iterating on a previous generation | **Iterate** — tweak one layer |

---

## THE 7-LAYER PROMPT FRAMEWORK

**Read `references/prompt-framework.md` for the complete deep dive.**

Every god-tier prompt covers seven layers, separated by commas for readability:

| Layer | What to Include | Example |
|-------|----------------|---------|
| **1. Subject** | Hyper-specific. What are they/it? What are they doing? What are they wearing? Expression? | "A stoic elderly female cyberpunk hacker, wearing illuminated LED glasses, weathered chrome cybernetic arms, black tech-wear hoodie with data-stream patterns" |
| **2. Action/Pose** | Precise dynamic or position | "leaning forward, fingers hovering over a translucent, glowing blue holographic keyboard" |
| **3. Composition** | Camera angle, framing, depth | "Dramatic low-angle shot, three-quarter view, shallow depth of field (bokeh effect)" |
| **4. Environment** | Setting, surroundings, context | "in a cramped, rain-slicked Neo-Tokyo alleyway apartment at night, surrounded by discarded tech and exposed wiring" |
| **5. Lighting** | Light sources, types, mood — THE MOST IMPORTANT LAYER | "Lit by harsh, fractured light of an adjacent neon sign (cyan and magenta hues), diffused by light rainfall. Volumetric fog catches the light beams" |
| **6. Style/Medium** | What visual look you're achieving | "Hyper-realistic photography, cinematic still" |
| **7. Technical Gloss** | Camera/lens details that push fidelity | "Shot on 35mm lens (f/1.8 aperture), slight film grain, highly detailed textures, masterpiece, 4K" |

### The Quality Ladder

**Level 1 — Basic (vague, poor results):**
```
A futuristic woman.
```

**Level 2 — Advanced (descriptive, decent results):**
```
A futuristic cyberpunk woman, with cybernetic arms, standing in a city, neon lighting.
```

**Level 3 — God Tier (technical director, masterpiece):**
```
A professional, photorealistic cinematic still of a futuristic cyberpunk woman,
standing in a rain-slicked Neo-Tokyo alley at night. She has hyper-detailed
weathered chrome cybernetic arms, wearing a technical fabric tech-wear jacket
with glowing blue accents. Her gaze is distant and thoughtful. Dramatic low-angle
shot, three-quarter view. The atmosphere is moody and humid. Lighting: diffused
cyan and magenta neon sign lighting from the left, backlighting her profile,
mixed with the warm glow of a distant street lamp. Volumetric fog catches the
light. Textures are incredibly detailed: visible circuitry on her arm, rain
droplets on her jacket. Shot on a 35mm lens, f/2.8, slight film grain, 4K.
```

---

## PROMPT CONSTRUCTION

**Read `references/prompt-templates.md` for copy-paste templates by use case.**

### Building the Prompt

Always start with subject, then add layers:

```typescript
function buildGodTierPrompt(layers: {
  subject: string;
  action?: string;
  composition?: string;
  environment?: string;
  lighting: string;       // NEVER skip this
  style: string;
  technicalGloss?: string;
  brandColors?: string[];
}): string {
  const parts = [layers.subject];
  if (layers.action) parts.push(layers.action);
  if (layers.composition) parts.push(layers.composition);
  if (layers.environment) parts.push(layers.environment);
  parts.push(layers.lighting);  // Always include
  parts.push(layers.style);
  if (layers.technicalGloss) parts.push(layers.technicalGloss);
  if (layers.brandColors?.length) {
    parts.push(`Color palette: ${layers.brandColors.join(', ')}`);
  }
  // Always append the safety suffix
  parts.push('Clean, high-end SaaS aesthetic. No text, no watermarks, no logos.');
  return parts.join('. ');
}
```

### Critical Rules

1. **Positive descriptors only.** Say what IS in the scene, not what isn't. Instead of "no cars", say "an empty street."
2. **Lighting is the #1 lever.** Changing lighting transforms the entire image more than any other layer.
3. **Be specific about textures.** "visible circuitry", "rain droplets on jacket", "brushed metal finish" — texture details push fidelity.
4. **Lock the auto-suffix.** Always append: `"Clean, high-end SaaS aesthetic. No text, no watermarks, no logos."`
5. **Include brand hex codes.** When brand colors matter, specify them explicitly with usage instructions.

---

## API REFERENCE

### Frontend Service

```typescript
import { nanoBananaService } from '@/lib/services/nanoBananaService';

// Single image
const result = await nanoBananaService.generateImage({
  prompt: string,                                      // Required — the god-tier prompt
  aspect_ratio?: 'square' | 'portrait' | 'landscape',  // Default: 'square'
  num_images?: number,                                  // Number of variations
});

// Batch generation (parallel)
const results = await nanoBananaService.generateBatch([
  { prompt: "...", aspect_ratio: 'landscape' },
  { prompt: "...", aspect_ratio: 'square' },
]);
```

### Return Type

```typescript
interface NanoBananaImageGenerationResult {
  images?: string[];     // Array of image URLs or base64 data URIs
  error?: string;        // Error message if failed
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}
```

### Model Details

| Field | Value |
|-------|-------|
| Model | `google/gemini-3-pro-image-preview` |
| Provider | OpenRouter |
| Auth | `user_settings.ai_provider_keys.openrouter` |
| Output | Base64 data URIs or hosted URLs |
| Speed | Fast (Flash architecture) — iterate quickly |

### Aspect Ratio Guide

| Ratio | Dimensions | Use For |
|-------|-----------|---------|
| `landscape` | Wide | Hero sections, blog headers, OG images, presentation slides |
| `square` | 1:1 | Social posts, profile images, app icons, thumbnails |
| `portrait` | Tall | Mobile heroes, stories, email headers, Pinterest |

---

## LIGHTING PLAYBOOK

**Read `references/lighting-playbook.md` for the complete guide.**

Lighting is the single most impactful prompt layer. Quick reference:

| Mood | Lighting Description |
|------|---------------------|
| **Professional / Clean** | "Soft diffused overhead lighting, even illumination, subtle shadows, studio quality" |
| **Bold / Editorial** | "Dramatic side lighting from the left, strong shadows, high contrast, editorial style" |
| **Warm / Approachable** | "Warm golden hour lighting from behind, soft lens flare, inviting atmosphere" |
| **Tech / Futuristic** | "Cool blue rim lighting, neon accent glow, dark environment with light bloom effects" |
| **Elegant / Luxury** | "Soft gradient lighting from above, subtle specular highlights, rich tonal depth" |
| **Energetic / Startup** | "Bright, even daylight, vibrant colors fully saturated, clean white backdrop" |
| **Moody / Atmospheric** | "Low-key lighting, volumetric fog catching single light beam, dramatic chiaroscuro" |

---

## STYLE CONSISTENCY

**Read `references/batch-consistency.md` for the complete methodology.**

When generating multiple images that must look cohesive:

### 1. Shared Style Prefix

Create a prefix that starts every prompt in the batch:

```
PREFIX: "Flat vector illustration in modern SaaS style, soft gradients,
rounded shapes, palette #8129D7 violet and #2A5EDB blue on white,
clean minimal composition, soft top-left lighting"

Image 1: [PREFIX] + ", showing a team collaborating on a video call"
Image 2: [PREFIX] + ", showing analytics dashboard with rising charts"
Image 3: [PREFIX] + ", showing an AI assistant reviewing a document"
```

### 2. Lock These Across the Batch

- Color palette (exact hex codes)
- Style descriptor (flat illustration / 3D render / etc.)
- Lighting direction and quality
- Composition rules (centered / rule-of-thirds / etc.)
- Subject framing distance

### 3. Vary These Per Image

- Subject matter
- Minor composition shifts (centered vs. off-center)
- Detail level (wide vs. close-up)

---

## ERROR HANDLING

| Error | Cause | Fix |
|-------|-------|-----|
| "OpenRouter API key not configured" | No key in user_settings | Direct user to Settings > AI Provider Settings |
| Empty `images` array | Unexpected response format | Check `window.__nanobanana_last_response` in console, retry |
| Rate limit (429) | Too many requests | Wait 30s, retry. Reduce batch size. |
| Content filtered | Safety filter triggered | Rephrase — use positive descriptors, remove potentially problematic terms |
| Blurry/low-quality output | Prompt too vague | Add technical gloss layer: lens, aperture, "highly detailed", "4K" |

---

## ITERATION STRATEGY

Nano Banana 2 is FAST (Flash architecture). Iterate aggressively:

1. **First attempt:** Full 7-layer prompt, see what comes back
2. **If composition is wrong:** Change only Layer 3 (camera angle, framing)
3. **If mood is wrong:** Change only Layer 5 (lighting) — biggest single lever
4. **If style is wrong:** Change only Layer 6 (medium/style)
5. **If close but not quite:** Add technical gloss details (lens, film grain, texture specifics)

**The Pro Trick:** Once you get a good result, save the exact prompt. It becomes a reusable template.

---

## REFERENCE FILES

| File | Contents |
|------|----------|
| `references/prompt-framework.md` | The 7-layer framework deep dive with examples for every layer |
| `references/prompt-templates.md` | Copy-paste god-tier templates for hero, social, product, abstract, isometric |
| `references/lighting-playbook.md` | Complete lighting reference: 12 moods, technical descriptions, mixing techniques |
| `references/batch-consistency.md` | Style locking, shared prefixes, variation strategies for cohesive batches |
