---
name: Slack General Query
namespace: slack
description: |
  Handle general sales Q&A, greetings, help requests, and unclear queries from Slack DM.
  Use as the fallback handler when a Slack message doesn't match a more specific intent:
  greetings, thanks, "what can you do", unclear requests, or off-topic messages. Returns a
  friendly response with suggested commands to guide the user toward useful queries.
metadata:
  author: sixty-ai
  version: "1"
  category: slack-copilot
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - slack
  triggers:
    - pattern: "hello"
      intent: "general_chat"
      confidence: 0.70
      examples:
        - "hi"
        - "hello"
        - "hey"
        - "good morning"
        - "what's up"
    - pattern: "what can you do"
      intent: "help_request"
      confidence: 0.85
      examples:
        - "what can you do?"
        - "how can you help me?"
        - "what do you know?"
        - "help"
        - "show me what you can do"
    - pattern: "thank you"
      intent: "acknowledgement"
      confidence: 0.75
      examples:
        - "thanks"
        - "thank you"
        - "cheers"
        - "great, thanks"
    - pattern: "general question"
      intent: "general_chat"
      confidence: 0.40
      examples:
        - "can you help me with something?"
        - "I have a question"
  keywords:
    - "hi"
    - "hello"
    - "hey"
    - "help"
    - "what can you"
    - "how can you"
    - "thank"
    - "thanks"
    - "cheers"
  required_context:
    - slack_user_id
  inputs:
    - name: raw_query
      type: string
      description: "The original Slack message text"
      required: true
    - name: is_greeting
      type: boolean
      description: "Whether the message is a greeting or acknowledgement"
      required: false
      default: false
  outputs:
    - name: slack_blocks
      type: array
      description: "Slack Block Kit blocks with a help menu or friendly response"
    - name: text
      type: string
      description: "Plain text response for simple cases like greetings"
  requires_capabilities: []
  priority: low
  tags:
    - slack
    - general
    - help
    - fallback
    - greeting
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Slack General Query

## Goal
Handle messages that don't match a specific sales intent — greetings, help requests, thanks, or unclear queries. Always respond in a way that guides the user toward useful capabilities rather than returning empty or confusing responses.

## Intent Patterns

### Greeting / Acknowledgement
Triggered when confidence is low (< 0.5) or message is a greeting/thanks.

Return a friendly, brief plain text response:
- Greeting: "Hey! Ask me about your deals, pipeline, or contacts. Type 'help' to see what I can do."
- Thanks: "Happy to help! Let me know if you need anything else."
- Unclear: Treat as a help request (see below)

### Help Request
Triggered when user asks "what can you do", "help", or similar.

Return a structured help menu showing all available capabilities:

**Response format**:
- Section: "Here's what I can help you with:"
- Section (multi-line):
  ```
  *Pipeline & Deals*
  • "Show my pipeline" — pipeline overview with stage breakdown
  • "Which deals are at risk?" — risk-scored deal alerts
  • "What's happening with [Deal Name]?" — specific deal status

  *Contacts & History*
  • "Who is [Name]?" — contact profile and related deals
  • "When did I last talk to [Name]?" — interaction history
  • "Show my meetings this week" — upcoming calendar

  *Quick Actions*
  • "Draft a follow-up for [Deal]" — AI email drafts
  • "Create a task to [description]" — quick task creation

  *Coaching & Intelligence*
  • "How should I handle [objection]?" — objection advice
  • "How am I doing?" — performance snapshot
  • "How do we beat [Competitor]?" — competitive battlecard
  ```
- Context: "You can ask in natural language — I'll figure out what you need."

### Unclear / Off-topic
Triggered when no other intent matches with sufficient confidence.

Return a short nudge with examples:
- Section: "I didn't quite catch that. Here are some things you can ask me:"
- Bullet list of 3-4 example queries relevant to sales context:
  - "Show my pipeline"
  - "Which deals are at risk?"
  - "Draft a follow-up for [deal name]"
  - "How should I handle price objections?"
- Context: "Or type 'help' for the full list of what I can do."

## Response Constraints

- Greetings and thanks: always plain text — no Block Kit overhead for simple social messages
- Help menu: use sections (not bullet points) for better Slack rendering of multi-line content
- Don't apologise or say "I'm sorry" — stay positive and directive
- Keep help menu scannable — max 3-4 examples per category
- Never say "I don't understand" — always offer a helpful alternative
- Avoid technical terms (intent, entity, classifier) — speak in sales rep language

## Fallback Philosophy

This skill is the safety net. It should:
1. Always return a response (never error or return empty)
2. Guide users toward high-value capabilities
3. Keep responses short — an unclear query means the user needs direction, not a wall of text
4. Match the conversational register of the message (casual greeting → casual response)
