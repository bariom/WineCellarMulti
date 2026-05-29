# WineCellarMulti PWA deployment

WineCellarMulti includes a web app manifest and service worker, so Android/Chrome can install it as a standalone web app when it is served over HTTPS.

## Recommended nginx layout

Do not reuse `bariomwines.duckdns.org` if it must keep serving the old WineCellar app at `/`.
Use a dedicated hostname for WineCellarMulti, for example `winecellarmulti.duckdns.org`, then point nginx to:

- frontend preview: `127.0.0.1:4174`
- backend API: `127.0.0.1:8000`

The frontend fetches `/api/...`, so nginx must proxy `/api/` to the backend before the generic `/` location.

```nginx
server {
    listen 443 ssl;
    server_name winecellarmulti.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/winecellarmulti.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/winecellarmulti.duckdns.org/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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
        proxy_pass http://127.0.0.1:4174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        add_header Cache-Control "no-cache";
    }

    location = /manifest.webmanifest {
        proxy_pass http://127.0.0.1:4174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        add_header Content-Type "application/manifest+json";
    }

    location / {
        proxy_pass http://127.0.0.1:4174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name winecellarmulti.duckdns.org;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

## Start commands

Build and serve the frontend:

```bash
cd frontend
npm install
npm run build
npm run preview:pwa
```

Run the backend:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Android install check

Open `https://winecellarmulti.duckdns.org` in Chrome on Android.
The browser should show `Install app` or `Add to Home screen`.

Requirements:

- HTTPS certificate valid.
- `manifest.webmanifest` reachable.
- `sw.js` reachable from the same origin.
- At least one successful page load after the service worker registration.
