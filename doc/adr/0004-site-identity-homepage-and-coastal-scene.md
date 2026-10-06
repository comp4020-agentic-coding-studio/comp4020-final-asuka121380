# ADR 0004: Site identity, a separate homepage, and the coastal first scene

- **Status:** accepted.
  - The author set the direction on the evening of 6 Oct 2026.
  - The agent's implementation choices are marked "agent".
- **Date:** 2026-10-06
- **Supersedes:**
  - ADR 0003's generic suburban street as the scene's setting
  - the cream, navy and mint palette with a grey-glass interface
  - the editor sitting at `/`
- **Kept from ADR 0003:** the camera, the contextual interaction model, the
  kit versioning and the bottom dock layout.

## Context

The site is meant to hold several scenes and, later, cooperative building.
Until now its name, palette, homepage and scenery all came from one
suburban-street scene, and `/` opened straight into the editor. The author
asked for four changes:
- a brick-themed identity in vivid red, white and yellow
- a designed homepage that explains the experience, including the planned
  cooperation, honestly labelled
- the editor on its own route
- a colourful Los Angeles-inspired beachfront at golden hour as the first
  scene, kept separate from the site's identity

## Decision

### Routes

- `/` is a static homepage.
  - Its text and controls are in the HTML itself.
  - Its script is small, and does not import React Three Fiber, three.js or
    any scene content.
- `/build/` is the editor. `/build` redirects there, and both work as direct
  links and on reload.
- Visitor identity is still the `brick_visitor` cookie, so moving between the
  two keeps the same build.
- The homepage asks a new read-only endpoint, `GET /api/summary`, whether
  this browser already has a build and how many parts it holds. The
  endpoint never creates a visitor or a build, so merely viewing the
  homepage writes nothing to the database (agent). The call to action then
  reads either "Start building" or "Continue my build".

### Identity and shared UI

- **Palette.** Red, white and yellow as a system:
  - red for the brand band and the primary actions
  - yellow for highlights and the main call to action
  - white surfaces, dark text and restrained neutrals
- **Shared components.** The tokens and component classes live in
  `src/client/ui/` and are used by both the homepage and the editor:
  buttons, tiles, cards, stud swatches and the brick motif. They contain no
  scene wording or colours.
- **Fonts.** Self-hosted from npm `@fontsource` packages under the SIL Open
  Font License, so no font service is called at runtime (agent; faces are
  recorded in `doc/research/0001-visual-identity.md`). As built: Fredoka for
  display and Nunito for text, from `@fontsource-variable` 5.3.0.
- **Focus.** The shared focus ring is an outline, `3px solid var(--blue)`.
  It began as a box-shadow, which a tile's own raised-edge shadow replaced,
  so focused tray tiles showed no ring; the keyboard check in
  `scripts/interaction.ts` caught it (agent).
- **Name.** The site's name is a working title the agent proposed,
  "Brick Commons", and the page marks it as a working title. It is a
  placeholder for the author to replace, not an author decision.
- **No official branding.** There is no LEGO logo, artwork or copied button.
  The visual research is recorded as text; third-party screenshots are not
  committed.

### Scenes as data

- `src/client/scenes/` holds a small registry with an entry per scene:
  - title, blurb, cover image and recommended colours
  - the environment component (code-split, so only the editor loads it)
  - lighting and sky parameters
- As built (agent), these are three places, so that the homepage can import
  the metadata without pulling in three.js:
  - `registry.ts` and the scene's `info.ts` hold the metadata only: title,
    setting, blurb, cover, alt text and suggested colours.
  - `environments.tsx` maps the scene id to a lazily imported environment
    component.
  - The light and sky are not registry parameters. They are code in the
    scene's own folder (`scenes/beach/sky.ts`), next to its environment.
- The cover (`public/scenes/beach-houses.webp`, 1200×750) is rendered from
  the scene itself, so it carries no third-party imagery (agent).
- The domain template (kit, bounds, reference, version) stays in
  `src/domain/scene.ts`.
- The homepage renders its scene card from the registry's metadata. A second
  scene adds an entry, not a redesign. This is deliberately not a plugin
  framework or scene editor.

### The first scene, and saved work

- The scene keeps its data id, `street-01`, and its kit at version 2.
- Only the client-drawn scenery changes, so there is **no migration**:
  saved builds and inventory are untouched.
- The palette gains a few vivid colours. This is additive: existing colour
  ids and their meaning don't change, and the server's colour check accepts
  the new ids.
- The scene's display title changes, not its id.

### Layout and light (agent, from the author's art direction)

- **Layout:** houses facing +z, front gardens, a promenade, then the beach
  falling gently to the sea. The default view looks from the beach side, so
  the sea is behind the camera, as the author's geography note allows.
- **Sun:** low over the sea side.
- **Sky and environment from one source.** The visible sky is a procedural
  dome. The environment map used for fill and reflections is rendered from
  that same dome and sun (drei `Environment` with child meshes, which runs
  locally), so the light and the sky agree.
- **Tone mapping:** neutral, so saturated building and part colours stay
  recognisable.
- **Scenery detail by distance:** brick-built geometry near the plot,
  simpler boxes in the middle distance, and a self-generated panoramic
  backdrop texture far away.
- **Sea:** a single shader plane with light animated detail. There is no
  fluid simulation.

As built (agent):
- **Sun:** one direction, `SUN_DIR` in `scenes/beach/sky.ts`, about 19°
  above the sea horizon. It drives the sky shader, the environment map, the
  shadow-casting light and the sea's glitter.
- **Distance tiers:**
  - near: the four neighbours, gardens, promenade, palms and benches
  - middle: shore houses, a pier, and a hillside town of simple houses with
    roofs, terraces and hedges, rising inland
  - far: the "panoramic backdrop" is three hill ridges painted once into a
    canvas texture (`backdropTexture` in `terrain.ts`), inland only, so the
    sea side keeps a true horizon
- **Camera keep-out.** Once the camera could orbit fully, a far orbit could
  put it inside a neighbour's house or a palm crown. The environment now
  registers those objects' bounding boxes (`src/client/scene/obstacles.ts`).
  If the camera ends up inside one, it is moved towards the target until it
  is just outside. A house standing between the camera and the plot is left
  alone: that is an ordinary view, and orbiting clears it. The boxes affect
  only the camera; they are not part of the build or the rules.

## Consequences

- The client now builds as two Vite pages. The server serves `/build/` from
  the same static directory.
- Caching (agent): only Vite's hashed files under `/assets/` are cached as
  immutable. Pages and unhashed files, such as scene covers, are served
  `no-cache`, so a replaced cover is never stale.
- Shared components make later restyling cheaper.
- The homepage's text is crawlable and works without WebGL.
- The scene registry is the first place another scene would go. Multiple
  playable scenes are still out of scope.
- The environment is heavier than the old street. Its cost has to be
  checked at both marking viewports.
