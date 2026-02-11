import { parseSkillFile } from './lib/skillParser.js';

async function test() {
  const result = await parseSkillFile('.claude/skills/company-research/SKILL.md');

  console.log('Parsed frontmatter:');
  console.log(JSON.stringify(result.frontmatter, null, 2));

  console.log('\nHas requires_capabilities:', !!result.frontmatter.requires_capabilities);
  console.log('requires_capabilities value:', result.frontmatter.requires_capabilities);
}

test();
