---
name: Search Documentation
description: |
  Search the platform documentation to answer questions about features, integrations,
  and how-to guides. Use when a user asks "how do I connect my calendar", "help with
  pipeline setup", "what is deal health scoring", or any question about how the platform works.
  Returns relevant article excerpts with links to full documentation.
metadata:
  category: data-access
  skill_type: atomic
  author: sixty-ai
  version: "2"
  is_active: true
  triggers:
    - pattern: "how do I"
      intent: "how_to_question"
      confidence: 0.80
      examples:
        - "how do I connect my calendar"
        - "how do I set up integrations"
        - "how do I use deal scoring"
    - pattern: "help with"
      intent: "help_request"
      confidence: 0.80
      examples:
        - "help with pipeline setup"
        - "help me understand deal health"
        - "I need help with settings"
    - pattern: "search the docs"
      intent: "doc_search"
      confidence: 0.85
      examples:
        - "search documentation for"
        - "find in docs"
        - "look up in the help center"
    - pattern: "what is"
      intent: "feature_question"
      confidence: 0.75
      examples:
        - "what is deal health scoring"
        - "what does the pipeline view do"
        - "what are smart tasks"
  keywords:
    - "help"
    - "how to"
    - "documentation"
    - "docs"
    - "guide"
    - "tutorial"
    - "what is"
    - "how does"
    - "setup"
    - "instructions"
  required_context: []
  optional_context:
    - user_query
  inputs:
    - name: query
      type: string
      description: "The search query or question to find relevant documentation for"
      required: true
    - name: category
      type: string
      description: "Optional category filter to narrow documentation search"
      required: false
    - name: limit
      type: number
      description: "Maximum number of articles to return"
      required: false
      default: 3
  outputs:
    - name: articles
      type: array
      description: "Array of matching articles with title, slug, excerpt, and category"
    - name: total_results
      type: number
      description: "Total number of matching articles found"
  requires_capabilities:
    - crm
  priority: medium
  execution_mode: sync
  timeout_ms: 10000
  tags:
    - documentation
    - help
    - search
    - self-service
---

# Search Documentation

## Goal
Help users find answers to their questions by searching the platform documentation.

## When to Use
- User asks "how do I..." or "help with..." questions
- User asks about a specific feature or integration
- User needs step-by-step instructions
- User is confused about how something works

## Steps

1. Parse the user's question to extract key search terms
2. Search `docs_articles` using the query:
   ```
   execute_action(search_docs, { query: "${user_query}" })
   ```
3. Return the top 3 most relevant results with:
   - Article title
   - Brief excerpt (first 200 characters of matching section)
   - Link to full article: `/docs#${slug}`

## Output Contract

Return a SkillResult with:
- `data.articles`: Array of `{ title, slug, excerpt, category }`
- `data.total_results`: Number of matching articles

## Response Format

When presenting results to the user:

**Found {count} relevant articles:**

1. **{title}** ({category})
   {excerpt}...
   [Read more](/docs#{slug})

If no results found:
"I couldn't find documentation for that topic. Try browsing the docs at /docs or ask me a more specific question."
