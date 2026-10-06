# Research 0001: visual identity

Collected by the agent on 6 October 2026 (AEDT). Text only: no screenshots,
logos or artwork from any source below are committed (CLAUDE.md, Never).

## When this was done

The author asked for research into LEGO sites and games, distinguishing
official design, promotional imagery and in-game UI, as part of the identity
step (ADR 0004). The identity in `src/client/ui/theme.css` and the homepage
([`d6746df`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/d6746df))
and the editor restyle
([`c1de11b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c1de11b))
were built from the author's brief **before** any of these sources were
consulted. The web searches below were run afterwards, during the final
verification step, and are used here as a check on the result, not as its
origin. Nothing was changed because of them.

The searches returned summaries and pages; the agent did not study
screenshots of any product. Where a claim comes from a third party rather
than LEGO, that is said.

## What the sources say

### Official design: LEGO.com

- LEGO does not appear to publish its web design system.
- A third-party analysis that read the live site's CSS custom properties
  ([oh-my-design.kr](https://oh-my-design.kr/design-systems/lego)) reports:
  - a bright yellow (`#ffd400`) main navigation bar
  - red (`#dd1a22`) for highlighted links
  - near-black ink (`#141414`)
  - a working **blue** (`#005ad2`) for primary actions
  - Cera Pro as the typeface, and a small (about 4px) corner radius
- BrickNerd ([typography article](https://bricknerd.com/home/all-types-behind-the-design-of-lego-typography-11-15-23))
  describes the move from Chalet to Cera Pro so that the web follows the
  packaging, with accessibility as the stated reason.
- A student audit of the site
  ([Pratt IXD, "Klods"](https://ixd.prattsi.org/2026/05/klods-building-a-design-system-brick-by-brick/))
  counted 11 button types and more than 15 text styles, and its redesign
  standardised five button types with WCAG 2.1 contrast.
- The logo's colours (red, yellow, black, white) differ from the site's
  interface tokens ([BrandPalettes](https://brandpalettes.com/lego-color-codes/),
  third party).

### Official app: LEGO Builder

- LEGO's own pages ([Builder app](https://www.lego.com/en-us/builder-app))
  and store listings describe 3D step-by-step instructions you can zoom and
  rotate, PDF instructions, and "Build Together", where builders join with a
  PIN and take turns completing steps.
- This is the closest official precedent for the planned cooperation on the
  homepage. It is turn-taking over a fixed set of instructions, not a shared
  kit of parts.

### In-game UI: LEGO Fortnite

- Player guides from LEGO and Epic
  ([advanced building](https://www.lego.com/en-us/themes/fortnite/advanced-building);
  [Brick Editor docs](https://dev.epicgames.com/documentation/fortnite/working-with-the-lego-brick-editor-in-fortnite?lang=en-US))
  describe:
  - a tabbed Build menu (Utility, Toys, Builds, Building Parts, Furniture)
  - blue-tinted previews that snap into place
  - a hold-to-snap mode
- The v28.10 patch notes
  ([fortnite.com](https://www.fortnite.com/news/lego-fortnite-v28-10-go-up-up-and-away-with-launch-pads?lang=en-US))
  mention three changes: making snap mode more obvious, abandoning a build
  in progress, and enlarging touch buttons on mobile.
- No source was found that discusses the design thinking behind the UI.

### Promotional imagery

None was gathered. Box art and campaign imagery are LEGO's artwork. The
project's illustrations are drawn by its own code (`src/client/ui/iso.ts`)
and its scene cover is rendered from its own scene.

### Community code: react-legos

- [brycedorn/react-legos](https://github.com/brycedorn/react-legos) is
  CSS-driven React brick components under the MIT licence, at version 0.1.5
  on npm and no longer actively updated.
- It is not a dependency, and none of its code is used. `src/client/ui/iso.ts`
  draws its own isometric bricks as SVG; its header comment names
  react-legos only as the kind of demo it resembles.

## How this project's identity compares

| | LEGO.com (third-party reading) | This project |
| --- | --- | --- |
| Red | highlighted links | brand band, primary build actions (`--red: #e3241b`) |
| Yellow | main navigation bar | main homepage call to action, counts, tags (`--yellow: #ffcd00`) |
| Primary action colour | blue | red in the editor, yellow on the homepage |
| Blue | primary actions | the focus ring, and the second kit and "Plan" label in the homepage's cooperation illustration (`--blue: #1a5bb0`) |
| Type | Cera Pro (licensed) | Fredoka for display, Nunito for text, both SIL OFL, self-hosted from `@fontsource-variable` 5.3.0 |
| Corners | small (≈4px) | larger (12–18px), with a raised bottom edge on buttons and tiles that presses down |
| Logo | the LEGO wordmark | an original isometric brick mark and a working title, "Brick Commons" |

The project shares the broad red, yellow and white palette with the brand,
which is what the author asked for. It does not reproduce LEGO.com's token
values, typeface, button shapes, wordmark or layout. The homepage footer
says the project is not made, sponsored or endorsed by the LEGO Group.

Two ideas from the in-game and app sources already have counterparts here,
reached independently:
- tabbed part categories over a tray
- a tinted, snapped preview with text saying whether it fits (the project
  adds the text so the result is not conveyed by colour alone)

## Open for the author

- Whether "Brick Commons" stays. It is the agent's placeholder (ADR 0004).
- Whether any of the sources above should change the identity. The agent
  has not acted on them.
