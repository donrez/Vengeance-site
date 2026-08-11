# Design Style Guide — Vengeance

Promo site for the Vengeance Minecraft client (Release 1.21.11). Reference
inspiration: vesence.fun (dark, single accent color, glow effects) — but with
its own identity: crimson instead of purple, sharper typography.

## Aesthetic Direction

**Dark, aggressive, gaming-neon.** Near-black plum background, a single
vengeful crimson accent with a cold violet secondary, soft radial glows,
subtle grid texture in the hero. Confident, menacing, premium — matches the
"take vengeance" brand of a private game client aimed at a young RU gaming
audience. Content language: Russian.

## Color Palette (`@theme` tokens in `src/client/index.css`)

| Token | Value | Usage |
|---|---|---|
| `void` | `#09060b` | page background |
| `abyss` | `#0e0a12` | alternating section bg, inputs |
| `surface` | `#161020` | cards / panels |
| `surface-2` | `#1f1730` | raised / hover surfaces |
| `edge` | `#2c2140` | borders |
| `edge-bright` | `#45325f` | hovered borders |
| `frost` | `#f2edf7` | primary text |
| `mist` | `#a99cbb` | secondary text |
| `dusk` | `#6f6284` | faint text |
| `blood` | `#e62e4d` | primary accent (CTA, brand highlight) |
| `blood-bright` | `#ff4d68` | accent hover / glowing text |
| `blood-deep` | `#a31333` | accent active |
| `blood-soft` | `#2b0f1c` | accent-tinted surface |
| `hex` / `hex-soft` | `#8b5cf6` / `#1d1433` | cold violet secondary (background glows only) |

Accent glow shadow convention: `shadow-[0_0_24px_rgba(230,46,77,0.35)]` on
primary CTAs; `drop-shadow-[0_0_28px_rgba(230,46,77,0.55)]` on brand text.

## Typography

- **Display / headings**: `Unbounded` (Google Fonts, Cyrillic support) —
  `--font-display`, applied to `h1–h3` and `.font-display`. Brand wordmark is
  `font-black tracking-widest`: `VENGE` in frost + `ANCE` in blood.
- **Body**: `Manrope` (Google Fonts, Cyrillic) — `--font-sans`, default body font.

## Spacing & Radius

- Radius: `rounded-panel` (1rem) for cards/sections, `rounded-ctrl` (0.5rem)
  for controls; pills (`rounded-full`) for badges.
- Sections: `py-24`, container `max-w-6xl mx-auto px-4 sm:px-6`. Fixed 16px
  (h-16) blurred nav (`bg-void/80 backdrop-blur-md border-b border-edge/60`).

## Motion & Animation

`@theme --animate-*` utilities in `index.css`:
- `animate-fade-up` / `animate-fade-in` — entrances.
- `.stagger` helper class — children fade-up with 0.1s cascading delays.
- `animate-glow-pulse` — pulsing accent glows / status dots.
- `animate-float` — gentle vertical float (video play button).
- Hover on cards: `hover:-translate-y-1` + crimson border + glow shadow,
  `transition-all duration-300`.

## Component library retune

- `ui/_shared/variants.ts` retuned for dark theme: `solid+primary` is the
  crimson CTA (with glow), `solid+neutral` is frost-on-void, outline/ghost/soft
  use edge/surface tokens. Card = `bg-surface border-edge rounded-panel`;
  Input = `bg-abyss border-edge` with blood focus ring.
- Auth pages (Login/Signup) and the shared `Page` header carry the wordmark
  and are fully themed; UI copy is Russian.
