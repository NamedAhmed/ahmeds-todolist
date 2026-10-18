# Decision 001 — Framework: Next.js vs. Vite + separate backend

Status: **OPEN — awaiting Ahmed's decision**
Date: 2026-09-07

## Why this document exists

Ahmed's constraint: *"I'm not very good at all, I need to be able to write in it myself."*
He asked to see the same feature written both ways rather than take a recommendation on trust.

The feature shown below is the smallest real one this app needs:
**load my tasks from the database, show them, let me check one off.**

Auth and sync are excluded from the sample to keep it readable, but their cost is
discussed at the end — because that is where the two options actually diverge.

---

## Option A — Next.js

### Files you would have

```
todolist/
  app/
    page.tsx              <- the screen you see
    api/tasks/route.ts    <- talks to the database
  lib/db.ts               <- database connection
  .env.local              <- secrets
```

Four files. One project. One deploy.

### `app/page.tsx` — the screen

```tsx
"use client";

import { useEffect, useState } from "react";

type Task = { id: string; title: string; done: boolean };

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);

  // Load tasks when the page opens
  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then(setTasks);
  }, []);

  async function toggle(id: string) {
    // Update the screen immediately, don't wait for the server
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
    await fetch(`/api/tasks/${id}`, { method: "PATCH" });
  }

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id} onClick={() => toggle(task.id)}>
          {task.done ? "[x]" : "[ ]"} {task.title}
        </li>
      ))}
    </ul>
  );
}
```

### `app/api/tasks/route.ts` — the database side

```ts
import { db } from "@/lib/db";

export async function GET() {
  const tasks = await db.select().from(tasksTable);
  return Response.json(tasks);
}
```

That's it. The `/api/tasks` path in the browser code and the folder
`app/api/tasks/` are the same thing — the folder name *is* the URL.

### Deploying

```bash
git push          # Vercel builds and deploys automatically
```

One command. Secrets are pasted into one dashboard.

---

## Option B — Vite + React, with a separate backend

### Files you would have

```
todolist/
  frontend/
    src/App.tsx
    .env                  <- needs to know the backend's URL
    package.json
    vite.config.ts
  backend/
    src/index.ts          <- the server
    src/db.ts
    .env                  <- database secrets
    package.json
```

Two projects. Two `package.json` files. Two `.env` files. Two deploys.

### `frontend/src/App.tsx` — the screen

```tsx
import { useEffect, useState } from "react";

type Task = { id: string; title: string; done: boolean };

// The frontend has no idea where the backend lives, so you must tell it
const API = import.meta.env.VITE_API_URL; // e.g. https://todo-api.fly.dev

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    fetch(`${API}/tasks`, { credentials: "include" }) // <- must send cookies cross-origin
      .then((r) => r.json())
      .then(setTasks);
  }, []);

  async function toggle(id: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
    await fetch(`${API}/tasks/${id}`, {
      method: "PATCH",
      credentials: "include",
    });
  }

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id} onClick={() => toggle(task.id)}>
          {task.done ? "[x]" : "[ ]"} {task.title}
        </li>
      ))}
    </ul>
  );
}
```

The component itself is **almost identical** — that is the honest part. React is React.
The differences are the two extra concerns: `API` and `credentials: "include"`.

### `backend/src/index.ts` — the server

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "./db";

const app = new Hono();

// Without this exact block, the browser silently blocks every request.
// The origin must match your frontend's deployed URL, character for character.
app.use("/*", cors({
  origin: ["http://localhost:5173", "https://my-todolist.vercel.app"],
  credentials: true,
}));

app.get("/tasks", async (c) => {
  const tasks = await db.select().from(tasksTable);
  return c.json(tasks);
});

export default app;
```

### Deploying

```bash
cd frontend && vercel deploy      # deploy 1
cd ../backend && fly deploy       # deploy 2
# then update VITE_API_URL in the frontend to point at the new backend URL
# then add the frontend URL to the backend's CORS list
# then redeploy the frontend
```

---

## The honest scorecard

|  | Next.js | Vite + backend |
|---|---|---|
| Projects to maintain | 1 | 2 |
| Deploys per change | 1 | 1–2 |
| CORS to understand | never | yes, and it fails silently |
| Cookies across origins | not a thing | a real, recurring problem |
| Where secrets live | 1 place | 2 places |
| React code readability | identical | identical |
| First paint (the <1s goal) | HTML arrives with content | blank page, then JS, then content |
| Confusing framework concepts | server vs. client components | none |
| Tutorials / AI help available | enormous | good for React, thin for the glue |

## Where Vite genuinely wins

- **No framework concepts to learn.** There is no "server component," no `"use client"`,
  no build-time vs. request-time distinction. What you write is what runs, in the browser.
- **Faster dev server.** Noticeably snappier hot-reload than Next.
- **The backend is a plain server.** If you ever read a generic Node tutorial, it applies
  directly. Next's API routes are Next-shaped.

## Where Next.js genuinely wins

- **The auth story.** This is the big one, and it is not visible in the sample above.
  With one origin, a login session is an ordinary cookie and it simply works. Split across
  two origins, you are into `SameSite=None`, `credentials: "include"`, third-party cookie
  restrictions in Safari, and a class of bug that presents as "it works on my laptop and
  not on my phone." That is precisely the bug that is miserable to debug while learning.
- **The <1s load target.** Next sends real HTML; Vite sends an empty page plus a script tag.
  Both can be made fast, but Next is fast by default and Vite requires work to match it.
- **One place for everything.** Changing a feature that touches the screen *and* the data
  is one file open next to another, in one editor window, in one repo.

## The concern Next.js deserves

Server vs. client components genuinely confuse people. The mitigation for this project:
**this app is a single interactive screen, so nearly every component is a client component.**
The plan is one server component (the outermost page, which checks you're logged in) and
everything below it plain client React — the same React the Vite version would use.
The confusing boundary exists, but we stand on one side of it.

## Recommendation

**Next.js**, on the grounds that "fewer things that can break in ways I don't understand"
matters more here than "fewer concepts in the framework" — and cross-origin auth bugs are
the worst class of thing to hit while learning.

But this is Ahmed's call. If reading the two `App.tsx` files above made Option B feel
meaningfully clearer, that instinct is worth more than this recommendation.
