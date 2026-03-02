# SVG Interactivity Patterns

CSS-only and minimal-JS patterns for making SVGs respond to user input. All patterns are self-contained within the SVG file.

---

## CSS-Only Patterns (No JavaScript)

### Hover State Transitions

The most common and safest interactivity. Uses `:hover` on SVG groups.

```css
/* Inside <style> block in SVG */

/* Base state */
.box-lid {
  transform-origin: 50% 0%;  /* Hinge at top edge */
  transform: rotateX(0deg);
  transition: transform 400ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

/* Hover state */
.box-group:hover .box-lid {
  transform: rotateX(-120deg);
}

/* Contents float up on hover */
.box-contents {
  transform: translateY(0);
  opacity: 0;
  transition: transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms,
              opacity 300ms ease-out 200ms;
}

.box-group:hover .box-contents {
  transform: translateY(-30px);
  opacity: 1;
}
```

**Key principles:**
- Use `transition` (not `@keyframes`) for hover — it auto-reverses
- Add `transition-delay` for choreographed sequences
- Set `transform-origin` for rotation hinges
- Apply `will-change` on elements that transition

### Staggered Hover Reveal

Multiple elements appear sequentially on hover:

```css
.card:hover .item:nth-child(1) { opacity: 1; transform: translateY(0); transition-delay: 0ms; }
.card:hover .item:nth-child(2) { opacity: 1; transform: translateY(0); transition-delay: 80ms; }
.card:hover .item:nth-child(3) { opacity: 1; transform: translateY(0); transition-delay: 160ms; }
.card:hover .item:nth-child(4) { opacity: 1; transform: translateY(0); transition-delay: 240ms; }

.item {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 300ms cubic-bezier(0.22, 1, 0.36, 1),
              transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
}
```

### CSS Checkbox Toggle (`:checked`)

Creates a toggle button within the SVG using a hidden checkbox:

```xml
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
  <style>
    #toggle { display: none; }

    .trigger-label {
      cursor: pointer;
      fill: #2563EB;
      transition: fill 200ms ease;
    }
    .trigger-label:hover { fill: #1D4ED8; }

    /* Default state */
    .rocket {
      transform: translateY(0);
      transition: transform 1.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .flame {
      opacity: 0;
      transform: scaleY(0);
      transform-origin: 50% 0%;
      transition: opacity 200ms ease, transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* Activated state */
    #toggle:checked ~ .scene .rocket {
      transform: translateY(-250px);
    }
    #toggle:checked ~ .scene .flame {
      opacity: 1;
      transform: scaleY(1);
    }
  </style>

  <input type="checkbox" id="toggle" />

  <g class="scene">
    <g class="rocket">
      <!-- rocket shapes -->
      <g class="flame">
        <!-- flame shapes -->
      </g>
    </g>
  </g>

  <!-- Trigger button -->
  <label for="toggle">
    <rect class="trigger-label" x="150" y="260" width="100" height="30" rx="6" />
    <text x="200" y="280" text-anchor="middle" fill="white" font-size="12">Launch</text>
  </label>
</svg>
```

### Focus-Within

Respond to focus events on embedded form elements:

```css
.input-group:focus-within .label {
  transform: translateY(-20px) scale(0.85);
  fill: #2563EB;
  transition: all 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.input-group:focus-within .border {
  stroke: #2563EB;
  stroke-width: 2;
}

.input-group:focus-within .glow {
  opacity: 0.15;
  transform: scale(1.05);
}
```

---

## Minimal JavaScript Patterns

For interactions that CSS can't handle alone. Keep JS under 20 lines.

### Cursor Tracking (Eye Follow)

```xml
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <style>
    .eye-iris {
      transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1);
      will-change: transform;
    }
    @media (prefers-reduced-motion: reduce) {
      .eye-iris { transition: none; }
    }
  </style>

  <!-- Eye whites -->
  <circle cx="70" cy="100" r="20" fill="white" stroke="#333" stroke-width="2"/>
  <circle cx="130" cy="100" r="20" fill="white" stroke="#333" stroke-width="2"/>

  <!-- Irises (will be moved by JS) -->
  <circle class="eye-iris" id="left-iris" cx="70" cy="100" r="8" fill="#333"/>
  <circle class="eye-iris" id="right-iris" cx="130" cy="100" r="8" fill="#333"/>

  <script>
    const svg = document.querySelector('svg');
    const leftIris = document.getElementById('left-iris');
    const rightIris = document.getElementById('right-iris');
    const maxTravel = 6; // pixels

    let targetX = 0, targetY = 0, currentX = 0, currentY = 0;

    svg.addEventListener('mousemove', (e) => {
      const rect = svg.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width * 200;
      const my = (e.clientY - rect.top) / rect.height * 200;

      [['left-iris', 70, 100], ['right-iris', 130, 100]].forEach(([id, cx, cy]) => {
        const el = document.getElementById(id);
        const angle = Math.atan2(my - cy, mx - cx);
        const dist = Math.min(maxTravel, Math.hypot(mx - cx, my - cy) * 0.05);
        el.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
      });
    });

    svg.addEventListener('mouseleave', () => {
      leftIris.style.transform = 'translate(0, 0)';
      rightIris.style.transform = 'translate(0, 0)';
    });
  </script>
</svg>
```

### Click Counter / State Machine

```xml
<script>
  let state = 0;
  const states = ['idle', 'active', 'complete'];
  const scene = document.querySelector('.scene');

  document.getElementById('trigger').addEventListener('click', () => {
    scene.classList.remove(states[state]);
    state = (state + 1) % states.length;
    scene.classList.add(states[state]);
  });
</script>
```

Then use CSS classes to define each state's appearance.

### Scroll-Linked Progress (When Embedded in Page)

```javascript
// Only works when SVG is inline in the page (not as <img>)
const progressBar = document.getElementById('progress');
window.addEventListener('scroll', () => {
  const scrollPct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
  progressBar.setAttribute('width', scrollPct * 400);
}, { passive: true });
```

---

## Hover Exit Patterns

### Quick Exit, Slow Entrance

The universal feel-good pattern: animate in slowly, out quickly.

```css
.element {
  /* Exit timing (default state = what plays when hover ends) */
  transition: transform 200ms cubic-bezier(0.3, 0, 0.8, 0.15),
              opacity 150ms ease-in;
}

.group:hover .element {
  /* Entrance timing (overrides on hover) */
  transition: transform 400ms cubic-bezier(0.22, 1, 0.36, 1),
              opacity 300ms ease-out;
}
```

### Spring Return

Element overshoots on hover, settles back elastically on exit:

```css
.element {
  transform: translateY(0);
  transition: transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.group:hover .element {
  transform: translateY(-20px);
  transition: transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## Performance Rules for Interactive SVGs

1. **Always `will-change`** on elements that transition via hover/focus
2. **Remove `will-change`** via JS after one-shot animations complete
3. **Use `transition` for hover** (auto-reverses) — `@keyframes` for loops
4. **Debounce mousemove** with `requestAnimationFrame` or lerp factor
5. **Test with 4x CPU throttle** in Chrome DevTools
6. **`passive: true`** on all scroll event listeners
7. **Max 3 simultaneous transitions** per hover to avoid jank on mobile
