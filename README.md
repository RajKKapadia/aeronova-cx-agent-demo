# AeroNova — Google CX Agent Studio Multi-Agent Flight Recovery Demo

A complete **fictional** airline disruption demo with a runnable zero-dependency Bun/TypeScript backend, an admin state dashboard, **six individual OpenAPI 3.0 YAML files** (one operation each), and ready-to-paste root + sub-agent instructions.

## 1. What viewers will see

1. `AV2048` — Neha Shah, `AV302` Mumbai → Delhi, **15 Dec 2026**, originally 09:00, delayed to 15:30 (390 minutes).
2. Find `AV418` departing at 11:15 (only one seat), and `AV520` at 12:40 (three seats).
3. After explicit passenger approval, rebook to `AV418`. Admin dashboard shows the new booked flight and updated seat inventory.
4. Original disruption qualifies for a fictional **₹800 meal voucher**. Obtain explicit approval; issue `MEAL-0001`.
5. `AV9000` — Arjun Mehta, `AV886` Delhi → Bengaluru, cancelled. No alternative seats. Create a human escalation case `CASE-0001`.

All data is mocked and resets. No airline systems, messages, money or vouchers are actually accessed or issued.

## 2. Run the API

Install [Bun](https://bun.sh/) locally, then from this folder:

```bash
bun run start
# development with hot reload:
bun run dev
```

Visit:
- `http://localhost:3000/admin` — visual state dashboard; auto-refreshes every 5 seconds, includes reset button
- `http://localhost:3000/health` — API health
- `http://localhost:3000/api/bookings/AV2048` — booking JSON
- `http://localhost:3000/api/flights/alternatives?bookingRef=AV2048` — flight inventory

Optional without Bun: `node --experimental-strip-types src/server.ts` with Node 22+.

**Reset the demo between takes** with the button on `/admin` or:

```bash
curl -X POST http://localhost:3000/admin/reset
```

## 3. Expose the tool API to Google

CX Agent Studio needs a reachable HTTPS API endpoint. `localhost` inside an OpenAPI schema points to Google's tool caller, not to your computer.

For a local recording only, one option is Cloudflare's quick tunnel (if `cloudflared` is installed):

```bash
cloudflared tunnel --url http://localhost:3000
```

The terminal prints a temporary `https://...trycloudflare.com` address. Replace `https://REPLACE-WITH-YOUR-PUBLIC-HTTPS-URL` in **all six YAML files** with that origin (do not add a trailing slash). Then create the tool definitions in CX Agent Studio. If you restart the quick tunnel and its URL changes, update the six YAMLs/tools. An HTTPS reverse proxy or deployed server also works. If your Google Cloud organization restricts allowed endpoints, configure the project's allowed origins appropriately.

**Security:** This mock uses no authentication and exposes mutable demo records and an administrative reset endpoint. It is for a disposable isolated demo only. Do not connect real users, credentials, payments or customer data. Do not leave the public tunnel running unattended. For production, add real identity verification, per-user authorization, audit logs, idempotency keys, protected admin endpoints, persistence and service-to-service authentication. `confirmed: true` is ONLY an illustrative contract, not tamper-proof proof that a real user approved the transaction.

## 4. Configure CX Agent Studio

Official console: https://ces.cloud.google.com/ 

1. Create **AeroNova Flight Recovery** agent application, which gives you a root agent.
2. Configure root agent name **AeroNova Concierge** and paste `instructions/root-agent.txt`.
3. Add child agents named **Flight Recovery Agent** and **Customer Care Agent**, then paste their matching instruction files.
4. Create each OpenAPI tool separately using the corresponding single-operation file in `openapi/`. In the CX Agent Studio tools UI, name each one EXACTLY like the filename without `.yaml`, e.g. `get_booking`. Ensure tool description, operationId and instructions align. **One OpenAPI operation per tool** is the documented UI limitation.
5. Attach `get_booking`, `get_alternative_flights` and `rebook_flight` to **Flight Recovery Agent**.
6. Attach `get_care_eligibility`, `issue_meal_voucher` and `escalate_case` to **Customer Care Agent**.
7. Test each tool with CX Agent Studio's **Test Tool**, starting with get_booking(AV2048), then use **Preview agent** to test full conversations.
8. If transitions back to the root fail to route reliably, use parent/child handoff rules or explicitly refine routing prompts in the UI. Do not assume agent instructions make transitions deterministic.
9. Start with synchronous tool calls for these fast mock APIs so results are available before claiming success. Test before recording.

Google docs: 
- https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/agent
- https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/tool/open-api
- https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/instruction
- https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/handoff

## 5. Demo tool catalog

| Name | Method | Route | What it does |
| --- | --- | --- | --- |
| `get_booking` | GET | `/api/bookings/{bookingRef}` | Lookup existing booking and original flight disruption |
| `get_alternative_flights` | GET | `/api/flights/alternatives?bookingRef=...` | Read available same-route alternatives |
| `rebook_flight` | POST | `/api/bookings/{bookingRef}/rebook` | Change to a specific flight after consent |
| `get_care_eligibility` | GET | `/api/care/eligibility/{bookingRef}` | Check fictional meal voucher eligibility |
| `issue_meal_voucher` | POST | `/api/care/vouchers` | Issue a single ₹800 meal voucher after consent |
| `escalate_case` | POST | `/api/cases/escalate` | Open human support escalation case |

## 6. Sample API requests

```bash
curl http://localhost:3000/api/bookings/AV2048
curl 'http://localhost:3000/api/flights/alternatives?bookingRef=AV2048'

curl -X POST http://localhost:3000/api/bookings/AV2048/rebook \
  -H 'Content-Type: application/json' \
  -d '{"flightId":"AV418","confirmed":true}'

curl http://localhost:3000/api/care/eligibility/AV2048

curl -X POST http://localhost:3000/api/care/vouchers \
  -H 'Content-Type: application/json' \
  -d '{"bookingRef":"AV2048","type":"meal","confirmed":true}'

curl -X POST http://localhost:3000/api/cases/escalate \
  -H 'Content-Type: application/json' \
  -d '{"bookingRef":"AV9000","reason":"no_alternatives","summary":"Passenger flight cancelled and no available alternative seats."}'
```

## 7. Run tests

Requires Node 22+:

```bash
npm test
# or:
node --test tests/backend.test.mjs
```

Tests cover lookup, alternative discovery, explicit-approval flag, stock mutation, duplicate rebooking rejection, voucher eligibility, voucher idempotency and human escalation.

## 8. Video narration + shots

See `VIDEO_PLAN.md` and `instructions/demo-conversations.md`.
