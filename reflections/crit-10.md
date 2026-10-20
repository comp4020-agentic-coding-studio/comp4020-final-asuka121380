# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was recognising that a passing test suite only answers the questions its tests ask. I initially approached C10 as adding logs that could explain who did what. The investigation revealed a first-visit identity race, but the more revealing episode came from a logging fix itself.

To preserve crash messages, the agent introduced synchronous logging. Existing checks passed, yet a subsequent review raised a different question: what happens when nobody reads the output? I requested a targeted investigation. The agent reproduced a blocked server and replaced the approach with a bounded asynchronous queue ([bcd0b2c](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/bcd0b2c)). I accepted that diagnostic records might be lost under overload rather than allowing logging to stop people building together.

## What did this change about who I want to be as a software developer?

I want to become a developer who can explain why evidence is sufficient, rather than someone who equates an agent’s confidence or green checks with completion. My responsibility is not to personally write every line, but to define what must remain true, question the proposed verification, and ensure corrections become tests and harness rules ([23f1746](https://github.com/comp4020-agentic-coding-studio/comp4020-final-asuka121380/commit/23f1746)).

Logs made hidden behaviour easier to investigate, but they did not remove the need for judgement. My two-device test confirmed synchronisation, not meaningful cooperation. I still need to observe whether newcomers understand plans and influence the shared result. Keeping those claims separate is part of the developer I want to become.
