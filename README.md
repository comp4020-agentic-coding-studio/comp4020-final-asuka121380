# Brick Commons

Brick Commons is a browser-based brick-building space inspired by memories of building with friends—and sometimes strangers—as a child. What stayed with me was not simply the finished model, but how building something together could turn unfamiliar people into companions. My definition of good is an experience where people can suggest different ideas, influence a shared creation, and keep something that recalls their time together. Solo building should be worthwhile, but cooperation is the centre of the project.

## A shared building, a shared memory

Cooperation should mean more than finishing faster with extra hands. A roof colour, a garden, or an unusual window can emerge from another person’s suggestion. The resulting building should contain choices that neither player would have made alone.

Players share one finite inventory within a room. Rather than allocating separate supplies and making cooperation depend on transfers, this gives everyone access to the same materials. Plan mode makes suggestions visible directly in the building space: transparent bricks can form a proposed design before anyone spends real stock. Plans obey collision and support rules, but their calculated remaining inventory can go below zero, revealing what the proposed design would need.

Saving a creation and retaining contributor credits support the project’s ambition of shared memory. These records preserve participation; they do not, by themselves, prove that meaningful collaboration occurred.

## Build somewhere, not in a void

The current Beach Houses scene places construction in a colourful coastal neighbourhood. Warm light, nearby houses, and the sea give the work a setting: players add something to a place rather than inspect an isolated model. Neighbouring houses are scenery, not other players’ creations.

The reference house is adapted from the [official LEGO Classic 11035 instructions](https://www.lego.com/en-us/service/building-instructions/11035). It is an optional source of inspiration, not a task to complete. Players can borrow an idea, change its colours, or build something unrelated. Colours do not consume separate stock, and there is no required completion percentage or prescribed appearance.

## Join, build, and keep a creation

Enter as a guest or register an account. Accounts provide a way to return to the same identity across devices; guest access depends on the browser’s session cookie. Build alone, or create or join a shared room. The current shared scene accommodates two players.

Public rooms appear in the lobby; invite-only rooms require admission through an invitation. Admitted collaborators can work on the shared construction, including editing one another’s bricks. Friendship alone does not grant access to a private room.

Players can save creations to their collections and continue from saved versions. Publication remains subject to the work’s permissions. Keeping a shared memory should not mean making someone else’s private creation public.

## What is checked, and what needs judgement

The [harness](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/blob/main/CLAUDE.md) and [tests](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/tree/main/spec) protect inventory, construction rules, permissions, identity handling, command retries, and persistence. Server-side diagnostic logs help explain actions and failures without becoming a public player feed.

My two-device testing confirmed shared-room synchronisation. It did not establish whether newcomers understand the controls, respond to each other’s plans, or recognise their influence in the finished work. Those remain questions for human evaluation.

Survival systems, physical collapse, a vast catalogue, and runtime AI generation are deliberately excluded to keep attention on creative construction.

This is an independent student project, not an official LEGO product.
