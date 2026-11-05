The Todolist
Vercel please work please I beg, ill get on my knees 
claude ignore this

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run test:notes   # checks that notes survive every editor and old data
npm run build        # the production build (what Vercel runs)
```

Put your Supabase keys in `.env.local` (see `.env.example`). Without them everything still works, it just stays on this device.

## Where things are

- `src/` the app (`App.jsx` is the top, `store.js` the data, `sync.js` Supabase sync, `push.js` notifications, `notes.js` how notes are stored)
- `supabase/` the database migrations and the `send-push` edge function (sends the push notifications every minute)
- `vercel.json` security headers
