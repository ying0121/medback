# Medical Chatbot

An embeddable healthcare chat widget built with React and TypeScript. Clinics can drop it onto any website to offer AI-assisted text and voice conversations, guided intake flows, and live agent handoff via Twilio.

The widget mounts inside a **Shadow DOM** so its styles and scripts stay isolated from the host page (including jQuery and other global libraries).

## Features

### Chat experience
- **Floating launcher bubble** with connection status indicator (connecting / connected / disconnected)
- **Text and voice modes** — type messages or record voice notes (up to 3 minutes) with live waveform visualization
- **Guided topic flows** — pre-built intake paths for common clinic requests (appointments, medications, prescriptions, referrals, test results, letters, clinic info, insurance)
- **User info collection** — name, gender, date of birth, email, phone, and address before or during a session
- **Typing indicators** and animated message rendering
- **Markdown support** for assistant replies
- **Offline / disconnected state** with reconnection handling

### Voice and live agent handoff
- **Twilio Voice SDK** integration for browser-based calls to clinic staff
- Automatic handoff prompt after repeated unanswered exchanges
- In-call UI with mute, duration timer, and call controls
- Backend can signal `twilioIntent` to trigger the calling flow

### Branding and theming
- Clinic profile from backend: name, acronym, greeting, avatar, and brand color
- **16 theme colors** (azure, blue, sky, cyan, teal, emerald, green, lime, yellow, amber, orange, red, rose, pink, purple, violet)
- **Dark and light mode** toggle with cookie persistence
- Theme applied via CSS variables on the widget root

### Session persistence
- Cookies store user info, conversation ID, clinic ID, and color mode
- Sessions are scoped per clinic — switching clinics clears prior session data
- Chat window stays mounted when collapsed so the WebSocket session persists

### Embed-ready architecture
- Production build outputs a single **IIFE bundle** (`medical-chatbot.iife.js`) with no global leakage
- Styles are inlined and scoped to the Shadow DOM host
- Duplicate script injection is safely ignored

## Tech stack

| Layer | Technologies |
|-------|--------------|
| UI | React 18, TypeScript, Tailwind CSS, shadcn/ui (Radix), Framer Motion, Lucide icons |
| Build | Vite 5, `@vitejs/plugin-react-swc` |
| Real-time | Native WebSocket |
| Voice | `@twilio/voice-sdk` |
| Data | TanStack React Query |
| Forms | React Hook Form, Zod |
| Testing | Vitest, Testing Library, jsdom |

## Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- A running **backend** that exposes a WebSocket chat endpoint and (optionally) Twilio token endpoints

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example env file and adjust values for your backend:

```bash
cp .env.example .env
```

See [Environment variables](#environment-variables) below for the full list.

### 3. Start the development server

```bash
npm run dev
```

Open the app at [http://localhost:8080](http://localhost:8080).

The dev server uses `index.html`, which mounts the widget into `#medical-chatbot-root-component` — the same mount point used in production embeds.

## Environment variables

All variables are prefixed with `VITE_` and are baked in at build time.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_BACKEND_URL` | No | Same origin | Base URL for REST calls (Twilio token, call control) and WebSocket host |
| `VITE_WEBSOCKET_PATH` | No | `/ws/chat` | WebSocket path appended to backend URL |
| `VITE_WEBSOCKET_URL` | No | — | Full WebSocket URL override (`ws://` / `wss://`) |
| `VITE_CLINIC_ID` | No | — | Clinic identifier sent on connect and Twilio calls |
| `VITE_TWILIO_TOKEN_PATH` | No | `/api/token` | Backend path to fetch Twilio access token |
| `VITE_TWILIO_STOP_CALL_PATH` | No | `/api/twilio/call/stop` | Backend path to end a call server-side |
| `VITE_TWILIO_MUTE_CALL_PATH` | No | `api/twilio/call/mute` | Backend path to sync mute state |

Example `.env`:

```env
VITE_BACKEND_URL=http://localhost:3000
VITE_WEBSOCKET_PATH=/ws/chat
VITE_CLINIC_ID=your-clinic-id
VITE_TWILIO_TOKEN_PATH=/api/voice/token
VITE_TWILIO_STOP_CALL_PATH=/api/call/stop
VITE_TWILIO_MUTE_CALL_PATH=api/call/mute
```

## Build and deploy

### Production embed build (default)

```bash
npm run build
```

Outputs `dist/medical-chatbot.iife.js` — a single self-contained script for embedding on third-party sites.

### SPA build (local testing)

```bash
npm run build:spa
```

Produces a standard SPA bundle for previewing the full app without the IIFE wrapper.

### Preview a production build

```bash
npm run preview
```

## Embedding on a website (CDN)

After the monorepo is running (`npm start` or `npm run webchat:build`), the widget is published at:

| URL | Purpose |
|-----|---------|
| `https://YOUR_API_HOST/cdn/webchat.js` | **Recommended** CDN script |
| `https://YOUR_API_HOST/webchat/embed.js` | Alias of the same bundle |
| `https://YOUR_API_HOST/cdn/medi-bot.png` | Default avatar asset |

### Script-only embed (recommended)

Clinics only need **one** script tag. The widget injects its own mount `<div>` automatically.

```html
<script
  src="https://YOUR_API_HOST/cdn/webchat.js?clinicId=YOUR_CLINIC_ID"
  defer
></script>
```

Equivalent using a data attribute:

```html
<script
  src="https://YOUR_API_HOST/cdn/webchat.js"
  data-clinic-id="YOUR_CLINIC_ID"
  defer
></script>
```

### Runtime options

Configure via **script URL query**, **script `data-*`**, or (optional) a pre-existing mount div:

| Option | Query / attribute | Description |
|--------|-------------------|-------------|
| Clinic id | `?clinicId=` / `data-clinic-id` | **Required.** Sent on WebSocket connect |
| Backend URL | `?backendUrl=` / `data-backend-url` | Optional API origin (defaults to CDN script origin) |
| WebSocket URL | `?websocketUrl=` / `data-websocket-url` | Optional full `ws://` / `wss://` URL |
| WebSocket path | `?websocketPath=` / `data-websocket-path` | Optional path (default `/ws/chat`) |

The widget will:
1. Locate the CDN `<script>` tag
2. Inject `#medical-chatbot-root-component` if it is missing
3. Attach an open Shadow DOM and render the chat UI
4. Connect WebSocket to the API host (CDN script origin unless overridden)
5. Restore any host-page `window.$` / `window.jQuery` globals after mount

### Server allowlists

When embedding on third-party clinic domains, add those origins to:

- `ALLOWED_WS_ORIGINS` — WebSocket upgrade
- `ALLOWED_ORIGINS` — REST/CORS (if the widget calls HTTP APIs)

### Local IIFE build (without monorepo)

```bash
npm run build
```

Outputs `dist/medical-chatbot.iife.js`. Prefer the monorepo CDN URL above for production.

## Backend integration

### WebSocket connection

On open, the client sends a JSON frame:

```json
{
  "type": "connect",
  "clinicId": "<clinic-id>",
  "userInfo": { "name": "...", "email": "...", "..." },
  "conversationId": "<id or 0>"
}
```

The backend can respond with clinic branding and session data:

| Field | Purpose |
|-------|---------|
| `conversationId` | Persisted in cookies for session continuity |
| `clinicName`, `clinicAcronym`, `greeting` | Header and welcome content |
| `themeColor` | Brand color id (e.g. `azure`, `teal`) |
| `avatarUrl` | Clinic avatar image URL |
| `response` / `message` | Assistant text reply |
| `type: "voice"` + `audio` | Base64-encoded voice response |
| `transcriptText` | Transcription for a voice message |
| `twilioIntent: true` | Signal that a live call should be offered |
| `status: "error"` | Error message display |

The client responds to `ping` frames with `{ "type": "pong" }`.

Outbound chat messages are JSON frames including `type`, `clinicId`, `userInfo`, `conversationId`, and message content (text or base64 audio).

### Twilio voice

1. Client POSTs to `VITE_TWILIO_TOKEN_PATH` with `identity`, `clinicId`, `name`, `email`, and `conversationId`
2. Backend returns `{ "token": "<twilio-access-token>" }`
3. Client registers a Twilio Device and places an outbound call
4. Stop and mute actions are synced to the backend via the configured REST paths

## Project structure

```
src/
├── components/
│   ├── chatbot/          # Core widget UI
│   │   ├── HealthChatbot.tsx   # Open/close orchestrator
│   │   ├── ChatWindow.tsx      # WebSocket, voice, topics, calling
│   │   ├── ChatBubble.tsx      # Floating launcher
│   │   ├── topicsData.ts       # Guided intake topics
│   │   └── ...
│   ├── landing/          # Marketing/demo page (HealthcareScene)
│   └── ui/               # shadcn/ui primitives
├── contexts/
│   └── ChatThemeContext.tsx
├── hooks/
│   ├── useTwilioVoice.ts
│   └── use-mobile.tsx
├── lib/
│   ├── chatCookies.ts    # Session cookie helpers
│   ├── chatThemes.ts     # Theme tokens and Shadow DOM helpers
│   └── clinicAvatar.ts
├── pages/
│   ├── Index.tsx         # Full landing page + widget
│   └── IndexForInject.tsx # Widget-only route (current default)
├── App.tsx
└── main.tsx              # Shadow DOM mount and IIFE entry
```

## Available scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server on port 8080 |
| `npm run build` | Production IIFE embed build → `dist/medical-chatbot.iife.js` |
| `npm run build:spa` | Standard SPA build for local testing |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |

## Guided intake topics

Built-in topic flows in `src/components/chatbot/topicsData.ts`:

| Topic | Description |
|-------|-------------|
| Appointment Request | New visit, follow-up, physical, consultation |
| Medication Request | New medication or refill |
| Prescription Refill | Refill with pharmacy change check |
| Referral Request | Specialist referral |
| Test Results | Blood work, imaging, other |
| Letter Request | Work, school, clearance notes |
| Clinic Location | Address and directions |
| Accepted Insurances | Plan list and verification help |

Each topic expands into a step-by-step questionnaire with optional multiple-choice answers.

## Development notes

- **Path alias:** `@/` maps to `src/` (configured in `vite.config.ts` and `tsconfig`)
- **Default route:** `App.tsx` renders `IndexForInject` (widget only). `Index.tsx` includes the full marketing landing page if you want to switch routes for demos
- **Widget mount ID:** `medical-chatbot-root-component` (constant `WIDGET_MOUNT_ID` in `chatThemes.ts`)
- **Connection indicator:** The bubble shows green (connected), amber (connecting), or red (disconnected)
- **Agent keywords:** Messages containing words like "agent", "human", or "representative" can trigger handoff flows

## License

Private project — not published to npm.
