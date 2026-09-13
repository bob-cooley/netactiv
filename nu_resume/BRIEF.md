# Resume site — project brief
**For:** Claude Code session in the netActiv project  
**Staging target:** `netactiv.com/nu_resume`  
**Final target:** `bobcooley.nyc`  
**Publish method:** GitHub push (project already has desktop access + GitHub integration)

---

## What this is

A personal resume and portfolio site for Bob Cooley — Communications Strategist / Digital Workplace Leader. It needs to visually operate at the same level of design sophistication as netactiv.com while carrying the professional content currently on bobcooley.nyc.

This is not a resume template. It is a designed experience. The medium is part of the message — the site needs to demonstrate, by existing, that Bob understands how digital environments should feel to the people who use them.

---

## Reference sites to study before building

Both are live and accessible:

- `netactiv.com` — primary visual/aesthetic reference. Dark canvas, interactive wireframe globe (three.js or similar), fine-line latitude/longitude grid, luminous data points in teal/gold/purple. Restrained but technically sophisticated. Study the globe implementation, color palette, typography, and motion behavior.
- `bobcooley.nyc` — content reference only. Has the resume text, metrics, contact info, nav structure, and photo. The design here is a generation behind — do not replicate it. Extract content only.

Also reference:
- `defunkt.com/games/` — for the settings gear pattern (top-right corner, dark rounded panel dropdown on click, labeled sections with controls inside). This exact pattern gets used for the dev/testing dropdown described below.

---

## Site structure

Single-page app. No page navigation. Everything happens in one view.

### Layout (desktop)

```
[ header: logo + name + gear icon (top right)     ]
[                                                   ]
[ left rail nav  |  hero / content area (right)    ]
[ (floating,     |                                  ]
[  vertical)     |  globe OR content panel          ]
[                |                                  ]
```

- Left rail: floating vertical navigation. Links trigger content panel swaps. Does not scroll with page.
- Right area (majority of viewport): default state is the animated globe hero. On nav click, globe transitions out and a content panel transitions in.
- Header: minimal. Logo/name top left. Gear icon top right (see dev tools below).

### Navigation items (left rail)

1. About / Home (returns to globe)
2. Resume
3. Case Studies
4. Whitepapers (placeholder — content coming)
5. Contact

### Content panels (right area)

Each panel replaces the globe on nav click. The globe is the idle/default state — it should be doing something interesting (rotating, responding to mouse) while no panel is active.

Panel transitions are a primary design concern. Hard cuts are not acceptable. Options to consider:
- Globe contracts/dissolves, content fades or slides in
- Content emerges from the globe's center
- Globe persists at reduced scale/opacity behind content

---

## Globe — two versions to build

Build both. A toggle in the dev settings gear switches between them. The goal is to evaluate both in context before committing to one.

### Globe A — netActiv style (existing)
Replicate/import the current netactiv.com globe. Dark canvas, wireframe sphere, teal/gold/purple luminous data points, slow rotation, mouse-responsive. This is the known quantity.

### Globe B — abstract geometry / emergence
Inspired by the old netActiv site (2001-2010): dark canvas, abstract geometric shapes (cubes or similar) in deep red/crimson that float in from off-screen and resolve/assemble into a composed state. Less "enterprise network visualization," more "order from chaos." Motion should feel intentional — shapes arrive with weight, not particle-physics randomness.

Reference for Globe B: the old site used red-on-black rotating/floating cube geometry that resolved into the final layout. Capture that sense of emergence without directly replicating the Flash-era execution.

---

## Dev / testing controls — settings gear

Modeled exactly on `defunkt.com/games/` settings panel:
- Gear icon (⚙) top right of header chrome
- Click opens a dark rounded dropdown panel (not a modal)
- Panel is labeled "SETTINGS" with subsections

Contents of the settings panel (for staging/dev phase):

```
SETTINGS
VIEW
  [ dropdown: Resume | Case Studies | Whitepapers | Contact | Globe ]

GLOBE
  [ toggle: Globe A (netActiv) | Globe B (Emergence) ]

---
[ Reload & clear cache ]
```

The VIEW dropdown is the primary dev tool — it lets us test each content panel without building the left-rail nav first. Build the content panels first, wire them through the settings gear, build the real nav after.

This gear and its dropdown ship in the final site too (reduced to relevant persistent settings, if any). It is not a dev-only artifact.

---

## Visual design direction

### Palette
- Background: near-black (#0a0a0f or similar — not pure black)
- Globe A accent colors: teal, gold, purple (match netactiv.com)
- Globe B accent colors: deep crimson/red
- Content panels: dark background consistent with hero, light text
- Accent/highlight: one color, used with discipline — likely teal to match Globe A, or a neutral warm white

### Typography
- Sans-serif, clean, modern — match netActiv's type weight and feel
- Key metrics (347%, 90%, 27%, 10,000 employees, $4B acquisition) should be treated as typographic objects — large, weighted, visually significant
- Motion on type arrival in content panels — numbers should land with weight, not just appear

### Motion principles
- Everything moves with intention. No gratuitous animation.
- Globe is always doing something — slow idle rotation minimum
- Content panels arrive and depart with a consistent transition pattern
- Type in content panels can animate in (stagger, fade-up) but should resolve quickly — this is a professional document, not a showreel

### What to avoid
- Carbon fiber textures, lens flares, particle storms
- Generic "tech company" visual language — data nodes floating in space for their own sake
- Resume-template aesthetics
- Anything that looks like it came from a Squarespace or Wix theme

---

## Content — what goes in each panel

Pull content from `bobcooley.nyc`. Key elements:

### Resume panel
- Name: Bob Cooley
- Title: Communications Strategist / Digital Workplace Leader
- Contact: bob@bobcooley.nyc | (917) 586-7704 | Greenwich Village, NYC
- Key metrics to feature prominently: 347% platform adoption increase, 27% email reduction, 90% efficiency gains, 10,000 employees mobilized, $4B acquisition (Scottrade)
- Experience: TD Ameritrade (2011-2019), netActiv Media (2001-2011), Consultant (2019-present)
- Education: Grand Valley State University (BS Communications Theory, Photography & Media emphasis); Lake Michigan College
- Additional: IBM Champion 2018 & 2019, Social Business Collaboration Committee co-founder

### Case Studies panel
- Placeholder structure for now — 3-4 case study cards with title, client/context, outcome metric
- Content TBD — Bob will supply

### Whitepapers panel
- Placeholder — AI governance whitepaper in progress
- Simple holding state with title and "coming soon" treatment

### Contact panel
- Email, phone, location
- LinkedIn link
- Simple, no form required initially

---

## Technical notes

- Framework: your call based on what's already in the netActiv project. If the existing netactiv.com is plain HTML/JS/CSS, stay consistent. If it's a framework already, use it.
- The globe is likely three.js or a canvas implementation — import/reuse from netActiv directly if possible for Globe A.
- Mobile: responsive behavior needed but desktop is the primary target. Left rail nav collapses to a hamburger or bottom bar on mobile.
- No CMS needed. Content is static for now.
- No contact form backend needed initially — mailto: link is fine.
- Staging path: `netactiv.com/nu_resume` — confirm the project's deploy config handles subdirectory routing correctly.

---

## Sequence of work

1. Scaffold the project at `nu_resume/` in the netActiv repo
2. Build the shell: header, layout grid, gear icon + settings dropdown (defunkt pattern)
3. Build Globe A (import from netActiv if possible)
4. Build Globe B (emergence/geometry)
5. Wire globe toggle in settings gear
6. Build Resume content panel (content from bobcooley.nyc)
7. Build Case Studies placeholder panel
8. Build Whitepapers placeholder panel
9. Build Contact panel
10. Wire VIEW dropdown in settings gear to all panels
11. Build left-rail navigation (permanent nav)
12. Wire nav clicks to panel transitions — design and implement transition animations
13. Polish, mobile pass, deploy to staging
14. Review, iterate
15. Migrate to bobcooley.nyc

---

## What success looks like

Someone who lands on this site — a Chief Communications Officer, a VP of Digital Workplace, a CHRO — should immediately understand, without reading a word, that Bob operates at the intersection of technology, communication, and culture at a sophisticated level. The site itself is a case study in digital experience design.

The numbers close the deal. The design gets them to the numbers.
