# The 7-Layer Prompt Framework — Deep Dive

How to construct prompts that make Nano Banana 2 produce masterpiece-quality images. Each layer stacks on the previous one. Skip a layer and quality drops.

---

## Layer 1: Subject — Hyper-Specificity

The subject is NOT just "a person" or "a dashboard." It's every visual detail that defines what we're looking at.

### People

```
WEAK: "a business person"
GOD TIER: "a confident woman in her 30s, sharp tailored navy blazer over a cream turtleneck,
minimal gold earrings, hair pulled back in a low bun, slight knowing smile,
looking directly at camera"
```

### Objects

```
WEAK: "a laptop"
GOD TIER: "a Space Gray MacBook Pro with lid at 120 degrees, screen showing a dark-themed
analytics dashboard with glowing data visualizations, visible keyboard illumination,
a single AirPod placed beside it on the desk"
```

### Scenes

```
WEAK: "an office"
GOD TIER: "a minimalist corner office in a glass-walled modern building, white standing desk
with a single monitor, a small succulent plant in a concrete pot, floor-to-ceiling
windows revealing a cityscape at golden hour, Eames lounge chair in the corner"
```

### Abstract Concepts

```
WEAK: "growth"
GOD TIER: "an abstract visualization of exponential growth — a luminous curve made of
thousands of tiny light particles, rising from left to right with acceleration,
particles at the base dense and warm-toned, particles at the peak sparse and
electric blue, trailing energy wisps behind the curve"
```

---

## Layer 2: Action/Pose — Dynamic Energy

Static subjects feel lifeless. Even subtle motion cues make images dynamic.

### Action Vocabulary

| Energy Level | Examples |
|-------------|----------|
| **Static/Composed** | "standing upright, hands clasped", "seated at desk, writing" |
| **Subtle Motion** | "leaning forward slightly", "mid-gesture, hand raised", "turning to look over shoulder" |
| **Dynamic** | "walking briskly through corridor", "reaching for a document", "typing rapidly" |
| **High Energy** | "jumping with arms raised", "pointing decisively at whiteboard", "laughing mid-conversation" |

### For Non-Human Subjects

```
"dashboard floating at a slight angle, as if someone just rotated it"
"coffee cup with steam rising in a gentle spiral"
"paper documents scattered as if a breeze just passed through"
```

---

## Layer 3: Composition — The Camera's Eye

Think like a cinematographer. Where is the camera? What's in focus?

### Camera Angles

| Angle | Effect | Use For |
|-------|--------|---------|
| **Eye level** | Neutral, conversational | Professional headshots, product shots |
| **Low angle** | Power, authority, drama | Hero images, aspirational content |
| **High angle** | Vulnerability, overview | Workspace shots, flat lays |
| **Bird's eye** | Abstract, architectural | Layout showcases, desk arrangements |
| **Dutch tilt** | Tension, energy | Startup/disruptive brand imagery |

### Framing

| Frame | Description | Use For |
|-------|-------------|---------|
| **Wide shot** | Full scene, lots of environment | Hero sections, establishing mood |
| **Medium shot** | Subject + some environment | Team photos, workspace shots |
| **Close-up** | Subject fills frame | Product details, facial expressions |
| **Extreme close-up** | Single detail | Texture showcases, micro-interactions |
| **Over-the-shoulder** | Looking past one subject to another | Collaboration scenes |

### Depth of Field

```
"shallow depth of field, f/1.8, subject sharp with creamy bokeh background"
"deep focus, everything sharp from foreground to background, f/11"
"tilt-shift effect, miniature-like selective focus"
```

---

## Layer 4: Environment/Setting — World Building

The environment tells a story. Be specific about every element.

### Indoor Environments

```
WEAK: "in an office"
GOD TIER: "in a sunlit, open-plan loft office with exposed brick walls,
polished concrete floors, mid-century modern furniture,
a whiteboard covered in colorful sticky notes visible in the background,
large potted monstera plant in the corner"
```

### Outdoor Environments

```
"on a rooftop terrace overlooking downtown Manhattan at dusk,
string lights overhead, modern outdoor furniture,
city lights beginning to twinkle in the background"
```

### Abstract/Conceptual Environments

```
"floating in a gradient void that shifts from deep navy at the base
to electric violet at the top, with subtle geometric patterns
dissolving in and out of visibility in the background"
```

---

## Layer 5: Lighting & Atmosphere — THE MOST IMPORTANT LAYER

Lighting is the single biggest lever for image quality. Changing lighting transforms everything.

### Natural Light

| Type | Description | Mood |
|------|-------------|------|
| **Golden hour** | "warm golden light streaming from the right at 15-degree angle, long soft shadows" | Warm, aspirational, hopeful |
| **Blue hour** | "cool blue ambient light, pre-dawn, soft and even, no harsh shadows" | Calm, reflective, serene |
| **Overcast** | "even, diffused daylight from cloud cover, no shadows, flat lighting" | Neutral, documentary |
| **Direct sun** | "harsh midday sun from above, strong shadows, high contrast" | Bold, honest, stark |

### Studio Light

| Setup | Description | Use For |
|-------|-------------|---------|
| **Key + fill** | "main soft light from upper left at 45 degrees, gentle fill from right reducing shadows to 30%" | Professional headshots |
| **Rim light** | "bright edge light from behind, separating subject from dark background" | Product shots, dramatic portraits |
| **Beauty dish** | "large, soft, even front-facing light source, minimal shadows, flattering skin tones" | Close-ups, beauty shots |
| **Practical light** | "lit only by the laptop screen glow and a desk lamp" | Authentic, atmospheric |

### Atmospheric Effects

```
"volumetric light beams streaming through blinds"
"light fog diffusing all light sources into soft halos"
"lens flare from a bright source just outside frame"
"light rain adding subtle reflections on every surface"
"bokeh circles from city lights in the background"
```

### Color Temperature Mixing

The pro technique — mix warm and cool light sources:

```
"Key light: warm tungsten (3200K) desk lamp from the left.
Fill light: cool blue (6500K) monitor glow from the front.
Accent: neon pink from a sign reflected in the window behind."
```

---

## Layer 6: Visual Style/Medium

Define the artistic approach. Be specific.

### Photography Styles

```
"Hyper-realistic photography, cinematic still"
"Editorial fashion photography, high-end magazine quality"
"Documentary photography, candid and authentic"
"Product photography, studio white backdrop, commercial quality"
"Street photography, urban, grain, natural light"
```

### Illustration Styles

```
"Flat vector illustration, bold shapes, limited color palette"
"Isometric 3D illustration, clean edges, soft shadows"
"Watercolor illustration, loose brushwork, transparent washes"
"Line art illustration, single-weight stroke, minimal color fills"
"Paper cut-out style, layered depth, subtle shadows between layers"
```

### 3D/CGI Styles

```
"3D render, glass morphism, soft reflections, floating elements"
"Clay render, matte pastel materials, rounded shapes, no textures"
"Low-poly 3D, geometric facets, gradient coloring"
"Photorealistic 3D, subsurface scattering, volumetric lighting"
```

---

## Layer 7: Technical Gloss — The Secret Weapon

Camera and lens details push the model to produce higher-fidelity output. Even for illustrations, these terms influence quality.

### Photography Technical Gloss

```
"Shot on 35mm lens, f/1.8 aperture, slight film grain"
"Shot on 85mm portrait lens, f/2.8, natural skin tones"
"Shot on 24mm wide angle, f/8, deep focus, architectural perspective"
"Medium format Hasselblad, incredibly sharp, creamy transitions"
"Leica M10, rangefinder style, classic film rendering"
```

### Quality Boosters

These terms consistently improve output quality:

```
"highly detailed textures"
"masterpiece quality"
"4K resolution"
"award-winning photography"
"professionally color graded"
"precise focus"
"rich tonal depth"
```

### For Illustrations

Even illustration prompts benefit from technical terms:

```
"high-resolution vector artwork"
"print-ready quality"
"Pantone-accurate colors"
"pixel-perfect edges"
"professionally crafted"
```

---

## Layer Interaction Rules

1. **Lighting and Environment must agree.** Don't describe "golden hour lighting" in an "underground bunker."
2. **Style and Technical Gloss must agree.** Don't add "f/1.8 aperture" to a "flat vector illustration."
3. **Subject detail should match framing.** Close-up = more subject detail. Wide shot = more environment detail.
4. **Color palette overrides ambient color.** If you specify brand hex codes, they take priority over the lighting's natural color cast.
5. **Positive only.** Never say "no text" — say "clean, uncluttered." Never say "not blurry" — say "sharp focus, highly detailed."
