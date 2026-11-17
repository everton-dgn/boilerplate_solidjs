# SolidJS 2 testing skill

[SKILL.md](SKILL.md) routes by contract and test environment. The references cover the build selection by the plugin, settling, dispose, diagnostics, engine isolation, route cache and the limits of SSR/hydration.

Install it next to [skill-solidjs](../skill-solidjs/SKILL.md), which holds the API contracts. In this repository, the source is in `.agents/skills/` and `.claude/skills/` points to it through a symlink.

Reuse the helpers of the project. The recipes for mounting, capturing and identifying the runtime are alternatives for when that support is missing; they do not require a second infrastructure.

The tests used in the verification do not ship with the skill.
