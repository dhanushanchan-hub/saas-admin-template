# SaaS Admin Template

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/saas-admin-template)

![SaaS Admin Template](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/52b88668-0144-489c-dd02-fe620270ba00/public)

<!-- dash-content-start -->

A complete admin dashboard template built with Astro, Shadcn UI, and Cloudflare's developer stack. Quickly deploy a fully functional admin interface with customer and subscription management capabilities.

## TIVA autonomous agent team

This fork adds TIVA HQ: an executive team of Claude-powered agents led by **Hermes**, the Founder's Chief of Staff and 24/7 assistant. It includes a world-class CTO, a CFO, General Counsel, a COO, a CMO, a CRO and more, 14 agents in all. Give a directive from the Command Center (`/admin/command`), the API or OpenClaw. Hermes plans it, the executives work in parallel, and you get one brief with the decisions only you can make. Talk to Hermes by chat or voice at `/admin/hermes`, and install the dashboard as an app on your desktop or iPhone. Routines run around the clock, and every agent learns from the Founder's knowledge base and from the team's past work.

See [docs/AGENT_TEAM.md](docs/AGENT_TEAM.md) for how it works and how to set it up. See [integrations/openclaw-windows](integrations/openclaw-windows/README.md) to connect OpenClaw on a Windows desktop.

## Features

- 🎨 Modern UI built with Astro and Shadcn UI
- 🔐 Built-in API with token authentication
- 👥 Customer management
- 💳 Subscription tracking
- 🚀 Deploy to Cloudflare Workers
- 📦 Powered by Cloudflare D1 database
- ✨ Clean, responsive interface
- 🔍 Data validation with Zod

## Tech Stack

- Frontend: [Astro](https://astro.build)
- UI Components: [Shadcn UI](https://ui.shadcn.com)
- Database: [Cloudflare D1](https://developers.cloudflare.com/d1)
- Deployment: [Cloudflare Workers](https://workers.cloudflare.com)
- Validation: [Zod](https://github.com/colinhacks/zod)

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/d1-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Setup Steps

1. Install dependencies:

```bash
npm install
```

2. Set up your environment variables:

```bash
# Create a .dev.vars file for local development
cp .dev.vars.example .dev.vars
```

Add your API token:

```
API_TOKEN=your_token_here
```

_An API token is required to authenticate requests to the API. You should generate this before trying to run the project locally or deploying it._

3. Create a [D1 database](https://developers.cloudflare.com/d1/get-started/) with the name "admin-db":

```bash
npx wrangler d1 create admin-db
```

...and update the `database_id` field in `wrangler.json` with the new database ID.

4. Run the database migrations locally:

```bash
$ npm run db:migrate
```

Run the development server:

```bash
npm run dev
```

_If you're testing Workflows, you should run `npm run wrangler:dev` instead._

5. Build the application:

```bash
npm run build
```

6. Deploy to Cloudflare Workers:

```bash
npm run deploy
```

7. Run the database migrations remotely:

```bash
$ npm run db:migrate:remote
```

8. Set the founder password (at least 16 characters; every page needs it), your production API token, and your Anthropic API key (the agent team needs the key):

```bash
npx wrangler secret put FOUNDER_PASSWORD
npx wrangler secret put API_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
```

## Usage

This project includes a fully functional admin dashboard with customer and subscription management capabilities. It also includes an API with token authentication to access resources via REST, returning JSON data.

It also includes a "Customer Workflow", built with [Cloudflare Workflows](https://developers.cloudflare.com/workflows). This workflow can be triggered in the UI or via the REST API to do arbitrary actions in the background for any given user. See [`customer_workflow.ts`]() to learn more about what you can do in this workflow.
