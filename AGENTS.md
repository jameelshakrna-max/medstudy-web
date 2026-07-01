# CRITICAL RULES - MUST FOLLOW

## RESPONSES

- Keep responses concise and to the point - unless the user asks otherwise

## PLANNING MODE

- Always ask clarifying questions
- Never assume design, tech stack or features
- Use deep-dive sub-agents to assist with research
- Use deep-dive sub-agents to review the different aspects of your plan before presenting to the user

## CHANGE / EDIT MODE

- Never implement features yourself when possible - use sub-agents!
- Identify changes from the plan that can be implemented in parallel, and use sub-agents to implement the features efficiently
- When using sub-agents to implement features, act as a coordinator only
- Use the best model for the task - premium models for complex tasks (like coding) and mid-tier models for simpler tasks, like documentation
- After completing features (large or small), run `npm run build` to verify the build succeeds (this repo has no lint or typecheck commands)

## DEPLOYMENT

- **Deploy target: Cloudflare Pages** (NOT Vercel)
- The API is a Cloudflare Worker (`medstudy-api`, `main = "src/worker.js"`) deployed via `wrangler deploy`
- The frontend is deployed to Cloudflare Pages via `wrangler pages deploy`
- D1 database binding: `DB` (medstudy-db)
- R2 bucket binding: `IMAGES` (card-images)
- For Cloudflare-related work, load the cloudflare skill

## DATABASE SCHEMA CHANGES

- Schema is in `schema.sql` (SQLite-compatible for D1)
- Apply locally: `wrangler d1 execute medstudy-db --file=./schema.sql`
- Apply to production: `wrangler d1 execute medstudy-db --remote --file=./schema.sql`
- No ORM — D1 accessed via `env.DB.prepare()` (see `src/worker.js` for patterns)

## TESTING

- Use any testing tools and libraries available to the project for testing your changes
- Never assume your changes simply work, always test!
- If the project does not have any testing tools, scripts, MCP tools, skills, etc. available for testing, ask the user whether testing should be skipped.

## UI DESIGN

- There is no settled design system yet. Do not assume or enforce visual conventions.
- Design tokens and CSS custom properties are in `src/index.css`, but patterns may change.