# use60 Proactive Notification System

## The Complete Catalogue

Every notification follows the formula:
**Context + Insight + Draft Action + One-Click Buttons**

---

# PART 1: TIME-TRIGGERED NOTIFICATIONS

## 1.1 Morning Brief (8:00 AM)

**Trigger:** Daily at 8am (user's timezone)

**Data Required:**
- Today's calendar (Calendar integration)
- Open tasks due today (Task Manager)
- Deals closing this week (CRM)
- Overdue follow-ups (CRM + Task Manager)

**Skills Used:**
- Meeting context builder
- Priority scoring

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "☀️ Good morning, Andrew",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Here's your day at a glance*"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📅 *4 meetings today*\n\n• 09:00 - Sarah Chen, Acme Corp _(Proposal stage, £24k)_\n• 11:00 - Team standup\n• 14:00 - Discovery: James Wright, TechFlow\n• 16:00 - Demo: Emma Collins, Brightside"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "⚡ *Top priorities*\n\n• Send ROI calculator to Sarah _(overdue by 1 day)_\n• Prep discovery questions for TechFlow\n• Follow up with Marcus at Zenith _(no contact in 5 days)_"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🎯 *Deals closing this week*\n\n• Acme Corp - £24k _(meeting today)_\n• DataFlow Inc - £18k _(awaiting signature)_"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📋 View Full Day",
            "emoji": true
          },
          "action_id": "view_full_day"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✅ Start Focus Mode",
            "emoji": true
          },
          "action_id": "start_focus_mode"
        }
      ]
    }
  ]
}
```

---

## 1.2 Pre-Meeting Nudge (10 mins before)

**Trigger:** 10 minutes before each external meeting

**Data Required:**
- Meeting details (Calendar)
- Attendee → Contact → Company → Deal (CRM)
- Last meeting summary + action items (Meeting Recorder)
- Open tasks for this contact (Task Manager)
- Recent email activity (Email/CRM)

**Skills Used:**
- Meeting context builder
- Tone of voice (for suggested talking points)

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🔔 Meeting in 10 mins",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Sarah Chen* from *Acme Corp*\n📍 Zoom • 09:00 - 09:45"
      },
      "accessory": {
        "type": "button",
        "text": {
          "type": "plain_text",
          "text": "Join Call",
          "emoji": true
        },
        "url": "https://zoom.us/j/123456",
        "action_id": "join_meeting"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "💰 *Deal Context*\n• £24,000 • Proposal Stage\n• Close date: Jan 15th\n• Champion: Sarah • Decision maker: CFO (not met yet)"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📞 *Last Call (Dec 12th)*\n_\"Discussed budget concerns. Sarah likes the solution but needs to get finance approval. CFO is cautious about new vendors.\"_"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "✅ *You committed to:*\n• Send ROI calculator ⚠️ _(not done)_\n• Share Fintech case study ✓ _(sent Dec 13th)_"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "💡 *Suggested talking points*\n• Check if she reviewed the case study\n• Ask about CFO's specific concerns\n• Offer to present directly to finance team"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📄 View Deal",
            "emoji": true
          },
          "url": "https://crm.com/deals/12345",
          "action_id": "view_deal"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📝 Add Note",
            "emoji": true
          },
          "action_id": "add_note"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "⏰ Snooze 5 mins",
            "emoji": true
          },
          "action_id": "snooze_5"
        }
      ]
    }
  ]
}
```

---

## 1.3 End of Day Recap (6:00 PM)

**Trigger:** Daily at 6pm (user's timezone)

**Data Required:**
- Completed meetings today (Calendar + Recorder)
- Action items created today (Meeting Recorder)
- Tasks completed today (Task Manager)
- Emails sent/received (Email)
- Deal movements (CRM)

**Skills Used:**
- Summary generator
- Priority scoring for tomorrow

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🌙 Your day wrapped up",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Thursday, January 2nd*"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📅 *4 meetings completed*\n\n✓ Sarah Chen, Acme Corp - _Positive, moving to contract_\n✓ Team standup\n✓ James Wright, TechFlow - _Discovery done, demo booked_\n✓ Emma Collins, Brightside - _Needs follow-up on pricing_"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📋 *Action items captured*\n\n• Send contract to Sarah by Friday\n• Book demo with TechFlow for next week\n• Create custom pricing sheet for Brightside\n• _2 items still need tasks created_ ⚠️"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🎯 *Deal progress*\n\n• Acme Corp moved to _Contract_ (+£24k pipeline)\n• TechFlow moved to _Demo Scheduled_"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📬 *Comms*\n• 12 emails sent • 8 replies received\n• 3 proposals opened"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "👀 *Tomorrow preview*\n3 meetings • 2 follow-ups due • 1 proposal expiring"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📝 Create Missing Tasks",
            "emoji": true
          },
          "style": "primary",
          "action_id": "create_tasks"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📅 View Tomorrow",
            "emoji": true
          },
          "action_id": "view_tomorrow"
        }
      ]
    }
  ]
}
```

---

## 1.4 Weekly Pipeline Review (Friday 4:00 PM)

**Trigger:** Every Friday at 4pm

**Data Required:**
- Pipeline by stage (CRM)
- Week-over-week changes (CRM)
- Deals at risk (no activity, slipping close dates)
- Wins and losses this week
- Activity metrics (calls, emails, meetings)

**Skills Used:**
- Pipeline analysis
- Trend detection
- Next week prioritisation

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📊 Weekly Pipeline Review",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Week of Dec 30th - Jan 3rd*"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "💰 *Pipeline Snapshot*\n\n• Total: *£285,000* _(+£42k this week)_\n• Proposal: £86k (4 deals)\n• Negotiation: £124k (3 deals)\n• Closing: £75k (2 deals)"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "🏆 *Won this week*\nDataFlow Inc - £18k"
        },
        {
          "type": "mrkdwn",
          "text": "❌ *Lost this week*\nNone"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "⚠️ *Deals needing attention*\n\n• *Zenith Corp* (£35k) - No activity in 8 days\n• *CloudBase* (£22k) - Close date was yesterday\n• *TechPro* (£15k) - Contact went cold after demo"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📈 *Your activity*\n\n• 18 meetings (vs 14 last week ↑)\n• 45 emails sent (vs 52 last week ↓)\n• 3 proposals sent\n• 12 new leads added"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🎯 *Focus for next week*\n\n1. Close Acme Corp (contract sent)\n2. Re-engage Zenith Corp\n3. Push CloudBase for decision"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📊 Full Report",
            "emoji": true
          },
          "action_id": "full_pipeline_report"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📧 Draft Re-engagement",
            "emoji": true
          },
          "action_id": "draft_reengagement"
        }
      ]
    }
  ]
}
```

---

# PART 2: EVENT-TRIGGERED NOTIFICATIONS

## 2.1 Post-Call Summary + Follow-Up Draft

**Trigger:** Meeting recording processed (usually 2-5 mins after call ends)

**Data Required:**
- Meeting transcript + summary (Meeting Recorder)
- Action items extracted (Meeting Recorder)
- Attendee → Contact → Deal (CRM)
- Tone of voice profile (Skills)

**Skills Used:**
- Summary generator
- Action item extractor
- Tone of voice (for follow-up draft)
- Email composer

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📞 Call completed: Sarah Chen, Acme Corp",
        "emoji": true
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "45 mins • Just now • Recorded via Fathom"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📝 *Summary*\n\nSarah confirmed budget approval from finance. She wants to move forward but needs the contract by Friday for month-end processing. Discussed implementation timeline - they want to go live by Feb 1st. She's bringing in their IT lead for the security review next week."
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "✅ *Action items*\n\n• Send contract by Friday EOD\n• Include security documentation\n• Book call with IT lead (Sarah to send intro)\n• Confirm Feb 1st go-live is feasible"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "💡 *Signals detected*\n\n• 🟢 Strong buying intent\n• 🟢 Budget confirmed\n• 🟡 Timeline pressure (month-end)\n• 🟡 New stakeholder entering (IT)"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📧 *Draft follow-up email*"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "_Hi Sarah,_\n\n_Great speaking with you just now - excited to get this moving!_\n\n_As promised, I'll have the contract and security docs over to you by Friday. I've also flagged internally to confirm our Feb 1st go-live works on our end._\n\n_Looking forward to the intro to your IT lead - just let me know when works for them._\n\n_Speak soon,_\n_Andrew_"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✉️ Send Email",
            "emoji": true
          },
          "style": "primary",
          "action_id": "send_followup"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✏️ Edit First",
            "emoji": true
          },
          "action_id": "edit_followup"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📋 Create Tasks",
            "emoji": true
          },
          "action_id": "create_action_tasks"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "🔄 Update Deal",
            "emoji": true
          },
          "action_id": "update_deal_stage"
        }
      ]
    }
  ]
}
```

---

## 2.2 Proposal/Document Viewed

**Trigger:** Prospect opens proposal/document (from tracking pixel or DocSend-style tool)

**Data Required:**
- Document details (which doc, when sent)
- View data (time on page, pages viewed, repeat views)
- Contact → Deal (CRM)
- Time since sent

**Skills Used:**
- Intent scorer
- Follow-up timing optimizer

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "👀 Proposal viewed",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Sarah Chen* from *Acme Corp* just viewed your proposal"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📄 Acme Corp Proposal v2.pdf • Sent 2 days ago"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "⏱️ *Time spent*\n4 mins 32 secs"
        },
        {
          "type": "mrkdwn",
          "text": "📖 *Pages viewed*\n8 of 12"
        },
        {
          "type": "mrkdwn",
          "text": "🔁 *View count*\n3rd view"
        },
        {
          "type": "mrkdwn",
          "text": "📍 *Most time on*\nPricing (pg 7)"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "💡 *Insight:* She's viewed 3 times and spent the most time on pricing. This suggests she's comparing options or building internal justification. Good time to reach out."
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📞 Call Now",
            "emoji": true
          },
          "style": "primary",
          "action_id": "call_now"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✉️ Send Check-in",
            "emoji": true
          },
          "action_id": "send_checkin"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "⏰ Remind Later",
            "emoji": true
          },
          "action_id": "remind_later"
        }
      ]
    }
  ]
}
```

---

## 2.3 Deal Stage Changed

**Trigger:** Deal moves to new stage in CRM

**Data Required:**
- Deal details (CRM)
- New stage requirements (CRM/Playbook)
- Previous stage activities completed
- Typical next actions for stage

**Skills Used:**
- Sales playbook / stage advisor
- Template selector

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🎯 Deal moved: Acme Corp",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "Moved from *Proposal* → *Contract Negotiation*"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "💰 £24,000 • Close date: Jan 15th • 12 days in previous stage"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "✅ *Completed in Proposal stage*\n• Proposal sent ✓\n• Pricing discussed ✓\n• Decision maker identified ✓\n• Budget confirmed ✓"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📋 *Contract Negotiation checklist*\n\n• ☐ Send contract\n• ☐ Security review (if required)\n• ☐ Legal review (if required)\n• ☐ Negotiate terms\n• ☐ Get signature"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "💡 *Suggested next step*\nSend contract using the standard template. Sarah mentioned month-end deadline so prioritise getting this out today."
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📄 Generate Contract",
            "emoji": true
          },
          "style": "primary",
          "action_id": "generate_contract"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📋 View Checklist",
            "emoji": true
          },
          "action_id": "view_checklist"
        }
      ]
    }
  ]
}
```

---

## 2.4 New Lead Assigned

**Trigger:** Lead assigned to rep in CRM or lead gen tool

**Data Required:**
- Lead details (Lead Gen / CRM)
- Company info (enrichment)
- Similar won deals (CRM)
- Best performing outreach for this segment

**Skills Used:**
- Lead scorer
- Company researcher
- Tone of voice (for outreach draft)

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🆕 New lead assigned",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*James Martinez*\nHead of Sales at TechFlow Inc"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Source: LinkedIn Ad • Assigned just now"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "🏢 *Company*\nTechFlow Inc\n50-100 employees\nSeries A, $8M raised"
        },
        {
          "type": "mrkdwn",
          "text": "🎯 *Fit score*\n87/100\n_Strong ICP match_"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📊 *Why this is a good fit*\n• SaaS company scaling sales team\n• Recently hired 3 SDRs (LinkedIn)\n• Similar to DataFlow (won, £18k)"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📧 *Suggested outreach*"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "_Hi James,_\n\n_Saw TechFlow is scaling the sales team - congrats on the growth!_\n\n_We help SaaS sales teams like yours automate the post-call admin that eats into selling time. Just helped a similar company (DataFlow) save 5 hours per rep per week._\n\n_Worth a quick chat?_\n\n_Andrew_"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✉️ Send Outreach",
            "emoji": true
          },
          "style": "primary",
          "action_id": "send_outreach"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✏️ Edit First",
            "emoji": true
          },
          "action_id": "edit_outreach"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📞 Add to Call List",
            "emoji": true
          },
          "action_id": "add_to_calls"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "🔍 Research More",
            "emoji": true
          },
          "action_id": "research_company"
        }
      ]
    }
  ]
}
```

---

## 2.5 Email Reply Received

**Trigger:** Prospect replies to email (positive, negative, or question)

**Data Required:**
- Email content (Email integration)
- Thread history
- Contact → Deal (CRM)
- Sentiment analysis

**Skills Used:**
- Sentiment analyzer
- Reply composer
- Tone of voice

**Slack Block Template (Positive Reply):**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📬 Reply received",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Sarah Chen* from *Acme Corp* replied to your email"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "🟢 Positive sentiment • Re: Proposal follow-up • Just now"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📧 *Their message*\n\n_\"Hi Andrew, thanks for sending this over. The team reviewed and we're happy to proceed. Can you send the contract? We'd like to get this signed by month end if possible. Also, what does the implementation process look like?\"_"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "💡 *Key points detected*\n• ✅ Ready to proceed\n• 📄 Requesting contract\n• ⏰ Month-end deadline\n• ❓ Question about implementation"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📝 *Suggested reply*"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "_Hi Sarah,_\n\n_Great news - excited to get started!_\n\n_I'll have the contract over to you by end of day today. For implementation, we typically do:_\n\n_Week 1: Kickoff + integrations setup_\n_Week 2: Team training_\n_Week 3: Go-live with support_\n\n_Given your month-end timeline, we can absolutely hit that. I'll include the full implementation plan with the contract._\n\n_Andrew_"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✉️ Send Reply",
            "emoji": true
          },
          "style": "primary",
          "action_id": "send_reply"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✏️ Edit First",
            "emoji": true
          },
          "action_id": "edit_reply"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "🔄 Update Deal Stage",
            "emoji": true
          },
          "action_id": "update_deal"
        }
      ]
    }
  ]
}
```

---

## 2.6 Meeting Booked (Inbound)

**Trigger:** Prospect books meeting via SavvyCal or similar

**Data Required:**
- Meeting details (Calendar)
- Booker info → Company enrichment
- Existing CRM record (if any)
- Source/UTM data (if available)

**Skills Used:**
- Company researcher
- Meeting prep generator

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📅 New meeting booked",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Emma Collins* just booked a discovery call"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "🗓️ Thursday Jan 9th, 2:00 PM • 30 mins • via SavvyCal"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "👤 *Contact*\nEmma Collins\nVP Sales\nemma@brightside.io"
        },
        {
          "type": "mrkdwn",
          "text": "🏢 *Company*\nBrightside\n25-50 employees\nB2B SaaS"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📍 *Source*\nLinkedIn Ad → Landing page → Booked"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🔍 *Quick research*\n• Brightside raised $2M seed in Oct 2024\n• Sales team of 6 (3 AEs, 3 SDRs)\n• Using HubSpot + Outreach\n• Emma previously at Salesforce"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "➕ Create in CRM",
            "emoji": true
          },
          "style": "primary",
          "action_id": "create_crm_record"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "🔍 Full Research",
            "emoji": true
          },
          "action_id": "full_research"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📋 Prep Questions",
            "emoji": true
          },
          "action_id": "prep_questions"
        }
      ]
    }
  ]
}
```

---

## 2.7 Deal Won 🎉

**Trigger:** Deal marked as won in CRM

**Data Required:**
- Deal details (CRM)
- Win history (for comparison)
- Stakeholders involved
- Deal timeline

**Skills Used:**
- Win analyzer
- Handoff document generator

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🎉 Deal Won!",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Acme Corp* - £24,000"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Closed today • 34 days in pipeline • Annual contract"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📊 *Win summary*\n\n• First contact: Dec 1st\n• Meetings held: 4\n• Main champion: Sarah Chen\n• Decision maker: CFO (met once)\n• Key factor: ROI case study"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📈 *Your stats*\n\n• This month: £42k closed (2 deals)\n• This quarter: £124k closed (6 deals)\n• Win rate: 34% (above team avg of 28%)"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📋 *Next steps*\n\n• Handoff to Customer Success\n• Schedule kickoff call\n• Send welcome pack"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📄 Generate Handoff Doc",
            "emoji": true
          },
          "style": "primary",
          "action_id": "generate_handoff"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📅 Book Kickoff",
            "emoji": true
          },
          "action_id": "book_kickoff"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "🎉 Share Win",
            "emoji": true
          },
          "action_id": "share_win"
        }
      ]
    }
  ]
}
```

---

## 2.8 Deal Lost 📉

**Trigger:** Deal marked as lost in CRM

**Data Required:**
- Deal details (CRM)
- Loss reason (if captured)
- Activity history
- Competitor mentioned (if any)

**Skills Used:**
- Loss analyzer
- Re-engagement scheduler

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "📉 Deal Lost",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*CloudBase* - £22,000"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Lost today • 45 days in pipeline • Reason: Went with competitor"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📊 *Deal recap*\n\n• First contact: Nov 20th\n• Meetings held: 3\n• Last activity: Dec 28th (6 days ago)\n• Stalled at: Negotiation stage\n• Competitor: Gong (mentioned in last call)"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "💡 *Analysis*\n\nDeal went quiet after pricing discussion. 6-day gap before loss suggests they were evaluating alternatives. Competitor offers similar features but at enterprise pricing - may have undercut on price."
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🔄 *Re-engagement plan*\n\nSet reminder to check back in 6 months. Competitor implementations often hit issues at 90-day mark."
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📝 Log Loss Reason",
            "emoji": true
          },
          "action_id": "log_loss_reason"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "⏰ Set 6-Month Reminder",
            "emoji": true
          },
          "action_id": "set_reminder"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✉️ Send Graceful Exit",
            "emoji": true
          },
          "action_id": "send_exit_email"
        }
      ]
    }
  ]
}
```

---

# PART 3: DECAY-TRIGGERED NOTIFICATIONS

## 3.1 Follow-Up Reminder (Proposal Sent)

**Trigger:** X days since proposal sent with no reply (configurable, default 2 days)

**Data Required:**
- Proposal send date (Email/CRM)
- View data (if available)
- Contact → Deal (CRM)
- Previous touchpoints

**Skills Used:**
- Follow-up composer
- Tone of voice
- Optimal timing calculator

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "⏰ Follow-up due",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "It's been *2 days* since you sent the proposal to *Sam Wright* at *TechFlow*"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📄 Proposal sent Dec 31st • 👀 Opened 3x • Last viewed yesterday"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "💰 *Deal context*\n• £18,000 • Discovery stage\n• Close date: Jan 20th\n• No blockers identified"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📧 *Suggested follow-up*"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "_Hi Sam,_\n\n_Just checking in on the proposal I sent over. Had a chance to review it with the team?_\n\n_Happy to jump on a quick call if any questions came up - I know pricing structures can sometimes need a walkthrough._\n\n_Would Thursday afternoon work for a 15-min chat?_\n\n_Andrew_"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✉️ Send Now",
            "emoji": true
          },
          "style": "primary",
          "action_id": "send_followup"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✏️ Edit First",
            "emoji": true
          },
          "action_id": "edit_followup"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "⏰ Snooze 1 Day",
            "emoji": true
          },
          "action_id": "snooze_1d"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "⏭️ Skip",
            "emoji": true
          },
          "action_id": "skip"
        }
      ]
    }
  ]
}
```

---

## 3.2 Stale Deal Alert

**Trigger:** No activity on deal for X days (configurable by stage)

**Data Required:**
- Deal details (CRM)
- Last activity (CRM)
- Days in current stage
- Typical stage duration (historical)

**Skills Used:**
- Risk scorer
- Re-engagement composer
- Tone of voice

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "⚠️ Deal going cold",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Zenith Corp* - No activity in *8 days*"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "💰 £35,000 • Negotiation stage • Close date: Jan 10th (5 days away)"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📊 *Activity timeline*\n\n• Dec 20th - Sent revised pricing\n• Dec 22nd - They opened email (no reply)\n• Dec 26th - You sent check-in (no reply)\n• _8 days of silence..._"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "💡 *Analysis*\n\nSilence started after revised pricing. They may be comparing with competitors or waiting for budget approval. Holiday period may also be a factor."
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📧 *Re-engagement options*"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Option A: Value nudge*\n_\"Hi Marcus, wanted to share a quick case study from a company similar to Zenith - they saw 40% time savings in month one...\"_\n\n*Option B: Direct check-in*\n_\"Hi Marcus, just wanted to check if the revised pricing works for your budget? Happy to discuss alternatives if needed...\"_\n\n*Option C: Break-up email*\n_\"Hi Marcus, I haven't heard back so I'll assume the timing isn't right. I'll close this out on my end but feel free to reach out when you're ready...\"_"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📧 Send Option A",
            "emoji": true
          },
          "action_id": "send_option_a"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📧 Send Option B",
            "emoji": true
          },
          "action_id": "send_option_b"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📞 Call Instead",
            "emoji": true
          },
          "action_id": "call_instead"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "⏰ Snooze 3 Days",
            "emoji": true
          },
          "action_id": "snooze_3d"
        }
      ]
    }
  ]
}
```

---

## 3.3 Task Overdue

**Trigger:** Task past due date

**Data Required:**
- Task details (Task Manager)
- Related contact/deal (CRM)
- Original context (why was this created)

**Skills Used:**
- Task prioritizer
- Quick action suggester

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚨 Overdue task",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Send ROI calculator to Sarah*\nDue: Yesterday • Acme Corp"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Created from call on Dec 12th • Deal closing Jan 15th"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📝 *Context*\n_From your call notes: \"Sarah needs ROI calculator to build business case for CFO. She's meeting finance team next week.\"_"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✅ Mark Done",
            "emoji": true
          },
          "style": "primary",
          "action_id": "mark_done"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📅 Reschedule",
            "emoji": true
          },
          "action_id": "reschedule"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📄 Find Calculator",
            "emoji": true
          },
          "action_id": "find_asset"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✉️ Send with Apology",
            "emoji": true
          },
          "action_id": "send_with_apology"
        }
      ]
    }
  ]
}
```

---

## 3.4 Contact Going Cold

**Trigger:** No touchpoint with contact for X days (configurable, default 14 days)

**Data Required:**
- Contact details (CRM)
- Last activity (CRM)
- Relationship strength score
- Previous conversation topics

**Skills Used:**
- Re-engagement composer
- Tone of voice
- Relevance finder (recent news, triggers)

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🥶 Contact going cold",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*David Kumar* at *Nexus Systems*\nNo contact in *21 days*"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Last touch: Email Dec 12th • No active deal • Previous: Lost to budget"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📰 *Recent triggers*\n\n• Nexus Systems announced Series B ($15M) last week\n• David posted about \"scaling sales ops\" on LinkedIn\n• They're hiring 2 Account Executives"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📧 *Re-engagement message*"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "_Hi David,_\n\n_Congrats on the Series B - that's huge! Saw you're scaling the sales team too._\n\n_I know budget was tight when we last spoke, but with the new funding, might be worth revisiting how we can help the team hit the ground running as you grow._\n\n_Coffee catch-up sometime?_\n\n_Andrew_"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✉️ Send Message",
            "emoji": true
          },
          "style": "primary",
          "action_id": "send_reengagement"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✏️ Edit First",
            "emoji": true
          },
          "action_id": "edit_message"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "👋 Connect on LinkedIn",
            "emoji": true
          },
          "action_id": "linkedin_connect"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "😴 Let Sleep",
            "emoji": true
          },
          "action_id": "let_sleep"
        }
      ]
    }
  ]
}
```

---

## 3.5 Quote/Proposal Expiring

**Trigger:** X days before proposal expiry date

**Data Required:**
- Proposal details (CRM/Docs)
- Expiry date
- View activity
- Contact → Deal (CRM)

**Skills Used:**
- Urgency composer
- Tone of voice

**Slack Block Template:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "⏳ Proposal expiring soon",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*DataFlow Inc* proposal expires in *3 days*"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "💰 £18,000 • Sent 11 days ago • Expires Jan 5th"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "👀 *Activity*\n• Opened 5 times\n• Last viewed: 2 days ago\n• Most viewed section: Pricing"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📧 *Urgency nudge*"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "_Hi Rachel,_\n\n_Quick heads up - the proposal I sent over expires on Friday. Wanted to check if you had any final questions before then?_\n\n_If you need more time to decide, just let me know and I can extend it - no pressure._\n\n_Andrew_"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✉️ Send Reminder",
            "emoji": true
          },
          "style": "primary",
          "action_id": "send_reminder"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📞 Call Instead",
            "emoji": true
          },
          "action_id": "call_instead"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📅 Extend 7 Days",
            "emoji": true
          },
          "action_id": "extend_proposal"
        }
      ]
    }
  ]
}
```

---

# PART 4: IMPLEMENTATION GUIDE

## Trigger Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TRIGGER ENGINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    CRON      │  │   WEBHOOKS   │  │   POLLING    │          │
│  │  (scheduled) │  │   (events)   │  │   (decay)    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                   │
│         ▼                 ▼                  ▼                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   TRIGGER ROUTER                         │   │
│  │   • Evaluate conditions                                  │   │
│  │   • Check user preferences (DND, frequency caps)         │   │
│  │   • Deduplicate (don't spam same deal)                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  CONTEXT BUILDER                         │   │
│  │   • Fetch data from integrations                         │   │
│  │   • Enrich with CRM data                                 │   │
│  │   • Generate drafts using skills                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 SLACK BLOCK BUILDER                      │   │
│  │   • Select template                                      │   │
│  │   • Populate with context                                │   │
│  │   • Add action buttons                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SLACK API                             │   │
│  │   • Send to user's DM or channel                         │   │
│  │   • Handle button callbacks                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integration Requirements Matrix

| Notification | CRM | Calendar | Recorder | Tasks | Email | Enrichment |
|--------------|-----|----------|----------|-------|-------|------------|
| Morning Brief | ✓ | ✓ | - | ✓ | - | - |
| Pre-Meeting Nudge | ✓ | ✓ | ✓ | ✓ | - | - |
| End of Day Recap | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| Weekly Pipeline | ✓ | ✓ | - | - | ✓ | - |
| Post-Call Summary | ✓ | - | ✓ | - | - | - |
| Proposal Viewed | ✓ | - | - | - | ✓ | - |
| Deal Stage Changed | ✓ | - | - | - | - | - |
| New Lead Assigned | ✓ | - | - | - | - | ✓ |
| Email Reply | ✓ | - | - | - | ✓ | - |
| Meeting Booked | ✓ | ✓ | - | - | - | ✓ |
| Deal Won | ✓ | - | - | - | - | - |
| Deal Lost | ✓ | - | - | - | - | - |
| Follow-Up Due | ✓ | - | - | - | ✓ | - |
| Stale Deal | ✓ | - | - | - | - | - |
| Task Overdue | ✓ | - | - | ✓ | - | - |
| Contact Cold | ✓ | - | - | - | - | ✓ |
| Proposal Expiring | ✓ | - | - | - | ✓ | - |

---

## Skills Required

| Skill | Used By | Description |
|-------|---------|-------------|
| Tone of Voice | All drafts | User's writing style for emails/messages |
| Meeting Context Builder | Pre-meeting, Post-call | Aggregates multi-source context |
| Summary Generator | Post-call, EOD recap | Condenses transcripts/activity |
| Action Item Extractor | Post-call | Pulls commitments from transcripts |
| Email Composer | Follow-ups, Replies | Drafts contextual emails |
| Priority Scorer | Morning brief, Tasks | Ranks by urgency/importance |
| Risk Scorer | Stale deals | Identifies at-risk deals |
| Company Researcher | New leads, Cold contacts | Enrichment + trigger finding |
| Intent/Sentiment Analyzer | Email replies, Calls | Detects buying signals |
| Pipeline Analyzer | Weekly review | Trends + comparisons |

---

## User Preferences (Configurable)

```yaml
notifications:
  # Global settings
  timezone: "Europe/London"
  quiet_hours:
    start: "20:00"
    end: "08:00"
  weekend_notifications: false
  
  # Time-triggered
  morning_brief:
    enabled: true
    time: "08:00"
    include_pipeline: true
  
  end_of_day:
    enabled: true
    time: "18:00"
  
  pre_meeting:
    enabled: true
    minutes_before: 10
  
  weekly_review:
    enabled: true
    day: "friday"
    time: "16:00"
  
  # Event-triggered
  post_call_summary:
    enabled: true
    auto_draft_followup: true
  
  new_lead:
    enabled: true
    auto_research: true
  
  deal_stage_changed:
    enabled: true
  
  email_reply:
    enabled: true
    positive_only: false
  
  proposal_viewed:
    enabled: true
    minimum_views: 2  # Don't notify on first view
  
  # Decay-triggered
  follow_up_reminder:
    enabled: true
    days_after_proposal: 2
    days_after_email: 3
  
  stale_deal_alert:
    enabled: true
    days_by_stage:
      discovery: 7
      demo: 5
      proposal: 3
      negotiation: 3
  
  task_overdue:
    enabled: true
    reminder_frequency: "daily"
  
  contact_going_cold:
    enabled: true
    days_inactive: 14
  
  proposal_expiring:
    enabled: true
    days_before: 3

# Frequency caps
caps:
  max_notifications_per_hour: 5
  max_notifications_per_day: 20
  cooldown_same_deal_minutes: 60
```

---

## Implementation Priority

### Phase 1: Foundation (Week 1-2)
1. **Trigger engine** - cron, webhook listener, polling scheduler
2. **Slack integration** - block builder, action handler
3. **Morning brief** - proves daily value immediately
4. **Pre-meeting nudge** - high-value, uses existing integrations

### Phase 2: Event-Driven (Week 3-4)
5. **Post-call summary** - the hero notification
6. **Email reply detection** - high urgency moments
7. **Deal stage changed** - workflow automation

### Phase 3: Decay Detection (Week 5-6)
8. **Follow-up reminders** - prevents deals slipping
9. **Stale deal alerts** - proactive pipeline hygiene
10. **Task overdue** - accountability

### Phase 4: Polish (Week 7-8)
11. **End of day recap** - bookend with morning brief
12. **Weekly pipeline review** - manager-ready reports
13. **User preferences UI** - full customisation
14. **Analytics** - which notifications drive action

---

## Success Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Notification open rate | >80% | Are they valuable? |
| Action button click rate | >40% | Are drafts good enough? |
| "Send Now" vs "Edit First" | 60/40 | Draft quality indicator |
| Snooze rate | <15% | Timing accuracy |
| Skip rate | <10% | Relevance |
| Time to action (after notification) | <5 mins | Friction reduction |
| Follow-ups sent via use60 | >50% | Workflow adoption |
| Deals touched by notification | >80% | Coverage |

---

## The Flywheel Effect

```
Better notifications → More actions taken → Better outcomes tracked
         ↑                                           │
         │                                           ▼
  AI learns what works ← ─ ─ ─ ─ ─ ─ ─ ─ ─  More training data
```

Track which notification types lead to:
- Replies received
- Meetings booked
- Deals progressed
- Deals won

Use this to optimise timing, messaging, and prioritisation.