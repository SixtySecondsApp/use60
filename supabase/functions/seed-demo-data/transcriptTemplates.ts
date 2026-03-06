// Transcript templates for demo data seeding.
// Placeholder tokens are replaced at seed time by renderTranscript().
//
// Tokens:
//   {{REP_NAME}}      — the sales rep's name
//   {{CONTACT_NAME}}  — the prospect's name
//   {{CONTACT_TITLE}} — the prospect's job title
//   {{COMPANY_NAME}}  — the prospect company name
//   {{REP_COMPANY}}   — always "60"

export interface TranscriptTemplate {
  meetingType: "discovery" | "demo" | "negotiation" | "follow_up" | "closing" | "general";
  title: string;
  durationMinutes: number;
  transcript: string;
}

// ---------------------------------------------------------------------------
// 1. DISCOVERY
// ---------------------------------------------------------------------------
const DISCOVERY_TRANSCRIPT = `{{REP_NAME}}: Hey {{CONTACT_NAME}}, appreciate you making time. How are things going over at {{COMPANY_NAME}}?
{{CONTACT_NAME}}: Pretty hectic honestly. We're heading into Q2 and sales is under the pump to hit some pretty aggressive numbers.
{{REP_NAME}}: Yeah, I hear that a lot right now. Before we get into it — you mentioned in your email that you'd done some reading on {{REP_COMPANY}}. Was there anything specific that caught your eye?
{{CONTACT_NAME}}: Honestly it was the follow-up automation angle. We lose deals because our reps just don't follow up consistently enough. It's a discipline problem but it's also a tooling problem.
{{REP_NAME}}: Can you say more about the tooling side? What are they working with today?
{{CONTACT_NAME}}: We've got HubSpot, which theoretically does sequences, but nobody trusts the data in it. So they're managing their own spreadsheets, their own reminders, totally fragmented.
{{REP_NAME}}: How many reps are we talking?
{{CONTACT_NAME}}: Right now eight quota-carrying reps. We're hoping to get to twelve by end of year if we can prove the model works.
{{REP_NAME}}: And when you say they're doing their own thing — is it that they don't have time to update HubSpot, or they genuinely don't trust it to remind them of the right things?
{{CONTACT_NAME}}: Both. But mostly trust. They put in a note after a call, then the system suggests a follow-up task but it's generic. "Follow up in three days." There's no context, no intelligence around it.
{{REP_NAME}}: Got it. So the ask is really: follow-ups that are contextually aware, not just calendar reminders.
{{CONTACT_NAME}}: Exactly. And tied to something the rep can actually send without spending thirty minutes writing it.
{{REP_NAME}}: Okay. Who owns that problem on your side — is it you, or is this coming from your VP of Sales?
{{CONTACT_NAME}}: My VP, Sarah, is the one who's most vocal about it. She tracks follow-up rates obsessively. I'm the {{CONTACT_TITLE}} so I'm the one who'd actually own the evaluation and rollout.
{{REP_NAME}}: Makes sense. Would Sarah be part of any follow-up conversations or is this your call?
{{CONTACT_NAME}}: She'd want to sign off on anything over about twenty thousand a year. Below that is probably within my discretion.
{{REP_NAME}}: Useful to know. Let me ask — beyond the follow-up piece, are there other parts of the sales workflow that feel broken right now?
{{CONTACT_NAME}}: Meeting prep is another one. Reps go into calls cold. They've got the CRM record open and that's it. No brief, no context on what matters to this person, no intel on the company.
{{REP_NAME}}: Do they have time to prep or is it more that they don't know where to look?
{{CONTACT_NAME}}: Combination. Some of them would do it if it was surfaced to them. Others just don't prioritise it. If it was automated and in front of them an hour before the call, even the lazy ones would use it.
{{REP_NAME}}: What does your current meeting setup look like — mostly inbound demos, or outbound prospecting calls?
{{CONTACT_NAME}}: About sixty percent inbound from marketing, forty percent outbound from SDRs feeding the AEs.
{{REP_NAME}}: And when a deal stalls — like it just goes quiet for two or three weeks — what happens?
{{CONTACT_NAME}}: Usually nothing. Which is the problem. The rep assumes the prospect went cold and moves on. Then the prospect resurfaces six months later annoyed that nobody followed up.
{{REP_NAME}}: Has that cost you deals you could quantify?
{{CONTACT_NAME}}: Sarah's convinced we lost two or three mid-market deals last year to that exact scenario. Hard to put a number on it but she estimates four to five hundred thousand in ARR slippage.
{{REP_NAME}}: That's a meaningful number. If you could get even half of that back with better follow-up, the ROI case writes itself.
{{CONTACT_NAME}}: Yeah, that's basically the pitch we'd need to make internally.
{{REP_NAME}}: Understood. Timeline-wise — is there a reason you're looking at this now versus, say, six months ago?
{{CONTACT_NAME}}: Q1 results were softer than expected. There's appetite to try something new. Budget got unfrozen specifically for sales productivity tooling.
{{REP_NAME}}: Okay, so there's genuine urgency and budget available. Do you have a sense of what range you're working with?
{{CONTACT_NAME}}: We haven't formally scoped it but I'd say somewhere between fifteen and forty thousand annually depending on what we're getting.
{{REP_NAME}}: That's helpful. One more thing — have you looked at any other tools? Or is this more of a fresh exploration?
{{CONTACT_NAME}}: We had a call with Gong last month and we looked at Salesloft briefly. Gong felt like it was built for a bigger company than us. Salesloft had too much we'd never use.
{{REP_NAME}}: Classic problem — tools built for enterprise land on small teams and feel like overkill. That's actually a core thing we think about. Okay, let me tell you what I'm thinking as a next step...
{{CONTACT_NAME}}: Sure, go ahead.
{{REP_NAME}}: I'd love to do a proper walkthrough with you and potentially Sarah. I'll pull together a brief on what that would look like for a team your size — eight to twelve reps, HubSpot existing stack, the follow-up and prep use cases specifically. Does that make sense as a next step?
{{CONTACT_NAME}}: Yeah, that sounds good. Sarah's pretty busy but I can probably get thirty minutes in the next two weeks.
{{REP_NAME}}: Perfect. I'll send you a calendar link and a short prep note. Really appreciate the candour today, {{CONTACT_NAME}} — you've given me a lot to work with.
{{CONTACT_NAME}}: Happy to. Looking forward to seeing what you've got.`;

// ---------------------------------------------------------------------------
// 2. DEMO
// ---------------------------------------------------------------------------
const DEMO_TRANSCRIPT = `{{REP_NAME}}: Great to have you both on. {{CONTACT_NAME}}, good to see you again — and Sarah, really glad you could join.
{{CONTACT_NAME}}: Same here. I've briefed Sarah on what we talked about last time so she's got the context.
Sarah: Yeah, {{CONTACT_NAME}} gave me a rundown. I'll be honest — I've seen a lot of demos in the last two months so I'm going to be pretty direct if that's okay.
{{REP_NAME}}: Please. That's exactly what I want. So let me quickly set the agenda — I want to spend about forty minutes actually showing you the product, then leave twenty for questions. Sound good?
Sarah: Works for me.
{{REP_NAME}}: Okay. Let me start with the moment that matters most for your team: a rep finishes a call. What happens in {{REP_COMPANY}} in the next five minutes. Can I share my screen?
{{CONTACT_NAME}}: Go ahead.
{{REP_NAME}}: So here's a rep's view right after a call ends. The system has pulled the transcript — I'll show you how that gets in there — and it's already drafted a follow-up email. This one took about ninety seconds from call end to draft ready.
Sarah: What's the quality like? Because our reps have tried AI drafts before and they're usually generic garbage.
{{REP_NAME}}: Fair. Let me show you. This draft — it's referencing the specific objection the prospect raised about integration complexity. It's not "thanks for the call, here's a summary." It's addressing the actual conversation.
{{CONTACT_NAME}}: How does it know what was discussed?
{{REP_NAME}}: The transcript. We integrate with your calendar — so we know which calls happened — and then we pull the transcript either from your existing notetaker, or we can record it ourselves. Once we have that text, the AI reads it and extracts the key moments.
Sarah: Do the reps have to do anything to trigger this?
{{REP_NAME}}: Nothing. They finish the call, they get a Slack message or an email — whichever they prefer — with the draft waiting. One click to send, or they can edit it first.
Sarah: Okay. That's actually closer to what I was hoping for. What about meeting prep? {{CONTACT_NAME}} said that was a use case.
{{REP_NAME}}: Yes. Let me jump to that. This is the morning brief — every rep gets this for their calls that day. It shows the company, what they do, any recent news we've pulled, what was discussed on the last call, and a suggested angle for the conversation.
{{CONTACT_NAME}}: Where does the company news come from?
{{REP_NAME}}: We pull from public sources — LinkedIn, news feeds, company blogs. Nothing sketchy, all public data. The idea is to surface things like "this company just raised a Series B" or "their CEO gave an interview about cutting costs" — things that shift how you approach the conversation.
Sarah: How does it handle it when a rep has five calls in a day? Do they get one brief or five?
{{REP_NAME}}: One section per call, all in one brief. They can skim or go deep depending on how important the meeting is. We don't want to create more reading — we want to replace reading with a one-minute scan.
Sarah: I like that. What does the HubSpot integration look like? Because our data in HubSpot is a mess and I don't want the AI pulling wrong context.
{{REP_NAME}}: Good question. The integration is read-only by default — we pull deal stage, contact history, any notes. We don't push anything in unless you want us to. And we display confidence signals — if the last activity in HubSpot was eight months ago, the brief will flag that so the rep knows the context might be stale.
{{CONTACT_NAME}}: Can it write back to HubSpot? Like, can the rep approve the email and have it logged automatically?
{{REP_NAME}}: Yes — that's an optional flow. We can log sent emails back into the deal record. Some teams love it, some prefer to keep {{REP_COMPANY}} and HubSpot separate. It's configurable.
Sarah: What about deals that go dark? You mentioned something about that last time, {{CONTACT_NAME}}.
{{CONTACT_NAME}}: Yeah, deals that go quiet for two weeks.
{{REP_NAME}}: Right. So this is the deal pulse view. Anything that hasn't had meaningful activity — email opened, reply received, call happened — gets flagged here. The rep gets a notification and a suggested re-engagement message. Not just "checking in" — it's based on where the deal was and what might have changed.
Sarah: Show me an example message.
{{REP_NAME}}: Here — this deal went quiet after a pricing conversation. The suggested message acknowledges that, references the specific concern that came up, and asks a soft question to re-open. It doesn't feel like a nudge template.
Sarah: I've seen Gong do something similar but it was more of a manager report than a rep tool.
{{REP_NAME}}: That's a real difference. We're building this for the rep first. The manager gets visibility but the rep is the primary user. The philosophy is: if the rep loves it, they use it, and then the data quality and outcomes follow automatically.
Sarah: How much does it cost for a team our size?
{{REP_NAME}}: For eight reps, all-in, you're looking at around twenty-two thousand a year. That's the follow-up automation, meeting prep, deal pulse — everything I've shown you.
{{CONTACT_NAME}}: That's at the lower end of what we talked about.
Sarah: Is that per seat or a flat fee?
{{REP_NAME}}: Per seat, so it scales cleanly when you grow to twelve reps. The per-seat rate stays the same.
Sarah: What does implementation look like? Because we don't have a big RevOps team.
{{REP_NAME}}: Most teams are live within a week. We connect the calendar, connect HubSpot, and we're ready. No custom build, no data migration. The heaviest lift is usually just getting the reps to try it — which is why we do an onboarding session with the team.
{{CONTACT_NAME}}: Is there a trial period?
{{REP_NAME}}: Yes — two weeks, full access, no credit card upfront. We find teams that do the trial with at least three reps get enough signal to make a real decision.
Sarah: Okay. I have to admit, this is better than I expected. I came in fairly skeptical.
{{REP_NAME}}: I appreciate you saying that. What would make you confident enough to run a trial?
Sarah: I'd want to see one of our actual reps try it on a real deal. Not a sandbox demo.
{{REP_NAME}}: That's exactly the trial. We pick two or three of your reps, connect their real accounts, and they use it on live deals for two weeks.
{{CONTACT_NAME}}: I think we could get two reps to volunteer pretty easily.
Sarah: Yeah. Let's talk about timing after this call.`;

// ---------------------------------------------------------------------------
// 3. NEGOTIATION
// ---------------------------------------------------------------------------
const NEGOTIATION_TRANSCRIPT = `{{REP_NAME}}: Good afternoon {{CONTACT_NAME}}. Thanks for hopping on — I know your schedule's been packed this week.
{{CONTACT_NAME}}: Yeah, it's been a lot. But I wanted to get this sorted before end of month if we can.
{{REP_NAME}}: I'd like that too. Where are we — did you get a chance to review the proposal I sent over?
{{CONTACT_NAME}}: I did, yeah. And I've been back and forth with Sarah and our finance person. Here's where we're at — the product, everyone's happy with. The trial went well. But the number is creating some friction.
{{REP_NAME}}: Tell me about the friction. Is it the total, the structure, or how it compares to what you expected?
{{CONTACT_NAME}}: Mostly the total. Twenty-two thousand feels high compared to what we're spending on other tools. Sarah wanted me to push for eighteen.
{{REP_NAME}}: Okay, I appreciate you being straight with me. Can I ask — where does the eighteen number come from? Is that a hard budget ceiling or more of a target?
{{CONTACT_NAME}}: Honest answer? It's a target. Sarah said "see if you can get it under twenty" and eighteen felt like a reasonable opening.
{{REP_NAME}}: I respect that. Look, I can't get to eighteen — that would require me to go back to my leadership and frankly I don't think I'd get approval. But let me ask you a couple of questions before we talk numbers.
{{CONTACT_NAME}}: Sure.
{{REP_NAME}}: You mentioned you're expecting to grow to twelve reps. Are you thinking that happens this calendar year?
{{CONTACT_NAME}}: We're hoping Q3. Depends on how Q2 goes.
{{REP_NAME}}: What if we structured this as a twelve-seat contract from the start — you only activate eight seats now, but the per-seat rate is lower because we're pricing for the full number? You'd actually save on the per-seat rate and you're locked in at current pricing when you scale.
{{CONTACT_NAME}}: What does that look like numerically?
{{REP_NAME}}: Twelve seats at a slightly reduced rate comes out to about twenty-six thousand annually, but your cost per seat drops from twenty-seven hundred to roughly twenty-two hundred. When you activate those extra four seats, there's no price increase.
{{CONTACT_NAME}}: So we pay more now but save later.
{{REP_NAME}}: You pay slightly more now — twenty-six versus twenty-two — but if you hit twelve reps in Q3, your year-one effective cost per seat is actually lower and year two you're already at the right price point.
{{CONTACT_NAME}}: I hear the logic but Sarah's going to push back on spending more upfront when the growth isn't guaranteed.
{{REP_NAME}}: Fair. Let me offer another option — keep it at eight seats, twenty-two thousand, but I can add a price lock guarantee. If you add seats in the next twelve months you get the same per-seat rate, no questions asked. That protects you without requiring the upfront commitment.
{{CONTACT_NAME}}: That's more interesting. Is that something you can actually commit to?
{{REP_NAME}}: Yes, I can put that in the contract. Lock the per-seat rate for twelve months from signing.
{{CONTACT_NAME}}: Okay. What about payment terms? The proposal said annual upfront. Is there a monthly option?
{{REP_NAME}}: We do offer monthly billing but it's list price, so you'd end up paying about ten percent more over the year — roughly twenty-four thousand versus twenty-two. For most teams the annual upfront actually saves money.
{{CONTACT_NAME}}: What about quarterly? Split into four payments?
{{REP_NAME}}: That I can do at the same annual price. So twenty-two thousand split into four payments of fifty-five hundred. No markup.
{{CONTACT_NAME}}: That actually helps with our cash flow. Finance prefers quarterly.
{{REP_NAME}}: Done. Let me also ask — is there anything else in the proposal that created friction, or is it really just the headline number?
{{CONTACT_NAME}}: The contract length. Twelve months feels long for a tool we've only trialled for two weeks.
{{REP_NAME}}: What length would feel right?
{{CONTACT_NAME}}: Six months with an option to extend.
{{REP_NAME}}: I understand the instinct but six months actually hurts you — the per-seat rate goes up, and the price lock for scaling doesn't apply on a six-month term. What if I offered a twelve-month contract with a sixty-day out clause? If after sixty days the product isn't delivering, you can exit with one billing period notice.
{{CONTACT_NAME}}: A sixty-day out clause on an annual contract?
{{REP_NAME}}: It's a signal that I'm confident you'll stick around. I'm not trying to lock you in — I'm trying to make it easy to say yes today.
{{CONTACT_NAME}}: That's actually pretty compelling. Let me be straight — I think I can get Sarah to sign off on twenty-two thousand annual, quarterly payments, with a sixty-day out and the rate lock on future seats.
{{REP_NAME}}: That works for me. I'll update the proposal and send it over this afternoon. If you can turn around a signature by Friday we can start onboarding next week.
{{CONTACT_NAME}}: Friday should be fine. I'll loop in our legal person — they'll want to look at the out clause language.
{{REP_NAME}}: Understood. I'll make sure the clause is clean and simple — nothing buried. And if your legal team has redlines, send them to me directly and I'll get them turned around fast.
{{CONTACT_NAME}}: Sounds good. One last thing — we talked about the onboarding session. Is that included?
{{REP_NAME}}: Yes, fully included. We do a sixty-minute session with your rep team, I walk them through the workflow live, and we don't let you go live until everyone's comfortable. That's standard.
{{CONTACT_NAME}}: Perfect. Alright, let's get it done. Send me the updated proposal.
{{REP_NAME}}: Will do. Talk Friday, {{CONTACT_NAME}}.`;

// ---------------------------------------------------------------------------
// 4. FOLLOW-UP
// ---------------------------------------------------------------------------
const FOLLOW_UP_TRANSCRIPT = `{{REP_NAME}}: Hey {{CONTACT_NAME}}, good to catch up. It's been — what — three weeks since we last spoke?
{{CONTACT_NAME}}: About that, yeah. Sorry for the radio silence. Things got chaotic internally.
{{REP_NAME}}: No worries at all. What happened?
{{CONTACT_NAME}}: We had a bit of an org change. Sarah — who was going to co-sign this — has moved into a different role. She's still at {{COMPANY_NAME}} but she's not running sales ops anymore.
{{REP_NAME}}: Oh. Who's taken over her remit?
{{CONTACT_NAME}}: Technically it's me now, plus a new VP coming in — Marcus. He starts in three weeks.
{{REP_NAME}}: Okay. That's a significant change. Does Marcus's arrival affect the timeline on this decision?
{{CONTACT_NAME}}: Potentially. I've been told not to make major vendor commitments before he's had a chance to review the stack. Which is a bit frustrating because I was pretty ready to go.
{{REP_NAME}}: I understand. Can I ask — when you say major vendor, is twenty-two thousand in that category or is it more like above a certain threshold?
{{CONTACT_NAME}}: Marcus is coming in as VP of Revenue. He'll want to see anything over fifteen thousand. So yes, technically this is in his lane.
{{REP_NAME}}: Got it. What's your read on him? Have you had any pre-start conversations?
{{CONTACT_NAME}}: One intro call. He seems sharp. He came from a company that used Salesloft heavily so he'll have his own opinions.
{{REP_NAME}}: Worth knowing. Did the name {{REP_COMPANY}} come up?
{{CONTACT_NAME}}: Not directly, but I've mentioned to our mutual contact that we were evaluating something in this space. I think Marcus is open to it.
{{REP_NAME}}: Okay. Here's what I'd suggest — let's not wait three weeks in a vacuum. Can we set something up for Marcus's first week? A thirty-minute intro where I can connect the dots between what you learned in the trial and what he's walking into?
{{CONTACT_NAME}}: I think that's a good call actually. I'll float it to him before he starts. He might appreciate being looped in early rather than having it handed to him on day one.
{{REP_NAME}}: Exactly the right framing. You're doing him a favour by giving him visibility, not asking him to rubber-stamp something he didn't evaluate.
{{CONTACT_NAME}}: I'll send him a note this week.
{{REP_NAME}}: Great. Now — separate from Marcus — where did things land with the two reps who ran the trial? Last we spoke, the feedback was positive but I never got a debrief.
{{CONTACT_NAME}}: Oh right. It was good. Jamie — one of our AEs — she used it on four deals and said the follow-up emails saved her at least two hours a week. Tom was more sceptical but he admitted the meeting briefs were useful.
{{REP_NAME}}: Did Jamie notice any specific deals move because of it?
{{CONTACT_NAME}}: One of them — a prospect that had gone quiet for ten days. She sent the re-engagement email the system drafted and got a reply within an hour. That deal is still active.
{{REP_NAME}}: That's exactly the use case. Would Jamie be comfortable sharing that story if Marcus wanted to hear it?
{{CONTACT_NAME}}: She'd probably be willing, yeah. I'll ask her.
{{REP_NAME}}: That kind of peer-to-peer context is often more convincing than anything I can say. On the action items from last time — I was going to send over a case study from a company similar to yours. Did that come through?
{{CONTACT_NAME}}: I got something but I haven't read it properly.
{{REP_NAME}}: No worries. I'll send a fresh version — shorter, more focused on the deal-recovery use case since that's clearly resonating. One page, easy to forward to Marcus.
{{CONTACT_NAME}}: Perfect. That would be helpful.
{{REP_NAME}}: What else do I need to know? Any other stakeholders who've come into the picture?
{{CONTACT_NAME}}: Finance has been asking about the quarterly payments we discussed. They want to know if there's flexibility on the first payment timing — like, could the first payment land in our new quarter which starts in six weeks?
{{REP_NAME}}: That's a reasonable ask. I can usually accommodate up to a thirty-day delay on the first payment without it affecting the contract start date. Six weeks might push it slightly — let me check with our finance team and come back to you.
{{CONTACT_NAME}}: I appreciate that. It would remove one blocker.
{{REP_NAME}}: Understood. Let me run down the open items so we're aligned: I'm going to send the updated one-pager, check on the payment timing question, and you're going to reach out to Marcus about a first-week meeting and ask Jamie if she'll share her experience. Does that capture it?
{{CONTACT_NAME}}: That's it exactly.
{{REP_NAME}}: Perfect. And just so we're calibrated on timeline — assuming Marcus is open to it and the first-week meeting goes well, when do you realistically see a decision coming?
{{CONTACT_NAME}}: I'd say four to five weeks from now. If Marcus is aligned after the meeting, I don't think there are other blockers.
{{REP_NAME}}: That's clear enough for me to plan around. I'll get you the one-pager by tomorrow and the payment flexibility answer by end of week.
{{CONTACT_NAME}}: Great. Thanks for staying on this, {{REP_NAME}} — I know it's been stop-start.
{{REP_NAME}}: That's the job. Talk soon.`;

// ---------------------------------------------------------------------------
// 5. CLOSING
// ---------------------------------------------------------------------------
const CLOSING_TRANSCRIPT = `{{REP_NAME}}: Marcus, {{CONTACT_NAME}} — thanks for making time. Marcus, really good to finally meet you properly.
Marcus: Likewise. {{CONTACT_NAME}} has given me a lot of context and I've watched the recording of the demo session you did with the team.
{{REP_NAME}}: Oh good — did you have any reactions coming into today?
Marcus: A few. I've used Salesloft and Outreach fairly extensively at my last two companies. This feels different — more AI-native, less workflow-builder. I think that's probably right for where things are going.
{{REP_NAME}}: That's exactly how we think about it. The workflow tools were built in a world where the rep was doing all the thinking. We assume the AI does the thinking and the rep does the approving.
Marcus: I like that framing. My main question coming in was around data ownership and what happens if we leave. Can I ask that upfront?
{{REP_NAME}}: Absolutely. You own all your data — transcripts, emails, all of it. If you cancel, we export everything to CSV within seven days and then delete it from our systems. No lock-in on the data side.
Marcus: Good. And what about the integrations — specifically HubSpot? We're rebuilding our HubSpot architecture over the next quarter. Will that break anything?
{{REP_NAME}}: No, because we use the HubSpot API, not a direct database connection. If your record structure changes, we might need to re-map a few field connections, but that's a twenty-minute conversation with our support team, not a re-implementation.
Marcus: Okay. I'm satisfied on the technical side. {{CONTACT_NAME}}, I'm ready to move forward if you are.
{{CONTACT_NAME}}: I've been ready for three weeks.
{{REP_NAME}}: That's great to hear. Let me make sure we're aligned on the specifics so there are no surprises when the contract lands. Eight seats, twenty-two thousand annually, quarterly payments starting — I confirmed this with our finance team — you can start the contract today and the first payment processes in forty-five days. Is that enough runway?
{{CONTACT_NAME}}: Finance said six weeks ideally but forty-five days is close enough.
{{REP_NAME}}: Perfect. Price-lock on additional seats for twelve months, sixty-day exit clause — those are both in the contract. Is there anything else you need before I send the final version?
Marcus: I want to understand the implementation timeline. We'd want all eight reps live before our Q2 kickoff, which is in four weeks.
{{REP_NAME}}: Four weeks is very doable. Here's how it typically goes — week one, we get the integrations connected, usually takes two to three hours with your IT contact. Week two, we do the rep onboarding session — sixty minutes, hands-on, everyone leaves knowing how to use it. Week three is the first full week of live use and we check in daily for any questions. Week four you're operating independently with us monitoring in the background.
Marcus: Who's our point of contact for implementation?
{{REP_NAME}}: You'll have a dedicated onboarding manager — I'll introduce you over email the day the contract is signed. They own the relationship through your first sixty days. After that you transition to our customer success team.
{{CONTACT_NAME}}: What's response time like if something breaks?
{{REP_NAME}}: For anything production-critical, we target a two-hour response during business hours. For general questions, same-day. You'll have a private Slack channel with our team — most customers get answers in under thirty minutes.
Marcus: That's better than most vendors we work with.
{{REP_NAME}}: We're a small company. When something breaks, it matters to us personally.
Marcus: I appreciate that. {{CONTACT_NAME}}, any other questions on your end?
{{CONTACT_NAME}}: Just one — training materials. Do reps get anything to refer back to?
{{REP_NAME}}: Yes — short video walkthroughs for each core feature, all under five minutes. Plus a quick-reference card we can send before onboarding so reps arrive already oriented. We've found that dramatically reduces the "I forgot how to do X" questions in week one.
{{CONTACT_NAME}}: Smart.
{{REP_NAME}}: Okay. I want to make sure we don't leave this call without a clear next step. If I send the contract today, is there someone in legal who needs to review it before Marcus or {{CONTACT_NAME}} signs?
Marcus: I can sign this myself actually. If the contract is clean, I don't need legal for twenty-two thousand. I'd just want to read it myself.
{{REP_NAME}}: Understood. I'll have it to you by three o'clock today. If you have any questions on the language, call me directly — don't wait for email.
Marcus: Deal. If it looks good, I'll have it back to you by end of day tomorrow.
{{REP_NAME}}: That works perfectly. I'll send the intro to your onboarding manager the moment it's countersigned. You'll be live well before Q2 kickoff.
{{CONTACT_NAME}}: Excellent. Really glad we got here.
{{REP_NAME}}: Me too. It's been a good process. Looking forward to seeing what your team does with it.
Marcus: Thanks {{REP_NAME}}. Talk tomorrow.`;

// ---------------------------------------------------------------------------
// 6. GENERAL (relationship / check-in)
// ---------------------------------------------------------------------------
const GENERAL_TRANSCRIPT = `{{REP_NAME}}: Hey {{CONTACT_NAME}}, good to catch up. How's everything going?
{{CONTACT_NAME}}: Not bad, not bad. It's been a weird quarter. We had our offsite last week which always throws everything off for a few days.
{{REP_NAME}}: Ha, I know the feeling. Where'd you go?
{{CONTACT_NAME}}: Lisbon. Which sounds glamorous but we were in a conference room for most of it.
{{REP_NAME}}: Still beats the office. What was the focus — strategy, team building, or some combination?
{{CONTACT_NAME}}: Revenue planning mostly. Lots of debate about where to focus for the rest of the year. We're at a bit of a crossroads.
{{REP_NAME}}: What kind of crossroads?
{{CONTACT_NAME}}: We've been doing a lot of inbound-led growth and it's plateaued. The question is whether we double down on that or finally build out a proper outbound motion. And if we do outbound, what does that actually look like for a team our size.
{{REP_NAME}}: That's a genuinely hard decision. What's the instinct in the room?
{{CONTACT_NAME}}: Split. Marcus is bullish on outbound because that's where he came from. I'm more cautious — we tried it two years ago and it didn't stick. But the market's changed, the tools are different.
{{REP_NAME}}: The tools really have changed. What killed it two years ago?
{{CONTACT_NAME}}: Honestly? We didn't have good enough data, and the reps hated the manual work. It felt like cold calling with extra steps. Nobody believed it was going to work so they half-assed it.
{{REP_NAME}}: And nobody half-asses something they believe in.
{{CONTACT_NAME}}: Exactly. It becomes a self-fulfilling prophecy.
{{REP_NAME}}: Do you think it's a strategy problem, a data problem, or a rep mindset problem this time?
{{CONTACT_NAME}}: Probably all three, which is why it's hard. But I think the mindset one is most solvable if the tools do enough of the heavy lifting upfront. If the rep is spending two hours on a list that produces three conversations, they'll quit. If the list is built for them and the outreach is mostly drafted, maybe they give it a real shot.
{{REP_NAME}}: That's an interesting framing. How does {{REP_COMPANY}} fit into that picture for you now that you've been using it for a few months?
{{CONTACT_NAME}}: It's changed how the team thinks about follow-up, which was the original use case. But I've been wondering whether it could do anything on the outbound side. Can it help build prospecting briefs, not just prep for inbound calls?
{{REP_NAME}}: Short answer — yes, but it's not the primary use case today. We can pull company context and build an outreach brief for a cold prospect, but it's less refined than the inbound meeting prep. It's something we're actively developing.
{{CONTACT_NAME}}: Is there a way to try it? Like, not a formal project, just have one rep experiment?
{{REP_NAME}}: Absolutely. I can turn on the outbound research feature for your account — it's in beta so it's a bit rougher around the edges, but the output is usable. I'd be curious what your reps think.
{{CONTACT_NAME}}: Jamie would probably be up for it. She's the one who got the most value from the follow-up stuff.
{{REP_NAME}}: Yeah, I remember. She's a good test case — actually uses it rather than just saying she does.
{{CONTACT_NAME}}: Ha, fair point. Are there any companies like us using it for outbound currently?
{{REP_NAME}}: A couple of customers are using it for warm outbound — like, people who've been on the website or attended a webinar. Fully cold prospecting is newer territory. But the underlying research capability is the same.
{{CONTACT_NAME}}: Warm outbound might actually be the right starting point for us anyway. We get a reasonable amount of website traffic that never converts to a demo request. If we could work that list more intelligently...
{{REP_NAME}}: That's almost exactly how one of our other customers described it. They called it "high-intent cold" — people who've shown signal but haven't raised their hand.
{{CONTACT_NAME}}: Yeah. That's actually a better framing than outbound versus inbound. It's more of a spectrum.
{{REP_NAME}}: I'll set up the beta access this week and introduce you to the customer who's been doing this most successfully. A fifteen-minute conversation with them might be worth more than a product walkthrough from me.
{{CONTACT_NAME}}: I'd appreciate that. No hard sell, just learning from someone who's figured it out.
{{REP_NAME}}: Exactly the vibe. Okay — anything else on your plate right now that's keeping you up at night, sales ops wise?
{{CONTACT_NAME}}: Honestly, pipeline visibility. Marcus asks for an update on the pipeline every Monday and I'm still manually pulling stuff out of HubSpot and building a slide. It's twenty minutes I shouldn't be spending.
{{REP_NAME}}: That's solvable. There's a pipeline summary feature in {{REP_COMPANY}} — I don't think we ever activated it for your account. It pulls deal stage, activity recency, and flags anything that looks at risk. Takes about ten minutes to set up.
{{CONTACT_NAME}}: Seriously? That would save me every single Monday.
{{REP_NAME}}: I'll send you the setup link today. It'll be quicker than scheduling a call for it.
{{CONTACT_NAME}}: Perfect. Hey, I appreciate you keeping in touch even when there's nothing specific to sell.
{{REP_NAME}}: That's the point. If the only time I call is when I want something, that's not a relationship.
{{CONTACT_NAME}}: Refreshing attitude. Alright, let's catch up properly next month — maybe when we've had a chance to try the outbound thing.
{{REP_NAME}}: Looking forward to it. Talk soon, {{CONTACT_NAME}}.`;

// ---------------------------------------------------------------------------
// Template array
// ---------------------------------------------------------------------------
export const TRANSCRIPT_TEMPLATES: TranscriptTemplate[] = [
  {
    meetingType: "discovery",
    title: "Discovery Call — {{COMPANY_NAME}}",
    durationMinutes: 35,
    transcript: DISCOVERY_TRANSCRIPT,
  },
  {
    meetingType: "demo",
    title: "Product Demo — {{COMPANY_NAME}}",
    durationMinutes: 55,
    transcript: DEMO_TRANSCRIPT,
  },
  {
    meetingType: "negotiation",
    title: "Pricing & Contract Discussion — {{COMPANY_NAME}}",
    durationMinutes: 40,
    transcript: NEGOTIATION_TRANSCRIPT,
  },
  {
    meetingType: "follow_up",
    title: "Follow-Up Check-In — {{COMPANY_NAME}}",
    durationMinutes: 30,
    transcript: FOLLOW_UP_TRANSCRIPT,
  },
  {
    meetingType: "closing",
    title: "Closing Call — {{COMPANY_NAME}}",
    durationMinutes: 45,
    transcript: CLOSING_TRANSCRIPT,
  },
  {
    meetingType: "general",
    title: "Check-In — {{COMPANY_NAME}}",
    durationMinutes: 25,
    transcript: GENERAL_TRANSCRIPT,
  },
];

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------
export function renderTranscript(
  template: TranscriptTemplate,
  vars: {
    repName: string;
    contactName: string;
    contactTitle: string;
    companyName: string;
    repCompany?: string;
  },
): { title: string; transcript: string; durationMinutes: number; meetingType: string } {
  const repCompany = vars.repCompany ?? "60";

  const replace = (str: string): string =>
    str
      .replace(/\{\{REP_NAME\}\}/g, vars.repName)
      .replace(/\{\{CONTACT_NAME\}\}/g, vars.contactName)
      .replace(/\{\{CONTACT_TITLE\}\}/g, vars.contactTitle)
      .replace(/\{\{COMPANY_NAME\}\}/g, vars.companyName)
      .replace(/\{\{REP_COMPANY\}\}/g, repCompany);

  return {
    title: replace(template.title),
    transcript: replace(template.transcript),
    durationMinutes: template.durationMinutes,
    meetingType: template.meetingType,
  };
}
