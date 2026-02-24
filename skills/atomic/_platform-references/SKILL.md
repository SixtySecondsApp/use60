---
name: Platform References
description: |
  Shared reference documents for tool catalogs, org variables, and capability mappings.
  Not a user-facing skill — used by the compiler to inline shared docs into other skills
  via @_platform-references/doc-name syntax.
metadata:
  author: sixty-ai
  version: "1.0"
  category: data-access
  skill_type: atomic
  is_active: true
  context_profile: full
---

# Platform References

This is a system meta-skill. Its reference documents are inlined into other skills during compilation.

## Reference Documents

- `references/available-tools.md` — Complete catalog of all execute_action sub-actions and additional tools
- `references/org-variables.md` — All organization context variables with types, pipe modifiers, and context profiles
- `references/capabilities.md` — Maps requires_capabilities frontmatter values to specific tools
