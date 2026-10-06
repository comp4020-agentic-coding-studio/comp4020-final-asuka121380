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
- **Perspective, FOV 35°** (agent). A free 360° orbit shows a horizon and sky,
  which an orthographic camera renders unnaturally, and perspective gives
  depth to the street.
- **OrbitControls:**
  - unlimited azimuth
  - polar angle 0.02–1.36 rad, so near straight-down at one end and about 12°
    above the horizon at the other, never underground
  - distance 14–75
- **Pan.** The target is clamped to a box around the plot, so the build can't
  be lost and the world's edges stay behind fog.
- **Top view and Reset view** are buttons and keys.

**Gestures** (agent):
- Mouse: left-drag orbits, right-drag or shift-drag pans, the wheel zooms.
- Trackpad: click-drag orbits, two-finger scroll zooms.
- Touch: one finger orbits, two fingers pinch-zoom and pan.
- A press counts as a click only if it moved less than 6 px (10 px for
  touch), so a drag never edits.

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
