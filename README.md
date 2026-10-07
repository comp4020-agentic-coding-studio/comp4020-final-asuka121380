# Brick Commons

*Working title · C8, 7 October 2026*

Brick Commons is a browser-based brick-building project about making something that belongs to a group. My definition of good is an experience where people can contribute different ideas, negotiate an aesthetic and build a lasting reminder of time spent together. Solo play should be satisfying, but cooperation is the project's central ambition, not an optional social layer around an otherwise finished game.

## A shared building, a shared memory

The aim is not simply to finish faster with more hands. A roof colour, a garden or an unusual window can emerge from different people's suggestions. The resulting building should express a group's particular taste, including choices no individual would have made alone.

Planned cooperation distributes complementary parts between players. Group material requests let others help, while transparent planning pieces make suggestions visible before construction. These mechanisms should support both practical contributions and creative decisions, rather than reduce some players to supplying somebody else's design. A future exhibition would preserve the building and credit its collaborators: an artefact around which they can remember what they made together.

## Build somewhere, not in a void

The first scene is a colourful beachfront neighbourhood. Warm light, neighbouring houses and the sea give a small construction a setting: players add a home to a place, rather than inspect an isolated model. The beach keeps the foreground open. Scenery should invite experimentation without hiding the piece being placed.

The red, white and yellow site identity belongs to building together, not specifically to the beach. C8 contains one scene; other settings can follow.

## Enough guidance, room for ownership

The reference house is adapted from the [official LEGO Classic 11035 instructions](https://www.lego.com/en-us/service/building-instructions/11035). Its modest scale offers an understandable starting point. A finite kit contains the reference parts plus extras; colours do not consume separate stock. Players can follow the example, change its colours, or build something else. There is no compulsory completion percentage or prescribed colour scheme.

Two official precedents clarify the design in retrospect. [LEGO Builder](https://www.lego.com/en-us/builder-app) combines rotatable instructions with shared building; this project instead proposes negotiating a design through complementary inventories. [LEGO Fortnite's building guide](https://www.lego.com/en-us/themes/fortnite/advanced-building) presents snapping as alignment assistance. Here, assistance must preserve intention, including access to valid lower placements. These comparisons were consulted after the first interface was built, not its original design process.

## What C8 actually offers

C8 is a server-saved solo experience. Each visitor receives the complete kit and can place, recolour, rotate and remove parts. Returning in the same browser resumes the build through a browser cookie; clearing that cookie or changing browsers does not currently recover it.

Cooperation and exhibitions are not implemented yet. Neighbours are scenery, not other players' creations. Solo play establishes an enjoyable foundation without requiring an existing community; it does not yet demonstrate the project's collective promise.

## What can be checked, and what still needs judgement

The [harness](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/blob/main/CLAUDE.md) and [tests](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/tree/main/spec) protect inventory, collision and support rules, safe command retries and saved state. Rejected actions cost no parts; removing a sole support is refused. Browser checks cover preview accuracy, camera-relative controls and returning to a saved build.

Whether the place feels welcoming and controls feel natural needs human judgement. Future group testing must ask whether people can influence the design and recognise their contributions, not just whether changes synchronise. My playthroughs drove revisions; independent newcomer testing is missing. Side-view occlusion and a tall mobile toolbar remain limitations. Survival systems, physical collapse, a vast catalogue and runtime AI generation are excluded to keep attention on creative construction.

This is an independent student project, not an official LEGO product.
