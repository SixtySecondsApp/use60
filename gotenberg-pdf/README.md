# gotenberg-pdf — Railway Deployment

Gotenberg 8 Docker container for pixel-perfect PDF generation. Used by the Proposal Generation Engine V2 (`generate-proposal-pdf` edge function).

## Deployment

1. Create a new Railway service in your project.
2. Point it to the `gotenberg-pdf/` directory.
3. Railway will build the `Dockerfile` automatically on push.
4. Set the service name to `gotenberg-pdf` for consistent internal URL resolution.
5. **Do not enable a public domain** — this service is internal only.

### Environment variables

| Variable | Value | Notes |
|----------|-------|-------|
| `PORT` | `3000` | Set automatically by Railway; Gotenberg uses `--api-port=3000` |

No other environment variables are required. Gotenberg is stateless.

## Internal URL

Edge functions call Gotenberg via Railway's private network:

```
http://gotenberg-pdf.railway.internal:3000
```

Set this as `GOTENBERG_URL` in each edge function's Railway environment config.

## Gotenberg API endpoints used

### Convert HTML to PDF

```
POST /forms/chromium/convert/html
Content-Type: multipart/form-data

Fields:
  files       index.html          # The proposal HTML document
  paperWidth  8.27                # A4 width in inches
  paperHeight 11.69               # A4 height in inches
  marginTop   0.59                # 15mm
  marginBottom 0.79               # 20mm
  marginLeft  0.79                # 20mm
  marginRight 0.79                # 20mm
  printBackground true            # Required for brand colors / background fills
  waitDelay   500ms               # Font load delay (set in CMD but can override per-request)
```

### Health check

```
GET /health
```

Returns `200 OK` with `{"status":"up"}` when the container is ready.

## Configuration notes

- **A4 paper**: set per-request via `paperWidth=8.27` / `paperHeight=11.69` form fields.
- **500ms waitDelay**: baked into the Docker CMD so every request benefits automatically.
- **GPU disabled**: `--chromium-disable-gpu` required in containerised environments.
- **Memory**: Gotenberg + Chromium typically needs ~512MB. Railway's default 512MB plan is sufficient for proposals; bump to 1GB if you see OOM kills under load.
