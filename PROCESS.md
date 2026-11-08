# Process overview

## The deployed URL

https://comp4020-final-asuka121380.fly.dev/

## What I built

I built **Brick Commons**, a browser-based space for shared brick construction. Beach Houses, Medieval Castle, and Woodland Commons support groups of two, four, and six. Players share materials, propose transparent plans, edit one construction, and save versions with contributor credits. An interactive building table provides entrances to these activities. The project follows one intention: returning to childhood experiences of building LEGO with friends and sometimes strangers.

## How I got here

### Turning an intention into instructions

I began with the experience around the bricks: exchanging suggestions, changing an idea, and making something together. I used this intention to decide the scope, then asked Claude to implement it. Shared inventory replaced separately allocated materials; plans and marks supported communication through construction; text chat and competitive rankings stayed outside the project. These choices concentrated the social experience on building ([`1b01620`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/1b01620), [`ba5d94f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/ba5d94f)).

Later reading helped articulate my criteria. Jenkins’s [*Game Design as Narrative Architecture*](https://electronicbookreview.com/publications/game-design-as-narrative-architecture/) explains how spaces establish narrative possibilities; [MDA](https://www.cs.northwestern.edu/~hunicke/MDA.pdf) connects mechanics, behaviour, and experience. I used these perspectives to assess whether the interface and rules carried the same intention, and approved that argument in the final README ([`6202b5b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/6202b5b)).

### Choosing the stack and organising Claude’s work

Claude initially recommended a lighter Three.js interface. I chose React and React Three Fiber for composing the growing controls, planning tools, and collection views. Express provides one same-origin server; Node’s built-in SQLite avoids an additional native driver build. Independent domain functions allow client previews and server validation to share construction rules ([ADR 0001](doc/adr/0001-stack-and-persistence.md), [`a9b4c3d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/a9b4c3d)).

I accepted SSE for server push while retaining HTTP commands. Full snapshots simplify reconnection but resend more data, a trade suited to the current single-machine scope. I also chose to allow independent simultaneous placements rather than reject every action with an outdated room revision; conflicting edits are checked against the targeted part ([`d8e9f27`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/d8e9f27), [`ba5d94f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/ba5d94f)).

For substantial changes, I first clarified the desired experience and boundaries, then arranged investigation and implementation in stages. I read Claude’s reports, inspected the actual result, and issued follow-up instructions. Decisions were recorded in ADRs, continuing constraints in CLAUDE.md, and verification in evidence records, so later tasks inherited more than an isolated prompt.

### Reviewing one complete interaction before expanding

The homepage redesign demonstrates this cycle. Its early colours worked, but I found the presentation too commercial. I specified a spatial building table where physical objects provide entrances and the camera approaches them before interaction. I asked Claude to establish one complete sign-in entrance first, making the pattern something I could operate and judge before extending it ([`09a3f3b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/09a3f3b)).

I liked the resulting approach-and-interact behaviour, but my review found the scene too dark and orderly. Objects stood facing forward like products on display. I requested stronger daylight, varied orientations, loose pieces, and unfinished assemblies. After another review, I also requested a surrounding room to replace the underdeveloped background. These were successive instructions based on what I saw, not a single request to “improve the art” ([`f88424e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/f88424e), [ADR 0014](doc/adr/0014-tabletop-homepage-and-camera-navigation.md)).

Once satisfied with the interaction, I arranged the remaining entrances. I wanted functions to stay at the table where appropriate, while allowing dedicated pages when the task needed more space. Claude implemented the shared forms and navigation; I continued reviewing composition, colour, readability, and page structure ([`755c7cf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/755c7cf), [`ed0b206`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/ed0b206)).

### Converting playthroughs into precise changes

My own use also shaped the building controls. Proposing a plan originally required moving the pointer to a separate button, potentially changing the preview. I requested explicit Build and Plan modes with the same spatial interaction, so confirmation would commit the displayed proposal. I chose derived planning demand rather than reserving real stock for suggestions ([`c7ad154`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/c7ad154), [`41a632f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/41a632f)).

For additional scenes, I selected the architectural themes and specified references, spare-material allocation, capacity, atmosphere, and an unobstructed foreground before asking Claude to investigate and implement. The tree house required usable elevated platforms, not merely a decorative tree. Fixed geometry therefore became part of the shared support and collision rules ([`29799d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/29799d2), [`7ba5576`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/7ba5576)).

I then reviewed the scene and reference image, identified weaknesses in their presentation, and requested further refinement. This kept the acceptance decision with me while leaving Claude responsible for implementing the geometry and mechanisms ([`725eb58`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/725eb58), [`af67301`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/af67301)).

### Investigating failures and reviewing repairs

When table entrances missed clicks, I requested investigation instead of accepting another cosmetic adjustment. Claude isolated hover movement and delayed browser history, added targeted checks, and removed a speculative camera repair after disproving its diagnosis ([`ad04efe`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/ad04efe)).

Logging showed why repairs also needed scrutiny. A change intended to preserve crash messages introduced synchronous output. Existing checks passed, but follow-up investigation reproduced a server blocked by an unread output pipe ([`b9ec1ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/b9ec1ed)). I requested targeted verification rather than accepting the report. Claude replaced it with a bounded asynchronous queue and added real-process regression tests. I accepted diagnostic loss under overload rather than allowing logging to stop construction; the decision became a harness constraint ([`bcd0b2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/bcd0b2c), [`23f1746`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/23f1746)).

### Accepting the deployed experience

Deployment revealed that local source-tree checks had missed About dependencies absent from the production image. Claude corrected the Dockerfile; subsequent work checked runtime imports and production layout before CI built the actual image ([`625f14b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/625f14b), [`0575115`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/0575115)).

Final acceptance combined automated checks, my rendered-page and interaction reviews, deployment and restart verification, and real multiplayer use. I observed effectively immediate shared changes while logs distinguished participants and recorded actions. Deployment evidence records the backup and persistence checks ([`0a483a1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/0a483a1)).

My workflow was consistent: make a decision, arrange a bounded implementation, inspect it personally, and give concrete feedback until satisfied. Claude supplied implementation and technical investigation; I supplied the direction and the judgement that connected each iteration to the experience I wanted.
