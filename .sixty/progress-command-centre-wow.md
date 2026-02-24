# Progress Log — Command Centre: The Morning Coffee Experience

## Vision
You open it at 8am. 5 tasks waiting, each 80% done. AI watched your meetings, read your emails, scanned your pipeline overnight. Review, refine via conversation, hit send. 5 real sales actions in under 10 minutes.

## Design Decisions
- **Canvas editing**: In-place streaming (Cursor-style) with version undo
- **Execute pattern**: Confirm-then-send (compose preview modal)
- **Chain behavior**: Surface-as-ready (AI pre-works in background)
- **Context panel**: Type-aware (tabs adapt per deliverable type)
- **Sort default**: Urgency score, user-overridable
- **Undo**: Snapshot-based, 10 versions max, Cmd+Z

## Demo Script
1. Open Command Centre → "Good morning, Alex. 5 tasks ready."
2. Click follow-up email → Canvas shows personalized draft with meeting refs
3. Type "add the Meridian case study" → Canvas streams update in-place
4. Approve & Send → Compose preview → Send → "Sent. Follow-up for Thursday."
5. Next chain task surfaces → Internal Slack debrief → Approve → Sent
6. Proposal draft already ready → Refine → Approve
7. 3 tasks shipped in under 8 minutes

## Key Files
- Plan: `.sixty/plan-command-centre-wow.json`
- Bug fix plan: `.sixty/plan-command-centre-audit-fix.json`
- Original plan: `.sixty/plan-command-centre.json`
- Audit: `.sixty/consult/command-centre-audit.md` (if saved)

---

## Session Log

(Ready for execution)
