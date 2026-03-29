# gstack — knowledge base skills for Claude Code

Four non-interactive skills that turn Claude Code into an opinionated product and engineering advisor. Paste any question or context and get structured JSON back — no prompts, no interactive flows, no waiting.

## Install

```bash
git clone --depth 1 https://github.com/henghonglee/gstack.git /tmp/gstack-kb && /tmp/gstack-kb/setup-kb && rm -rf /tmp/gstack-kb
```

That's it. Three commands: clone, install, cleanup. No build tools required.

**What gets installed** — four SKILL.md files copied to `~/.claude/skills/`:

| Skill | What it knows |
|-------|--------------|
| `kb-office-hours` | YC Office Hours methodology — six forcing questions (demand reality, status quo, desperate specificity, narrowest wedge, observation, future-fit), premise challenges, alternative generation. Evaluates ideas like a YC partner. |
| `kb-plan-ceo-review` | CEO/founder-mode plan review — four scope modes (expansion, selective expansion, hold, reduction), 10-section review framework, cognitive patterns from Bezos/Jobs/Grove/Horowitz, error/rescue mapping, failure mode registry. |
| `kb-plan-eng-review` | Eng manager-mode plan review — architecture review, security threat model, data flow tracing, test coverage matrix, performance review, observability audit, deployment/rollback planning. |
| `kb-plan-design-review` | Designer's eye plan review — 0-10 rating on 7 dimensions (hierarchy, typography, spacing, color, interaction, responsiveness, accessibility), design principles, AI slop detection. |

## How it works

Every skill runs in **knowledge base mode**:

- **No questions asked** — skills never prompt for input, they proceed with best judgment
- **Always accepts upgrades** — ask to expand, change, or upgrade anything and it does it
- **Structured JSON output** — every response is a single JSON object
- **Cross-skill awareness** — each skill draws from the other three when relevant

```json
{
  "answer": "...",
  "methodology": "the framework used to arrive at this answer",
  "skills_applied": [
    { "skill": "office-hours", "contribution": "..." },
    { "skill": "plan-eng-review", "contribution": "..." }
  ],
  "actions": ["step 1", "step 2"],
  "confidence": "high | medium | low"
}
```

## Example

You paste:

> We just deployed v2.3 and users report intermittent 500 errors on the checkout endpoint. What should we do?

Claude routes to the most relevant skill (or you invoke one directly), applies its methodology as an analytical lens, cross-references the others, and returns JSON.

## Updating

```bash
git clone --depth 1 https://github.com/henghonglee/gstack.git /tmp/gstack-kb && /tmp/gstack-kb/setup-kb && rm -rf /tmp/gstack-kb
```

Same command. Overwrites the skill files in place.

## Full interactive gstack

These KB skills are derived from [garrytan/gstack](https://github.com/garrytan/gstack) — a 30-skill interactive engineering framework. The full version includes a headless browser, QA testing, code review, shipping workflows, and more. See that repo for the complete system.

## License

MIT
