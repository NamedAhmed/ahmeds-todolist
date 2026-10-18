# Decision log

Running record of every decision made during brainstorming, and what drove it.
Newest decisions at the bottom. Nothing here is implemented yet.

---

## Stack

| Decision | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)** | One project, one deploy, one origin. Cross-origin auth cookies were the deciding factor — they break on mobile, which is a core use case. See [001-framework-comparison.md](001-framework-comparison.md). |
| Teaching mode | **On** | Ahmed asked to be taught as we go. Every Next-specific concept gets a plain-English note in `docs/concepts/`. |
| Language | **TypeScript** | Editor autocomplete and inline error underlining act as guardrails while learning. |
| Styling | **Tailwind v4 + hand-built components** | shadcn/ui explicitly rejected: its look is recognisable as "AI-built SaaS", which fights the core requirement. |
| Animation | **Motion (framer-motion)** | Spring physics, layout animations, and drag all needed. |
| Database | **Neon Postgres** | Free tier: 0.5 GB storage, 100 CU-hours/month. Vastly more than needed. Already connected via MCP. |
| Data architecture | **Local-first** — IndexedDB is the render source, background sync to Neon | The UI must never wait on the network. Also incidentally solves Neon's free-tier cold start (scales to zero after 5 min idle), which would otherwise have caused a visible stall on every first load of the day. |
| Sync model | **Eventual, last-write-wins per task** | Ahmed: "it doesn't have to live update on other screens, just if I change something on my laptop my phone will update it soon enough." Removes the need for a real-time engine or CRDTs. Sync triggers: page load, tab focus, and debounced after a change. |
| Auth | **Clerk**, Google provider | Most readable option; best docs for someone learning. Free to 50,000 retained users/month (raised from 10k in Feb 2026). |
| Hosting | **Vercel** | Free hobby tier; Next.js native. |

**Total running cost at Ahmed's scale: $0.**

---

## Product

| Decision | Choice | Why |
|---|---|---|
| Core identity | Tasks are a **state, not a checkbox** | The app's spine. Every task carries a 0–100% progress value you set by dragging. |
| Progress bar | **Per-task, draggable** | Chosen over a single day-level bar. Real tasks aren't binary; the interface should admit that. |
| Completion | **Both paths** — drag to 100%, or check off early at any % | A task can be 40% done and then simply over. Checkbox remains the fast path for genuinely binary tasks. |
| Completed tasks | **Move to a Completed section — never deleted** | Deleting finished work destroys the only record of what was actually done. |
| Ordering | **Manual, drag to reorder** | Priority is the user's judgement, not a computed score. |
| Due dates | **On every task** | |
| Projects | **A task can become a project; expands in place** | Sub-tasks slide open inline — you never leave your list or lose your place. |
| Project progress | **Parent % derives from children** | OPEN QUESTION: a plain average treats "read chapter 4" and "write the lab report" as equal work. Proposed fix: weight by time estimate. Decide during design. |
| Notes | **Per-task notes + a daily log** | Task notes stay attached to what they're about. The daily log catches thinking that isn't a task. |
| Adding a task | **A permanent blank "ghost" row at the top of the list** | Ahmed's idea, and better than the alternatives — zero activation cost. No button, no modal, no mode change. You just type. |
| Date entry | **Plain-English parsing** (proposed) | `email landlord friday` → task due Friday. Pairs with the ghost row so a task with a date is still one action. |
| Voice | **Dry, sparse, a little mean** | "Six days. We don't have to talk about it." Chosen because no language model writes this by default — it cannot read as AI-generated filler. |
| Voice discipline | **Speaks 4–5 times a day, maximum** | A dry app that quips constantly becomes an annoying app by week two. Silence is the default state. |

---

## Confirmed extras

| Feature | Note |
|---|---|
| **Stale-task callout** | A task at 0% for weeks gets flagged. Only possible because progress is a percentage. Directly targets the reason todo apps become guilt graveyards. |
| **Undo everything (⌘Z)** | Every action reversible. Critical when the primary interaction is dragging. Cheap now, expensive to retrofit — must be designed in from day one. |
| **Time estimates + reality check** | Tells you when today's list doesn't fit in today. Also supplies the weighting for project progress. |
| **Full offline support** | Nearly free given local-first. Needs a service worker and real testing. |
| **Themes, layouts, and modes** | Ahmed's addition. Architecturally significant: the entire visual system must be built on design tokens from the first line of CSS. Cheap now, near-impossible later. |

---

## Still open

- Visual direction (typography, colour, density, light/dark)
- What the theme/layout/mode axes actually are
- Project progress weighting (average vs. time-weighted)
- Whether the daily log is a separate view or attached to the Completed section
