# Progress Log — Personalized Documentation System V2

## Codebase Patterns
- DocsPage uses ReactMarkdown with remarkGfm and custom component overrides
- Template vars processed via processTemplateVars() before passing to ReactMarkdown
- Docs API uses user-scoped Supabase client with RLS (not service role)
- Articles stored in docs_articles with JSONB metadata column
- Content articles are authored as SQL seeds or via DocsAdminPage CMS
- Integration credentials stored in integration_credentials table (uses organization_id column, NOT org_id)
- User roles stored in organization_memberships table (role column: admin/owner/member)

## Key Decisions
- Conditional blocks ({{#if integration}}) processed BEFORE ReactMarkdown (string preprocessing)
- Skill level blocks (:::beginner) parsed via regex split then rendered as React components
- Org context loaded in a single batch query to minimize DB round trips
- Content stories create articles via DocsAdminPage CMS (not SQL migrations)

---

## Session Log

*No sessions yet*
