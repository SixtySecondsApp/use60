export interface ActionItem {
  text: string;
  assignee: string;
  deadline: string;
}

export interface FollowUpEmail {
  subject: string;
  body: string;
}

export interface Capability {
  icon: string;
  label: string;
  detail: string;
}

export interface WalkthroughData {
  meetingCard: {
    date: string;
    title: string;
    prospect: string;
    prospectRole: string;
    prospectCompany: string;
    statusText: string;
  };
  prep: {
    attendeeIntel: string[];
    talkingPoints: string[];
  };
  postMeeting: {
    duration: string;
    summary: string;
    keyPoints: string[];
    actionItems: ActionItem[];
    followUpEmail: FollowUpEmail;
  };
  payoff: {
    headline: string;
    subline: string;
    capabilities: Capability[];
  };
}

export function getWalkthroughData(
  companyName: string,
  products: string[],
  industry: string,
  userName: string
): WalkthroughData {
  const company = companyName?.trim() || "your company";
  const product = products?.[0]?.trim() || "your solution";
  const ind = industry?.trim() || "your industry";
  const user = userName?.trim() || "You";

  const prospectName = "Sarah Chen";
  const prospectRole = "VP Sales";
  const prospectCompany = "NovaTech";

  return {
    meetingCard: {
      date: "Today at 2:00 PM",
      title: `Product Demo — ${company}`,
      prospect: prospectName,
      prospectRole: prospectRole,
      prospectCompany: prospectCompany,
      statusText: "Confirmed",
    },

    prep: {
      attendeeIntel: [
        `${prospectName} has been VP Sales at ${prospectCompany} for 2 years, previously at Salesforce`,
        `${prospectCompany} recently raised a Series B — actively scaling their sales team`,
        `LinkedIn activity suggests ${prospectName} is evaluating tools to reduce admin overhead`,
        `${prospectCompany} operates in ${ind} with a 20-person sales org`,
      ],
      talkingPoints: [
        `Lead with how ${product} saves reps 3+ hours per week on follow-ups and prep`,
        `${prospectName} likely cares about pipeline visibility — show the deal tracking view`,
        `Reference ${prospectCompany}'s growth stage: ${product} scales with headcount, no extra config`,
        `Bring up the AI-generated meeting summaries — her team will stop manually updating the CRM`,
        `Close on a pilot: 2 reps, 30 days, measurable reduction in time-to-follow-up`,
      ],
    },

    postMeeting: {
      duration: "42 min",
      summary: `Strong demo call with ${prospectName} at ${prospectCompany}. She was particularly interested in how ${product} automates follow-up drafts and pre-call prep. The team's biggest pain is reps forgetting to follow up after meetings — ${product} directly solves this. ${prospectCompany} wants to move quickly and is evaluating two other tools.`,
      keyPoints: [
        `${prospectCompany} loses deals due to slow follow-ups — reps too busy post-call`,
        `${prospectName} wants a pilot before board approval — decision expected within 30 days`,
        `Integration with HubSpot is a hard requirement for ${prospectCompany}`,
        `Budget is allocated; procurement process is lightweight at this stage`,
      ],
      actionItems: [
        {
          text: `Send ${prospectName} pricing deck with ${product} pilot terms`,
          assignee: user,
          deadline: "Friday",
        },
        {
          text: `Schedule 30-min technical demo with ${prospectCompany} engineering lead`,
          assignee: prospectName,
          deadline: "Monday",
        },
        {
          text: `Loop in CTO for HubSpot integration discussion with ${prospectCompany}`,
          assignee: user,
          deadline: "Monday",
        },
      ],
      followUpEmail: {
        subject: `Great connecting — next steps for ${prospectCompany}`,
        body: `Hi ${prospectName}, really enjoyed our conversation today — it's clear ${prospectCompany} is at exactly the right stage for what ${product} does best. I'm sending over our pilot terms and pricing so you have everything you need ahead of your internal review. I'll also get the HubSpot integration details from our team so we can address that before your CTO call. Looking forward to making this work for ${prospectCompany}.`,
      },
    },

    payoff: {
      headline: `${company} runs on autopilot`,
      subline: `60 handles everything around your calls so your team focuses on closing.`,
      capabilities: [
        {
          icon: "BarChart3",
          label: "Pipeline",
          detail: "Auto-updated after every call",
        },
        {
          icon: "Mail",
          label: "Follow-ups",
          detail: "Auto-drafted before you hang up",
        },
        {
          icon: "Brain",
          label: "Prep",
          detail: "Auto-generated before every meeting",
        },
        {
          icon: "ListChecks",
          label: "Actions",
          detail: "Auto-tracked from meeting notes",
        },
      ],
    },
  };
}
