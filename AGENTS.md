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

## UI ARCHITECTURE

### General Principles

- Reuse shared UI primitives before creating new components
- Prefer extending existing components over one-off implementations
- Maintain consistency across the application

### Shared UI Components

Every new feature must use these shared components. Do not recreate these behaviors inside feature components:

- `<Modal>` — dialogs, confirmations, forms
- `<Drawer>` — slide-in panels
- `<Dropdown>` — menus, selectors, action lists
- `<Popover>` — hover/click floating content
- `<Tooltip>` — hover hints
- `<Toast>` — notifications, feedback
- `<Autocomplete>` — searchable suggestion lists
- `<Overlay>` — backdrop for modals and drawers

### Layering Rules

- Never use hardcoded z-index values (`9999`, `500`, `100`, etc.)
- Always use global layer tokens from `src/styles/tokens.css`
- If a new layer is needed, add a new token — do not invent a number
- Floating UI must render through a Portal
- Never fix clipping by increasing z-index

### Modal & Drawer Rules

- Use shared Modal and Drawer components only
- Focus trap, Escape key, outside click, and body scroll lock are handled by the shared primitives
- Feature components provide content only — not overlay behavior

### Dropdown / Popover / Autocomplete Rules

- Use shared implementation only
- No manual positioning unless absolutely required
- No duplicated outside-click, keyboard navigation, or portal logic
- Every searchable suggestion list must use `<Autocomplete>`

### CSS Rules

- Avoid unnecessary `overflow`, `transform`, `filter`, `will-change`, `isolation`, or `contain` that creates stacking contexts
- No magic numbers — use design tokens from `src/styles/tokens.css`
- Do not modify overlay opacity globally for one feature — use configurable variants

### Root Cause Policy

When a UI overlap or clipping issue occurs, investigate in this order. Do not immediately increase z-index:

1. Is the component rendered through a Portal?
2. Is it inside a clipping container (`overflow`)?
3. Is there an unexpected stacking context?
4. Is it using the correct shared primitive?
5. Is the layer token correct?

### Code Review Checklist

Before completing any UI feature, verify:

- Uses shared primitives
- No hardcoded z-index values
- No duplicated overlay logic
- No duplicated scroll lock
- No duplicated click-outside handling
- Responsive on desktop and mobile
- Accessible (focus management, keyboard nav, ARIA)
- Does not introduce new stacking-context issues

### Future Development

If a feature cannot be built using the shared primitives:

- Improve the shared primitive
- Do not fork or duplicate it

The architecture should become stronger over time, not more fragmented.

### Architecture First Rule

Never implement a local workaround for a UI problem. If the fix could benefit more than one feature, improve the shared UI primitive instead of patching the individual component.