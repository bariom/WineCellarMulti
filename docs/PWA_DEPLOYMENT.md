# WineCellarMulti PWA deployment

Vinaris includes a web app manifest and service worker, so Android/Chrome can install it as a standalone web app when it is served over HTTPS.

## Recommended nginx layout

Use the dedicated hostname for Vinaris, `vinaris.app`. Point nginx to:

- frontend build: `/home/administrator/progetti/WineCellarMulti/frontend/dist`
- backend API: `127.0.0.1:8000`

The frontend fetches `/api/...`, so nginx must proxy `/api/` to the backend before the generic `/` location.

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name vinaris.app www.vinaris.app;

    ssl_certificate /etc/ssl/vinaris/fullchain.pem;
    ssl_certificate_key /etc/ssl/vinaris/vinaris.app-PrivateKey.pem;

    root /home/administrator/progetti/WineCellarMulti/frontend/dist;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types application/javascript application/json application/manifest+json image/svg+xml text/css text/plain;

    location ~ /\.(?!well-known/acme-challenge/) {
        deny all;
        return 404;
    }

    location ~* \.(env|db|sqlite|sqlite3|log|pid|py|sh|bak|backup|old|orig|swp)$ {
        deny all;
        return 404;
    }

    location ~* ^/(README|LICENSE|CHANGELOG|\.git|\.github|data|__pycache__)(/|$) {
        deny all;
        return 404;
    }

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /health {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /sw.js {
        add_header Cache-Control "no-cache";
    }

    location = /manifest.webmanifest {
        add_header Cache-Control "no-cache";
        default_type application/manifest+json;
    }

    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name vinaris.app www.vinaris.app;

    location / {
        return 301 https://vinaris.app$request_uri;
    }
}
```

## Start commands

Build the frontend; nginx serves the generated `dist` directory directly:

```bash
cd frontend
npm install
npm run build
```

Run the backend:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Android install check

Open `https://vinaris.app` in Chrome on Android.
The browser should show `Install app` or `Add to Home screen`.

Requirements:

- HTTPS certificate valid.
- `manifest.webmanifest` reachable.
- `sw.js` reachable from the same origin.
- At least one successful page load after the service worker registration.
