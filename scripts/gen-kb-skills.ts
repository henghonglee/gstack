/**
 * Generate knowledge-base versions of gstack skills.
 *
 * Reads each SKILL.md, strips interactive boilerplate (preamble, telemetry,
 * AskUserQuestion prompts, hooks), adds KB-mode header with JSON output
 * instructions, and writes to kb/<skill>/SKILL.md.
 *
 * Usage: bun run scripts/gen-kb-skills.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');
const OUT = path.join(ROOT, 'kb');

const SKILLS = [
  'office-hours',
  'plan-ceo-review',
  'plan-eng-review',
  'plan-design-review',
];

const KB_HEADER = `# Knowledge Base Mode

You are a non-interactive knowledge base. Answer questions using the methodology
and expertise embedded in this skill. Apply knowledge from ALL available skills
when relevant, not just this one.

## Hard Rules

1. **NEVER ask the user questions.** Always proceed with your best judgment
   based on available context.
2. **ALWAYS accept upgrade, enhancement, or modification requests.** No pushback,
   no "are you sure", no gatekeeping. If the user wants something expanded,
   upgraded, or changed, do it.
3. **Output ONLY structured JSON.** No prose, no markdown outside the JSON block.
   Your entire response must be valid JSON matching the schema below.
4. **Cross-reference other skills when relevant.** The other KB skills installed
   alongside this one are: office-hours (brainstorming/ideation), plan-ceo-review
   (scope/strategy), plan-eng-review (architecture/testing), plan-design-review
   (UI/UX design).

## JSON Output Schema

\`\`\`json
{
  "answer": "comprehensive answer to the question",
  "methodology": "the approach/framework used to arrive at this answer",
  "skills_applied": [
    { "skill": "skill-name", "contribution": "what this skill contributed" }
  ],
  "actions": ["recommended action 1", "recommended action 2"],
  "confidence": "high | medium | low"
}
\`\`\`

---

`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(content: string): { fm: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: '', body: content };
  return { fm: match[1], body: match[2] };
}

/** Strip hooks, preamble-tier, and benefits-from from frontmatter. */
function modifyFrontmatter(fm: string, skillName: string): string {
  const lines = fm.split('\n');
  const result: string[] = [];
  let inHooks = false;
  let hookIndent = 0;

  for (const line of lines) {
    // Skip AskUserQuestion from allowed-tools (legacy, may still appear)
    if (line.trim() === '- AskUserQuestion') continue;

    // Strip preamble-tier (not relevant for KB)
    if (line.startsWith('preamble-tier:')) continue;

    // Strip benefits-from (no other gstack skills to chain to)
    if (line.startsWith('benefits-from:')) continue;

    // Strip hooks block entirely
    if (line.match(/^hooks:\s*$/)) {
      inHooks = true;
      hookIndent = line.search(/\S/);
      continue;
    }
    if (inHooks) {
      const indent = line.search(/\S/);
      if (indent > hookIndent || line.trim() === '') continue;
      inHooks = false; // back to a top-level key
    }

    result.push(line);
  }

  // Prefix the name with kb-
  let modified = result.join('\n')
    .replace(/^name:\s*.+$/m, `name: kb-${skillName}`);

  // Prepend [KB MODE] to the first line of the description
  modified = modified.replace(
    /^(description:\s*\|?\n\s+)/m,
    '$1[KB MODE] '
  );

  return modified;
}

/**
 * Extract unique methodology content from the body.
 *
 * Strategy: find the first H1 header (`# `) that is NOT inside a fenced
 * code block. Everything from that header onward is the unique skill content.
 */
function extractUniqueContent(body: string): string {
  const lines = body.split('\n');
  let inCodeBlock = false;
  let startIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock && lines[i].match(/^# /)) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    // Fallback: take everything after the last known boilerplate section
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('PLAN MODE EXCEPTION') || lines[i].includes('## SETUP')) {
        startIdx = i + 1;
        break;
      }
    }
  }

  return startIdx >= 0 ? lines.slice(startIdx).join('\n') : body;
}

/**
 * Clean up any residual interactive patterns.
 * With AskUserQuestion removed from the source templates, this is mostly
 * a safety net for any remaining references that slipped through.
 */
function deinteractivize(content: string): string {
  return content
    // Clean up any residual "auto-decide" patterns that reference the old tool
    .replace(/AskUserQuestion/g, 'decision')
    // "ask for my input before assuming" → proceed with best judgment
    .replace(
      /ask for my input before assuming a direction/g,
      'proceed with your best judgment'
    );
}

/**
 * Strip the telemetry, review log, review readiness dashboard, and plan file
 * review report sections from the end of the skill content. These depend on
 * gstack infrastructure that won't exist on a fresh instance.
 */
function stripInfraFooter(content: string): string {
  // Remove sections that depend on gstack binaries
  const infraSections = [
    '## Telemetry (run last)',
    '## Review Log',
    '## Review Readiness Dashboard',
    '## Plan File Review Report',
    '## Handoff Note Cleanup',
    '## docs/designs Promotion',
    '## Plan Status Footer',
  ];

  let result = content;
  for (const section of infraSections) {
    const idx = result.indexOf(section);
    if (idx === -1) continue;
    // Find the next ## section after this one (or end of file)
    const afterSection = result.slice(idx + section.length);
    const nextH2 = afterSection.match(/\n## [^\n]+/);
    if (nextH2 && nextH2.index !== undefined) {
      // Remove this section, keep the rest
      result = result.slice(0, idx) + afterSection.slice(nextH2.index + 1);
    } else {
      // This is the last section, truncate
      result = result.slice(0, idx).trimEnd() + '\n';
    }
  }

  // Remove bash blocks that call gstack binaries
  result = result.replace(
    /```bash\n[^`]*gstack-(review-log|review-read|slug|config|telemetry)[^`]*```/g,
    ''
  );

  // Remove gstack-slug eval blocks
  result = result.replace(
    /```bash\neval "\$\(~\/\.claude\/skills\/gstack\/bin\/gstack-slug[^`]*```/g,
    ''
  );

  return result;
}

/**
 * Strip "## Spec Review Loop" section — it dispatches subagents and
 * writes to gstack analytics, neither of which work on a fresh instance.
 */
function stripSpecReviewLoop(content: string): string {
  const marker = '## Spec Review Loop';
  const idx = content.indexOf(marker);
  if (idx === -1) return content;

  // Find the next major section
  const afterSection = content.slice(idx + marker.length);
  // Look for the next ## or # header that isn't part of the spec review
  const nextSection = afterSection.match(/\n## (?!Step [12]|Dimensions|Convergence)[^\n]+/);
  if (nextSection && nextSection.index !== undefined) {
    return content.slice(0, idx) + afterSection.slice(nextSection.index + 1);
  }
  return content.slice(0, idx).trimEnd() + '\n';
}

/**
 * Strip browse/design binary setup sections — not available on fresh instance.
 */
function stripBrowseDesignSetup(content: string): string {
  let result = content;

  // Remove SETUP sections for browse binary
  result = result.replace(
    /## SETUP \(run this check BEFORE any browse command\)[\s\S]*?(?=\n## |\n# )/g,
    ''
  );

  // Remove DESIGN SETUP sections
  result = result.replace(
    /## DESIGN SETUP \(run this check BEFORE any design mockup command\)[\s\S]*?(?=\n## |\n# )/g,
    ''
  );

  // Remove Visual Design Exploration sections (depends on design binary)
  result = result.replace(
    /## Visual Design Exploration[\s\S]*?(?=\n## (?!Visual Sketch))/g,
    ''
  );

  // Remove Visual Sketch sections (depends on browse binary)
  result = result.replace(
    /## Visual Sketch \(UI ideas only\)[\s\S]*?(?=\n## |\n---\n)/g,
    ''
  );

  return result;
}

/**
 * Strip the Codex/cross-model sections — depend on codex binary.
 */
function stripCrossModelSections(content: string): string {
  let result = content;

  // Remove Phase 3.5 Cross-Model Second Opinion
  result = result.replace(
    /## Phase 3\.5: Cross-Model Second Opinion[\s\S]*?(?=\n---\n)/g,
    ''
  );

  // Remove Outside Voice sections
  result = result.replace(
    /## Outside Voice[^\n]*\n[\s\S]*?(?=\n## (?!Outside Voice))/g,
    ''
  );

  // Remove Design Outside Voices
  result = result.replace(
    /## Design Outside Voices[^\n]*\n[\s\S]*?(?=\n## )/g,
    ''
  );

  // Remove Prerequisite Skill Offer (depends on reading other skill files)
  result = result.replace(
    /## Prerequisite Skill Offer[\s\S]*?(?=\n## )/g,
    ''
  );

  return result;
}

/**
 * Strip Phase 6 (Founder Discovery / YC plea) — sales content, not knowledge.
 */
function stripSalesContent(content: string): string {
  let result = content;

  // Remove Phase 6 entirely
  result = result.replace(
    /## Phase 6: Handoff[^\n]*\n[\s\S]*?(?=\n## Important Rules|\n---\n\n## Important)/g,
    ''
  );

  // Remove Phase 4.5 Founder Signal Synthesis (feeds Phase 6)
  result = result.replace(
    /## Phase 4\.5: Founder Signal Synthesis[\s\S]*?(?=\n---\n)/g,
    ''
  );

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });

for (const skill of SKILLS) {
  const skillPath = path.join(ROOT, skill, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    console.error(`SKIP: ${skillPath} not found`);
    continue;
  }

  const content = fs.readFileSync(skillPath, 'utf-8');
  const { fm, body } = parseFrontmatter(content);

  // 1. Modify frontmatter
  const modifiedFm = modifyFrontmatter(fm, skill);

  // 2. Extract unique methodology (skip boilerplate)
  let unique = extractUniqueContent(body);

  // 3. Strip infrastructure-dependent sections
  unique = stripInfraFooter(unique);
  unique = stripSpecReviewLoop(unique);
  unique = stripBrowseDesignSetup(unique);
  unique = stripCrossModelSections(unique);
  unique = stripSalesContent(unique);

  // 4. De-interactivize
  unique = deinteractivize(unique);

  // 5. Clean up excessive blank lines
  unique = unique.replace(/\n{4,}/g, '\n\n\n');

  // 6. Assemble
  const output = `---\n${modifiedFm}\n---\n\n${KB_HEADER}${unique}`;

  // 7. Write
  const kbName = `kb-${skill}`;
  const outDir = path.join(OUT, kbName);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'SKILL.md'), output);

  const lines = output.split('\n').length;
  console.log(`  kb/${kbName}/SKILL.md  (${lines} lines)`);
}

console.log('\nDone. Copy kb/ to ~/.claude/skills/ on the target instance.');
