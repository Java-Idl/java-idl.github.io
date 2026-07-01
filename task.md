## Design Context

### Users
A broad, self-selecting audience — anyone who stumbles on the link, from fellow security researchers and CTF players who will recognize the tools, to developers, recruiters, and general curious visitors. The experience should work for technical users who expect depth and casual visitors who may know nothing about cybersecurity. Nobody should feel lost; the interface itself should intrigue them into exploring.

### Brand Personality
**Curious · Experimental · Minimal**

The site belongs to a CS + Cybersecurity undergraduate who builds things to understand them deeply — not to impress, but to explore. The voice is quiet confidence: no shouting, no portfolio-template boilerplate. It should feel like you discovered something you were not supposed to find, and yet everything is clearly intentional.

Emotional target on landing: **Curious** — mysterious, draws you in to explore.
Anti-reference: Generic resume/portfolio template sites (Wix, Squarespace style).

### Aesthetic Direction
- **Palette:** Deep charcoal (`oklch ~6%`) + gold accent (`oklch 78% / hue 76`) — warm, not cold. Confirmed and should be preserved as-is.
- **Reference:** Owner's own projects (Encrypt Tool, Zero Bin) already have the right vibe — terminal-adjacent, security-themed, utilitarian but polished.
- **Anti-reference:** No agency over-design, no childish gamification, no bright generic resume-site aesthetics.
- **Typography:** `Audiowide` for labels/headings (technical, clinical, exact) + `Space Grotesk` for body (readable, modern). Established and intentional.
- **Theme:** Dark mode only. The grid background, glowing gold nodes, and charcoal surfaces form a coherent system — do not break it.
- **Tone:** Understated. No loud effects. The 3D sphere is the centrepiece; everything else should recede and serve it.

### Design Principles

1. **Curiosity over disclosure.** Do not explain everything upfront. Let the 3D sphere invite interaction. Reveal information progressively — the orbit makes you want to click.

2. **Precision in every pixel.** Technical users will notice loose spacing, misaligned borders, and inconsistent sizing. Every detail should feel deliberate. Uniform use of `cubic-bezier(0.16, 1, 0.3, 1)` transitions, consistent border tokens, WCAG AA minimums — these are non-negotiable.

3. **Gold is sacred.** The accent color (`--accent`) is the only warm value in a cold, dark palette. Use it sparingly and consistently as the single signal for interactivity, active state, and brand identity. Never dilute it with additional accent colors.

4. **Serve the sphere.** All panels, overlays, and UI chrome are secondary to the 3D interactive sphere. They should open without covering it unnecessarily, animate without distracting, and close cleanly to return focus to the centrepiece.

5. **Accessibility without compromise.** WCAG AA contrast is a floor, not a ceiling. Keyboard nav, ARIA live regions, `aria-pressed` states, minimum 44px tap targets, and `prefers-reduced-motion` support are already in place and must be preserved in every future change.

---

## Design Tokens Reference

All tokens are defined in the `:root` block of `styles.css`. Use only these tokens — never introduce raw literal values for colours, easing, or fonts.

### Surfaces

| Token | Value | Use |
|---|---|---|
| `--background` | `oklch(6% 0.008 76)` | Page background, header fallback bg |
| `--foreground` | `oklch(96% 0.008 76)` | Primary text, active borders |
| `--surface` | `oklch(9% 0.01 76)` | Card / node / panel surface |
| `--border` | `oklch(18% 0.02 76)` | Dividers, default borders |
| `--muted` | `oklch(70% 0.02 76)` | Secondary text, placeholder text |
| `--danger` | `oklch(62% 0.22 25)` | Error states |
| `--panel-bg` | `oklch(8% 0.009 76)` | Side panel content area |
| `--input-bg` | `oklch(5% 0.008 76)` | Input fields, hover background |
| `--code-bg` | `oklch(10% 0.01 76)` | Code blocks |

### Accent (Gold)

> Gold is sacred. Use exclusively for interactivity, active state, and brand identity.

| Token | Value | Use |
|---|---|---|
| `--accent` | `oklch(78% 0.15 76)` | Interactive highlight, active fill |
| `--accent-foreground` | `oklch(11% 0.03 76)` | Text on gold backgrounds |
| `--accent-subtle` | `oklch(78% 0.15 76 / 0.16)` | Canvas connection lines |
| `--accent-focus` | `oklch(78% 0.15 76 / 0.40)` | Focus-visible outline colour |
| `--grid-color` | `oklch(78% 0.15 76 / 0.055)` | Background grid lines |

### Glow Shadows

| Token | Value | Use |
|---|---|---|
| `--accent-glow-sm` | `0 0 8px oklch(78% 0.15 76 / 0.20)` | Search input focus shadow |
| `--accent-glow-md` | `0 0 10px oklch(78% 0.15 76 / 0.18)` | List-item hover glow |
| `--accent-glow-lg` | `0 0 10px oklch(78% 0.15 76 / 0.20)` | Chip / nav button hover glow |
| `--accent-glow-xl` | `0 0 10px oklch(78% 0.15 76 / 0.25)` | Node-link active/hover glow |

### Easing & Timing

| Token | Value | Use |
|---|---|---|
| `--ease-spring` | `cubic-bezier(0.16, 1, 0.3, 1)` | All transitions and animations |
| `--duration-fast` | `0.15s` | Node-link hover transitions |
| `--duration-base` | `0.18s` | Chip, panel-btn, list-item transitions |
| `--duration-slow` | `0.22s` | Scene opacity transitions |

### Typography

| Token | Value | Use |
|---|---|---|
| `--font-display` | `"Audiowide", system-ui, sans-serif` | Headings, labels, buttons, chips |
| `--font-body` | `"Space Grotesk", system-ui, sans-serif` | Body text, node links, list items |
