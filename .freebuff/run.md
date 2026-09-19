# Run doc — React app preview (this thread)

## Artifacts (reproduce)

```bash
cd react-app
npm install        # once; creates node_modules + package-lock.json
npm run build      # outputs dist/
```

The build is static (`dist/`). Data files are NOT copied into dist — the
preview server (below) serves `data/` and `example.txt` from the repo root
at the same origin, exactly like the GitHub Pages workflow does.

## Run the server

```bash
cd react-app
node run-preview.mjs
```

- Serves `react-app/dist/` on **http://127.0.0.1:8124** (fixed port).
- `/data/*` and `/example.txt` are served from the repo root (correct MIME types).
- Unknown paths fall back to `dist/index.html` (SPA fallback).

Do NOT use `python -m http.server` for this — it serves `.js` as
`application/octet-stream`, which the browser rejects for module scripts.
`vite preview` also works (`npm run preview -- --host 127.0.0.1 --port 8124`)
but does not serve `data/`, so course data would 404.

## Detached start (this machine, Git Bash + PowerShell)

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'node.exe' -ArgumentList 'run-preview.mjs' -WorkingDirectory 'A:\2.Coding\Unit-selection\react-app' -RedirectStandardOutput 'A:\2.Coding\Unit-selection\.freebuff\preview-ec7d1728-8432-4d1c-81e9-de1048b08c3e.log' -RedirectStandardError 'A:\2.Coding\Unit-selection\.freebuff\preview-ec7d1728-8432-4d1c-81e9-de1048b08c3e.log.err' -WindowStyle Hidden -PassThru).Id"
```

stdout and stderr MUST go to different files (PowerShell requirement).
Check: `netstat -ano | grep :8124` and `curl http://127.0.0.1:8124/`.

## GitHub Pages (production)

- Workflow: `.github/workflows/deploy-react.yml` — builds `react-app/`,
  copies `data/` into `react-app/dist/data/`, adds a 404 SPA fallback,
  uploads `react-app/dist` and deploys with actions/deploy-pages@v4.
- One-time repo setting: **Settings → Pages → Source → GitHub Actions**.
