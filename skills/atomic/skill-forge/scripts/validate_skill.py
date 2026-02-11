#!/usr/bin/env python3
"""
Validate a Claude skill folder for correctness and quality.
Checks structure, frontmatter, description quality, and common mistakes.
"""

import sys
import os
import re
import yaml

class SkillValidator:
    def __init__(self, skill_path):
        self.skill_path = os.path.abspath(skill_path)
        self.errors = []
        self.warnings = []
        self.info = []
        self.frontmatter = None

    def validate(self):
        """Run all validation checks."""
        self._check_folder_structure()
        self._check_skill_md()
        if self.frontmatter:
            self._check_frontmatter_fields()
            self._check_description_quality()
        self._check_body_quality()
        self._check_no_readme()
        self._check_file_sizes()
        return len(self.errors) == 0

    def _check_folder_structure(self):
        """Check folder exists and is named correctly."""
        if not os.path.isdir(self.skill_path):
            self.errors.append(f"Path is not a directory: {self.skill_path}")
            return

        folder_name = os.path.basename(self.skill_path)
        
        # Check kebab-case
        if folder_name != folder_name.lower():
            self.errors.append(f"Folder name must be lowercase: '{folder_name}' → '{folder_name.lower()}'")
        if ' ' in folder_name:
            self.errors.append(f"Folder name must not contain spaces: '{folder_name}'")
        if '_' in folder_name:
            self.warnings.append(f"Folder name should use hyphens, not underscores: '{folder_name}'")
        if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$', folder_name):
            self.warnings.append(f"Folder name should be kebab-case: '{folder_name}'")

        # Check for reserved names
        if 'claude' in folder_name.lower() or 'anthropic' in folder_name.lower():
            self.errors.append(f"Skill names cannot contain 'claude' or 'anthropic' (reserved)")

    def _check_skill_md(self):
        """Check SKILL.md exists and parse frontmatter."""
        skill_md = os.path.join(self.skill_path, 'SKILL.md')
        
        # Check exact filename
        if not os.path.exists(skill_md):
            # Check for common mistakes
            for variant in ['skill.md', 'SKILL.MD', 'Skill.md', 'SKILL.txt']:
                if os.path.exists(os.path.join(self.skill_path, variant)):
                    self.errors.append(f"Found '{variant}' — must be exactly 'SKILL.md' (case-sensitive)")
                    return
            self.errors.append("Missing SKILL.md file (must be exactly 'SKILL.md')")
            return

        with open(skill_md, 'r', encoding='utf-8') as f:
            content = f.read()

        # Parse frontmatter
        fm_match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
        if not fm_match:
            if content.startswith('name:') or content.startswith('description:'):
                self.errors.append("Frontmatter missing '---' delimiters. Wrap YAML in --- ... ---")
            else:
                self.errors.append("No YAML frontmatter found. SKILL.md must start with ---")
            return

        try:
            self.frontmatter = yaml.safe_load(fm_match.group(1))
            if self.frontmatter is None:
                self.errors.append("Frontmatter is empty")
        except yaml.YAMLError as e:
            self.errors.append(f"Invalid YAML in frontmatter: {e}")
            return

        # Check for XML tags in frontmatter
        fm_text = fm_match.group(1)
        if '<' in fm_text or '>' in fm_text:
            self.errors.append("Frontmatter must not contain XML angle brackets (< >)")

        # Store body for later checks
        self.body = content[fm_match.end():]
        self.body_lines = self.body.split('\n')

    def _check_frontmatter_fields(self):
        """Validate required and optional frontmatter fields."""
        fm = self.frontmatter

        # Required: name
        if 'name' not in fm:
            self.errors.append("Missing required field: 'name'")
        else:
            name = str(fm['name'])
            if name != name.lower():
                self.errors.append(f"Name must be lowercase: '{name}'")
            if ' ' in name:
                self.errors.append(f"Name must not contain spaces: '{name}'")
            if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$', name):
                self.warnings.append(f"Name should be kebab-case: '{name}'")

            # Check name matches folder
            folder_name = os.path.basename(self.skill_path)
            if name != folder_name:
                self.warnings.append(f"Name '{name}' doesn't match folder '{folder_name}' — recommended to match")

        # Required: description
        if 'description' not in fm:
            self.errors.append("Missing required field: 'description'")
        else:
            desc = str(fm['description'])
            if len(desc) > 1024:
                self.errors.append(f"Description too long: {len(desc)} chars (max 1024)")

        # Optional field validation
        if 'compatibility' in fm:
            compat = str(fm['compatibility'])
            if len(compat) > 500:
                self.errors.append(f"Compatibility too long: {len(compat)} chars (max 500)")

    def _check_description_quality(self):
        """Assess description quality with actionable feedback."""
        desc = str(self.frontmatter.get('description', ''))
        if not desc:
            return

        # Check for WHAT component
        action_words = ['create', 'generate', 'build', 'analyze', 'manage', 'process', 
                       'handle', 'automate', 'convert', 'format', 'validate', 'review',
                       'setup', 'configure', 'deploy', 'monitor', 'track', 'export',
                       'import', 'transform', 'optimize', 'send', 'fetch', 'search']
        has_what = any(w in desc.lower() for w in action_words)
        if not has_what:
            self.warnings.append("Description may be missing WHAT the skill does — include an action verb")

        # Check for WHEN component
        trigger_indicators = ['use when', 'use for', 'trigger', 'use this', 'activate',
                             'user says', 'user asks', 'user mentions', 'user wants']
        has_when = any(t in desc.lower() for t in trigger_indicators)
        if not has_when:
            self.warnings.append("Description should include WHEN to use it (e.g., 'Use when user asks to...')")

        # Check for vague descriptions
        vague_patterns = [
            (r'^helps? with \w+\.?$', "Too vague — specify what kind of help"),
            (r'^does? \w+ stuff', "Too vague — be specific about what it does"),
            (r'^a skill (for|that)', "Don't start with 'a skill' — describe what it does directly"),
        ]
        for pattern, msg in vague_patterns:
            if re.match(pattern, desc.lower().strip()):
                self.warnings.append(f"Description quality: {msg}")

        # Check description length
        if len(desc) < 50:
            self.warnings.append(f"Description seems short ({len(desc)} chars) — consider adding trigger phrases")
        
        # Positive feedback
        if has_what and has_when and len(desc) >= 80:
            self.info.append("✓ Description includes both WHAT and WHEN — good!")

    def _check_body_quality(self):
        """Check the instruction body for quality signals."""
        if not hasattr(self, 'body'):
            return

        line_count = len(self.body_lines)
        word_count = len(self.body.split())

        if line_count > 500:
            self.warnings.append(f"SKILL.md body is {line_count} lines — consider moving detail to references/")
        if word_count > 5000:
            self.warnings.append(f"SKILL.md is ~{word_count} words — consider progressive disclosure via references/")

        # Check for examples
        if 'example' not in self.body.lower():
            self.warnings.append("No examples found — examples are more effective than abstract rules")

        # Check for error handling
        error_terms = ['error', 'fail', 'troubleshoot', 'issue', 'problem', 'fix']
        if not any(t in self.body.lower() for t in error_terms):
            self.warnings.append("No error handling section found — consider adding troubleshooting guidance")

        self.info.append(f"Body: {line_count} lines, ~{word_count} words")

    def _check_no_readme(self):
        """Check there's no README.md in the skill folder."""
        readme = os.path.join(self.skill_path, 'README.md')
        if os.path.exists(readme):
            self.errors.append("Remove README.md from skill folder — all docs go in SKILL.md or references/")

    def _check_file_sizes(self):
        """Check for oversized files."""
        for root, dirs, files in os.walk(self.skill_path):
            for f in files:
                fpath = os.path.join(root, f)
                size = os.path.getsize(fpath)
                if size > 1_000_000:  # 1MB
                    self.warnings.append(f"Large file ({size/1024:.0f}KB): {os.path.relpath(fpath, self.skill_path)}")

    def report(self):
        """Print validation report."""
        folder_name = os.path.basename(self.skill_path)
        print(f"\n{'='*60}")
        print(f"  Skill Validation: {folder_name}")
        print(f"{'='*60}")

        if self.errors:
            print(f"\n❌ ERRORS ({len(self.errors)}):")
            for e in self.errors:
                print(f"   • {e}")

        if self.warnings:
            print(f"\n⚠️  WARNINGS ({len(self.warnings)}):")
            for w in self.warnings:
                print(f"   • {w}")

        if self.info:
            print(f"\nℹ️  INFO:")
            for i in self.info:
                print(f"   • {i}")

        if not self.errors and not self.warnings:
            print("\n✅ All checks passed — skill looks good!")
        elif not self.errors:
            print(f"\n✅ No errors — {len(self.warnings)} warning(s) to consider")
        else:
            print(f"\n🚫 {len(self.errors)} error(s) must be fixed before upload")

        print()
        return len(self.errors) == 0


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_skill.py <path-to-skill-folder>")
        print("Example: python validate_skill.py ./my-awesome-skill")
        sys.exit(1)

    path = sys.argv[1]
    validator = SkillValidator(path)
    validator.validate()
    success = validator.report()
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
