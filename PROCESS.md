# Process overview — C9

*14 October 2026 · From building in a place to building and remembering together.*

## Starting from the solo foundation

C8 established a small, persistent brick-building experience. Its main design breakthrough was moving from an isolated model on a platform to construction within a colourful coastal environment. Contextual controls, camera-relative movement and reachable lower placement positions made that foundation more usable. The earlier account remains in the [C8 commit](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/7e06dec).

However, a working solo builder did not yet fulfil the project's central idea: remembering childhood construction with friends, where following instructions can gradually become responding to one another's unexpected ideas. This week I postponed additional maps and visual redesign. The question became how to turn an individual building tool into a shared creative space, without making cooperation merely two people operating the same interface.

## Translating cooperation into rules

I changed the earlier proposal of separately allocated pieces and material requests to one shared, finite inventory. Distributing scarce pieces could encourage negotiation, but also risked making cooperation primarily about transferring resources. Shared stock instead lets players respond directly to proposed designs. I chose two players for the current small Beach Houses plot; capacity belongs to scene configuration, rather than a universal player limit ([1b01620](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/1b01620)).

Communication remains deliberately spatial. Transparent planning bricks propose something without consuming inventory; highlighting a plan draws a teammate's attention without text or voice. Plans can describe unsupported future structures, while realizing them requires normal placement validation. The implementing commits are [26377d7](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/26377d7) and the later support-rule correction [3248d41](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/3248d41).

Authorship also matters: the original builder, subsequent editor and plan proposer have distinct roles. Someone who placed a real brick remains a contributor after leaving, even if their bricks disappear. These rules support my definition of good: people can propose, respond and retain a shared memory without a prescribed result. Shared inventory alone does not prove cooperation; whether players actually understand and respond to plans still needs human testing.

## Making simultaneous building workable

I retained React, React Three Fiber, Express and SQLite from C8. The architectural change was ownership: a build now belongs to a room, not one visitor. The server validates commands against current state and commits inventory and construction together; clients receive updates through server-sent events (SSE), implemented in [ba5d94f](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/ba5d94f).

SSE was Claude's recommendation, recorded alongside alternatives in [ADR 0008](doc/adr/0008-realtime-transport-and-concurrent-editing.md). It preserves the existing HTTP command path and adds server-to-client notifications. WebSockets were an alternative for bidirectional messaging; frequent polling would repeatedly request state even when nothing changed. This choice suits discrete actions and the existing single-machine deployment, but does not establish scalability beyond it.

The more important behavioural decision was rejecting a whole-room revision gate. If one player places a brick, that should not automatically invalidate another player's unrelated placement. Placements are checked against current space and stock; edits to existing bricks check that brick's revision. Actual conflicts are rejected, rather than silently overwriting another person's work. This connects concurrency to the design goal: participation should not feel like waiting for permission after every teammate's action.

## Preserving a shared work without giving it away

Rooms, friends, collections and the showcase form one journey: find someone, build together, save a moment, and continue from it later. Public rooms allow discovery; private rooms require invitations, not friendship alone. After reviewing the anonymous identity model, I requested explicit accounts while retaining guest play. Username/password accounts were added over existing visitor identities rather than replacing their work ([84de4e7](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/84de4e7)).

Any room member can save a personal snapshot, independently of the host. Continuing creates a separate room; the saved original stays unchanged. Credits distinguish current contributors from inherited sources. Publication permission is disclosed as a room setting, and a restricted work must remain restricted through later copies. The collection interface arrived in [eb17e4b](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/eb17e4b); [62cdb5f](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/62cdb5f) corrected inherited credits and a public-room bypass. Participation in a private creation should not imply permission to expose it.

## Directing and correcting the implementation

I supplied the narrative, interaction rules and scope decisions; Claude implemented them. My framework playthroughs, supplemented by automated tests and code review, challenged the result. The first multiplayer delivery had substantial server functionality but no complete interface for reaching it. I asked for the lobby, invitations and shared-room entry before treating multiplayer as usable ([e132a5f](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/e132a5f), [e29fe11](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/e29fe11)). Backend availability was not an adequate completion criterion.

Independent review subsequently exposed unauthorized snapshot continuation, returning members bypassing capacity, and plans incorrectly requiring support. These became corrections and regression tests, rather than being dismissed because earlier tests passed. A further pass found inactive members could still mutate rooms, logged-out streams retained access, and admission preceded publication disclosure. Server and interface changes followed in [14311c6](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/14311c6) and [3a47ed9](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/3a47ed9), with tests in [4bcbad1](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/4bcbad1).

This process exposed a recurring weakness: implementing individual endpoints correctly does not guarantee a consistent rule across every entry path. The harness and ADR updates record corrections; DEVELOPMENT_LOG.md retains commit-linked detail. This overview explains the decisions rather than duplicating that log. It was drafted with AI assistance from my design discussions and repository evidence. Automated verification is distinguished from my manual playthroughs and does not constitute a two-person playtest.

## Deployed result and remaining uncertainty

On 14 October, type checking and a rerun of 116 automated tests passed against an isolated database. I then authorized direct deployment of the current version, without another repair pass. Fly release v7 completed; homepage and lobby resources were reachable. These local multiplayer commits had not yet been pushed to GitHub at this writing.

Passing tests did not mean all issues were resolved. Additional checks showed that account switching closed old streams without invalidating the replaced credential, and guest recovery left the previous credential and stream active. Those defects remain in the deployed version. A full-room join button also needs actual disabling, not only an accessibility attribute.

My testing assessed the framework on one machine; independent browser identities and HTTP checks are not evidence of enjoyable cooperation between two people on separate devices. Next priorities are the remaining session fixes, deployed multiplayer verification and observing whether real players use plans to develop a genuinely shared result.
