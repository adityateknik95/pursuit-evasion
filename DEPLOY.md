# Deployment

The app splits across two hosts: the **frontend** is static and deploys to
Vercel; the **backend** is a persistent WebSocket server (30 Hz sim loop +
PyTorch inference) and needs a host that runs long-lived containers — it will
NOT run on Vercel's serverless functions.

> Note: the server runs a single shared simulation. Every visitor watches the
> same arena, and control actions (reset, policy switches) affect everyone.

## 1. Backend → Hugging Face Spaces (free)

1. Create a new Space at https://huggingface.co/new-space
   - SDK: **Docker**, visibility: Public, hardware: CPU basic (free)
2. Clone the empty Space and copy the backend into it:

   ```powershell
   git clone https://huggingface.co/spaces/<your-user>/pursuit-evasion-api
   cd pursuit-evasion-api
   Copy-Item -Recurse ..\Rl` evasion\backend\* .
   ```

3. Create the Space's `README.md` with this front-matter (required by HF):

   ```yaml
   ---
   title: Pursuit Evasion API
   emoji: 🛰️
   colorFrom: indigo
   colorTo: red
   sdk: docker
   app_port: 7860
   ---
   ```

4. Commit and push. HF builds the Dockerfile and serves at
   `https://<your-user>-pursuit-evasion-api.hf.space`
   - Health check: `https://…hf.space/health`
   - WebSocket: `wss://<your-user>-pursuit-evasion-api.hf.space/ws`

Free Spaces sleep after ~48h of inactivity and wake on the next visit
(cold start ≈ 30s while torch loads).

### Alternative: Fly.io

```powershell
cd backend
fly launch --no-deploy        # accept defaults; internal port 7860
fly deploy
```

## 2. Frontend → Vercel

1. Import the GitHub repo at https://vercel.com/new
2. Set **Root Directory** to `frontend` (framework auto-detects as Vite)
3. Add one environment variable:

   | Name | Value |
   | --- | --- |
   | `VITE_WS_URL` | `wss://<your-user>-pursuit-evasion-api.hf.space/ws` |

4. Deploy. Done — the page connects straight to the Space.

## Local Docker sanity check

```powershell
cd backend
docker build -t pursuit-evasion-api .
docker run -p 7860:7860 pursuit-evasion-api
# then: curl http://localhost:7860/health
```
