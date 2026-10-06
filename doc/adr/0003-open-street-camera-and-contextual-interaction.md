# ADR 0003: Open street, free camera, contextual interaction

- Status: accepted.
  - Decided by the author on 6 Oct 2026, after trying the C8 checkpoint
    prototype: the direction and the requirements below.
  - The agent's implementation choices are marked "agent".
- Date: 2026-10-06
- Supersedes parts of ADR 0002: the finite display base, the orthographic
  camera limited to ±0.75 rad of azimuth, and the explicit Build/Select modes.
  ADR 0002's rationale for those (a shallow composition seen front-on, with
  nearly edge-on angles avoided) is kept there as the record of the earlier
  choice.

## Context

The author's trial of the checkpoint found:
- the scene read as a miniature platform suspended in empty space
- the neighbours were too plain
- neighbour doors were slabs on solid walls
- the keyboard shortcuts were unreliable
- the right sidebar and the mode toggle got in the way

A new art-direction image (AI-generated, not a spec) set the target: a
full-screen warm street, convincing plastic, open views of the build, and a
restrained translucent bottom dock with model thumbnails.

## Decision

**Scene** (author):
- the world fills the viewport, with sky, distant surroundings, and street and
  ground running past the working area
- buildings with coherent sides and backs
- the plot kept open

**Camera** (author's requirements, agent's parameters):
- **Perspective, FOV 40°** (agent). A free 360° orbit shows a horizon and sky,
  which an orthographic camera renders unnaturally, and perspective gives
  depth to the street. (First drafted as 35°; widened to 40°, with a lower
  opening angle, so that the opening view takes in the middle distance and a
  strip of horizon.)
- **OrbitControls:**
  - unlimited azimuth
  - polar angle 0.02–1.36 rad, so near straight-down at one end and about 12°
    above the horizon at the other, never underground
  - distance 14–95. Drafted as 14–75; at 390×844 the fitted Reset and Top
    views need 71.3 and 75.3, measured with `window.__camera()`. At 1920×1080
    they need 32.2 and 26.0.
- **Pan.** The target is clamped to a box around the plot (the plot plus 6
  studs on each side, up to 8 high), so the build can't be lost and the
  world's edges stay behind fog.
- **Top view and Reset view** are buttons and keys (`T`, `Home`).
- **Opening view** (agent): azimuth 0.2, polar 1.32, orbit target at the plot's
  centre, 4 up. The distance is computed to frame the plot's width, a
  two-storey house above it and the plot's front edge below.
- **Framing around the dock** (agent): the dock floats over the canvas, so the
  canvas stays full-screen and the lens is shifted with `setViewOffset` to put
  the target 60% of the way down the area the dock leaves clear. The camera
  reserves only the dock's stable height (the tray rows and the tool buttons),
  not the context row, whose height changes with the state; otherwise the
  scene would shift between a first and second tap.

**Gestures** (agent):
- Mouse: left-drag orbits, right-drag or shift-drag pans, the wheel zooms.
- Trackpad: click-drag orbits, two-finger scroll zooms.
- Touch: one finger orbits, two fingers pinch-zoom and pan.
- A press counts as a click only if it moved less than 6 px (10 px for
  touch), so a drag never edits.
- Touch has no hover, so placing and deleting take two taps: the first tap
  previews the part (or names the delete target) and says so in text; a second
  tap on the previewed footprint places it (or on the named part removes it).
  A mouse click places or removes at once, since hover already showed the
  preview.

**Interaction** (author):
- Contextual states replace the modes: nothing held, holding a part, a part
  selected, and the delete tool.
- Rotating a placed part is a new server command, `rotate` (agent: it turns
  the part about its footprint centre, rounding down by half a stud for odd
  differences). It is validated against the whole build: the rotated part must
  fit and be supported, and every part resting on it must stay supported.
  Rejection changes nothing. Identity and stock are preserved.
- Keyboard handling is one global listener rather than handlers on a focused
  container (agent). That container was the cause of the unreliability: after
  clicking any tray or colour button, focus left the stage and no shortcut
  fired.
- Focus policy (agent): a control clicked with a mouse or finger gives focus
  back to the page at once, so a following Enter acts on the scene rather than
  re-pressing that control; a control pressed from the keyboard keeps focus.
  Controls that can't act during a save are `aria-disabled` rather than
  `disabled`, so focus isn't lost. Shortcuts are ignored in editable fields
  and action keys ignore auto-repeat (arrow and page keys may repeat).
- Read-only `?debug` hooks (agent): with `?debug` in the URL the page exposes
  `window.__state`, `window.__camera()` and `window.__project()`, which
  `scripts/interaction.ts` uses to read state. They expose nothing the page
  doesn't already hold and can't change anything.

**Decorative parts and kit versioning:**
- Three new catalogue parts (author asked for a bounded set; agent chose the
  shapes): a framed window 1×2×2, a fence 1×4×1 and a planter 1×2.
- These are additions only, recorded as scene version 2. Existing quantities
  are unchanged and the reference model is unchanged.
- A version 1 build is upgraded in place on its next load: missing
  inventory rows are inserted at their full quantity, and `template_version`
  becomes 2 (agent). This happens in one transaction. Placed parts and
  existing stock are untouched, so kit = held + placed still holds, and no
  saved work is invalidated.

## Consequences

- The camera can now reach angles that show how shallow the buildings are, so
  neighbours are built with real sides, backs and gable ends.
- More scenery means more geometry. Each fixed building is merged into one
  mesh per colour, and most scenery studs are omitted where the next course
  would cover them.
- A rotated placed part can change footprint, which is why rotation is
  validated against the whole build, not just the part.
