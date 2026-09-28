# CLAUDE.md

TIVA HQ: an Astro + Cloudflare Workers admin dashboard with the TIVA agent team. See README.md and docs/AGENT_TEAM.md.

## Claude Code toolkit

This repo carries its Claude Code tools in `.claude/` so every session gets them, including cloud sessions from the Claude app and claude.ai/code. docs/CLAUDE_CODE_TOOLKIT.md covers what each tool does and how to update it.

- The skills and Chisle hooks are copies of five upstream repos, pinned in `.claude/toolkit/sources.json`. Don't edit them by hand: change the pin and run `node .claude/toolkit/sync.mjs`.
- Scan any new or updated skill or hook with SkillSpector (the `skill-inspector` skill) before it lands. A finding goes into `.claude/toolkit/skillspector-baseline.yaml` only after someone has read the flagged line, and it carries the reason.

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read `.claude/skills/antislop/SKILL.md` (the core, `antislop.md`) and then the skill for the task:
- UI / visual: `.claude/skills/antislop-ui/SKILL.md`
- Copy & text: `.claude/skills/antislop-copywriting/SKILL.md`
- People: `.claude/skills/antislop-human/SKILL.md`
- Mobile / responsive: `.claude/skills/antislop-layoutmobile/SKILL.md`
- Code comments: `.claude/skills/antislop-code/SKILL.md`
Usage mode in this repo: 1 (DURING), so apply the rules while building. Use mode 2 (AFTER) when the Founder asks for an audit.
To update antislop: `node .claude/toolkit/sync.mjs --latest`, then rescan (docs/CLAUDE_CODE_TOOLKIT.md).
<!-- antislop:end -->
