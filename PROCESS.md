# Process overview — C10

*21 October 2026 · From shared construction to evidence I can question.*

## Starting with a reason to build together

Brick Commons grew from my memories of building with friends, and sometimes strangers, as a child. The important outcome was not always the model: making decisions together could create a relationship. I wanted a shared construction to contain choices that neither participant would have made alone.

C8 established the persistent solo foundation and moved construction from an isolated platform into a coastal neighbourhood ([7e06dec](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/7e06dec)). The reference house became an optional starting point, not a required result. I postponed additional scenes and visual redesign to prioritise cooperation and reliability. Attractive surroundings could support the experience, but could not establish that players genuinely influenced one another.

## Turning cooperation into usable rules

I replaced separately allocated pieces and material requests with one shared, finite inventory. Separate supplies might encourage negotiation, but could also reduce participation to transferring resources. Shared stock lets both players act on the design directly. The small Beach Houses scene supports two players, with capacity belonging to scene configuration rather than a universal limit ([1b01620](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/1b01620)).

My playthroughs then challenged the planning interface. Proposing a brick required moving the pointer to a separate button, which could move the placement preview. I requested an explicit Plan mode with the same placement interaction as Build. Its calculated remaining inventory can become negative without consuming real stock, helping players see what a proposal would require ([41a632f](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/41a632f)).

I also changed the earlier decision to allow unsupported plans after encountering overlapping proposals. Planning should permit ideas beyond the available materials, not geometry that cannot be built. Plans now require support and cannot overlap valid construction; real bricks still require real support ([7cc7a4d](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/7cc7a4d)). This was a revision of my design, not merely correction against an unchanged specification. I subsequently requested one Delete tool for both real and planned bricks, removing another unnecessary difference between the modes ([0270a00](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/0270a00)).

## Architecture and ownership

The agent recommended React, React Three Fiber, Express and SQLite; I accepted and retained that stack rather than independently selecting every component. React and React Three Fiber support the interface and interactive scene, while Express and SQLite fit the existing single-machine deployment. This is a practical fit for the current scope, not evidence of large-scale performance.

The important multiplayer change was making a build belong to a room. The server validates commands and commits construction and inventory together. SSE pushes updates while writes retain the HTTP command path ([ba5d94f](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/ba5d94f)). The agent recommended SSE over bidirectional WebSockets or repeated polling for these discrete actions. Unrelated placements should both succeed; conflicting edits should be refused rather than silently overwrite another contribution.

Accounts were added over visitor identities, preserving existing work ([84de4e7](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/84de4e7)). Private rooms require invitations, not friendship alone. Saved versions remain independent when continued, and publication restrictions follow derived work. A previous correction to inherited credits and a public-room bypass demonstrated why these rules must hold across entry points, not just individual screens ([62cdb5f](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/62cdb5f)).

## Making behaviour observable

For C10, I asked for an investigation before authorising implementation. Existing command logs distinguished actors, but omitted much of the journey into a room and through saving or publishing. The investigation also reported request fragments appearing in default error output.

I approved structured, allowlisted events for significant actions and refusals, with actor identity derived on the server. Logs distinguish committed changes, duplicates, no-ops, validation failures and permission denials. They are private diagnostic output, not a player activity feed ([eddc87d](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/eddc87d), [cd1b5fe](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/cd1b5fe)). This makes cooperation observable without treating every pointer movement as useful evidence or exposing credentials.

Logging then exposed a deeper identity issue. After I requested follow-up investigation, the agent reproduced a first-visit race: concurrent requests could create several visitors, and a late cookie could switch identity after a player had created a friend link. The repair establishes identity before dependent requests, coordinating tabs through a browser lock where supported ([a04c99e](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/a04c99e)). Correct permissions alone were insufficient if the browser inconsistently identified the person using them.

## Directing and correcting agent work

I supplied the purpose, interaction decisions and scope, while the agent carried out implementation, testing and follow-up review. I used staged investigations and reviews to challenge completion reports rather than treating them as independent certification.

The clearest lesson came from a repair that introduced another failure. To avoid losing crash messages on exit, the agent changed logging to synchronous writes ([b9ec1ed](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/b9ec1ed)). Tests passed, but a subsequent agent-assisted review raised concerns about output congestion and shutdown behaviour. I requested a targeted follow-up instead of accepting the completion report.

The agent then reproduced a server blocked by an unread output pipe. The replacement uses a bounded asynchronous queue, accepting diagnostic loss under overload rather than sacrificing service. Fatal errors during graceful shutdown also escalate the exit status ([bcd0b2c](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/bcd0b2c)). These findings became regression tests and explicit harness constraints ([23f1746](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/23f1746)). The lesson was not that tests are unhelpful, but that passing tests only answer the risks they actually exercise.

## Evidence and remaining uncertainty

The agent’s final local report recorded 225 passing tests across three runs, alongside browser regressions. CI and deployment checks subsequently passed, and online inspection confirmed the new logging format ([e40f30b](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/e40f30b)). I distinguish those recorded results from checks I performed myself.

I tested two devices with separate accounts and confirmed shared-room synchronisation. This was not the required two-classmate, URL-only rehearsal, nor evidence that collaboration felt meaningful. Newcomer understanding, responses to plans and recognition of individual influence remain open questions.

This account was prepared with AI assistance from my decisions and repository evidence. My responsibility is to question claims and decide what evidence is sufficient. The next work is human evaluation and interface refinement—not treating another green test run as proof that the project’s social ambition has been achieved.
