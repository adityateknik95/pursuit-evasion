# Deployment

The app splits across two hosts: the **frontend** is static and deploys to
Vercel; the **backend** is a persistent WebSocket server (30 Hz sim loop +
PyTorch inference) and needs a host that runs long-lived containers — it will
NOT run on Vercel's serverless functions.

> Note: the server runs a single shared simulation. Every visitor watches the
> same arena, and control actions (reset, policy switches) affect everyone.

## 1. Backend → Render (free)

The repo ships a `render.yaml` blueprint, so this is mostly clicks:

1. Sign up / log in at https://render.com (GitHub sign-in)
2. **New → Blueprint** → connect the `pursuit-evasion` GitHub repo
3. Render reads `render.yaml`, shows the `pursuit-evasion-api` service on the
   **free** plan → click **Apply/Deploy**
4. First build takes ~5–10 min (torch download). The service URL looks like
   `https://pursuit-evasion-api-XXXX.onrender.com`
   - Health check: `https://…onrender.com/health`
   - WebSocket: `wss://…onrender.com/ws`

Free services sleep after ~15 min idle and wake on the next request
(cold start ≈ 1 min while torch loads).

### Alternatives

- **Fly.io** (pay-as-you-go, ~$2–3/mo): `cd backend && fly launch` (internal
  port 7860), then `fly deploy`.
- **Hugging Face Spaces**: Docker Spaces require a PRO subscription; the
  Dockerfile works there unchanged (`app_port: 7860` front-matter) if you
  have PRO.

## 2. Frontend → Vercel

1. Import the GitHub repo at https://vercel.com/new
2. Set **Root Directory** to `frontend` (framework auto-detects as Vite)
3. Add one environment variable:

   | Name | Value |
   | --- | --- |
   | ` `VITE_WS_URL` | `wss://<your-service>.onrender.com/ws` |

4. Deploy. Done — the page connects straight to the Space.

## Local Docker sanity check

```powershell
cd backend
docker build -t pursuit-evasion-api .
docker run -p 7860:7860 pursuit-evasion-api
# then: curl http://localhost:7860/health
```
