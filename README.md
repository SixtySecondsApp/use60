# use60

**Your AI Sales Teammate** — proactive meeting prep, pipeline intelligence, and autonomous CRM actions.

[use60.com](https://use60.com) · [App](https://app.use60.com)

---

## What is use60?

use60 is an AI-powered sales platform that acts as a dedicated teammate for your sales team. It knows your company, your deals, and your contacts — then proactively helps you prepare for meetings, manage your pipeline, and close deals faster.

### Before use60
> *"Help me with my meeting"*
> *"I'd be happy to help! What meeting would you like assistance with?"*

### With use60
> 🤖 *"Hey Sarah! Your TechCorp meeting is in 2 hours. I've prepared a brief with talking points. They're evaluating us against WidgetCo — I have positioning ready."*

## Key Features

| Feature | Description |
|---------|-------------|
| **AI Copilot** | Autonomous sales assistant with persistent memory, powered by Claude |
| **Meeting Intelligence** | Pre-meeting briefs, transcript analysis, auto-generated follow-ups |
| **Pipeline Tracking** | 4-stage deal pipeline with health scoring and stall detection |
| **Smart Tasks** | AI-generated action items from meetings and deal activity |
| **HubSpot Sync** | Two-way contact and deal sync with dynamic table views |
| **Proactive Slack Alerts** | Daily pipeline summaries, pre-meeting prep, deal stall warnings |
| **60 Notetaker** | Bot-based meeting recording with permanent S3 storage |
| **Relationship Health** | Engagement scoring across contacts and accounts |
| **Copilot Lab** | Test and refine AI skills and multi-step sequences |

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| **State** | React Query (server), Zustand (client) |
| **Backend** | Supabase — PostgreSQL, 290+ Edge Functions, RLS, Realtime |
| **AI** | Anthropic Claude (autonomous tool-use), Google Gemini |
| **Auth** | Supabase Auth + Clerk (dual support) |
| **Integrations** | HubSpot, Fathom, Google Calendar, Slack, MeetingBaaS, AssemblyAI |
| **Hosting** | Vercel (frontend), Supabase (backend), AWS S3 (recordings) |

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your Supabase credentials

# Run
npm run dev
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server (port 5175) |
| `npm run dev:staging` | Staging environment |
| `npm run dev:production` | Production environment |
| `npm run build` | Production build |
| `npm run test` | Run tests |
| `npm run playwright` | E2E tests |

## Architecture

```
User Action → React Component → React Query → Service Layer → Supabase → PostgreSQL (RLS)
```

The AI Copilot runs as an autonomous agent:

```
User Message → copilot-autonomous (Edge Function)
  → Context + Memory injection
  → Claude agentic loop (tool_use → execute → result → repeat)
  → SSE stream → Frontend (structured response cards)
```

## Project Structure

```
src/
├── components/       # 158 component directories
│   ├── copilot/      # AI assistant UI
│   ├── platform/     # Skills, sequences, admin
│   └── ui/           # Radix UI primitives
├── lib/
│   ├── copilot/      # Agent orchestration, autonomous executor
│   ├── services/     # API services, memory, sessions
│   ├── hooks/        # React hooks
│   └── stores/       # Zustand stores
├── pages/            # Route components
supabase/
├── functions/        # 290+ edge functions
└── migrations/       # SQL migrations
packages/
└── landing/          # Marketing site (use60.com)
```

## License

MIT
