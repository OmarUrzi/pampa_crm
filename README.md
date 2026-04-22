# Pampa CRM (prototipo)

## Frontend (React + Vite)

```bash
cd pampa-crm
npm install
npm run dev
```

## Backend (Fastify + Prisma + Postgres)

1. Copiar variables de entorno:

```bash
cd pampa-crm/server
cp .env.example .env
```

2. Setear `DATABASE_URL` a tu Postgres.

3. Si usás Google OAuth, setear `FRONTEND_URL` (default `http://localhost:5173`) para que el callback redirija al frontend.
   Si necesitás permitir más de un origen (prod), podés usar `FRONTEND_URLS` (coma-separado).

3. Instalar dependencias y migrar:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

La API queda en `http://localhost:8787` y Swagger en `http://localhost:8787/docs`.

## Tests

Unit tests (Vitest):

```bash
cd pampa-crm
npm run test
```

E2E (Playwright):

```bash
cd pampa-crm
npm run test:e2e
```

## Admin

- La pantalla `Admin > Usuarios` está protegida por rol `admin`.
- El backend evita dejar el sistema sin admins: **no permite** bajar el rol del **último** admin (`error: "last_admin"`).

## JWT / sesión (hardening)

- El frontend guarda el JWT en `localStorage` (`pampa-crm:token`) y lo adjunta como `Authorization: Bearer ...`.
- Si el backend responde `401`, el frontend borra el token y redirige a `/login` mostrando “Tu sesión expiró…”.
- En producción, la UX esperada hoy es **re-login** (no hay refresh token). Si querés refresh tokens, el próximo paso sería sumar:
  - endpoint de refresh + cookie httpOnly
  - rotación/invalidación
  - expiración corta del access token

## Google SSO + Gmail (mailboxes)

El login Google (SSO) usa `/auth/google` y el callback configurado en `GOOGLE_CALLBACK_URL`.

Para conectar **múltiples casillas** (ej `info@`, `support@`) y leer comunicaciones desde Gmail:

- Backend expone `/auth/google-gmail` para iniciar el flow de conexión de mailbox
- Callback: `GOOGLE_GMAIL_CALLBACK_URL` (default `http://localhost:8787/auth/google-gmail/callback`)
- Scopes: `gmail.readonly` (solo lectura)

Google Cloud Console (OAuth client Web):

- Authorized JavaScript origins:
  - `http://localhost:5173`
- Authorized redirect URIs:
  - `http://localhost:8787/auth/google/callback`
  - `http://localhost:8787/auth/google-gmail/callback`

Luego, en el frontend: `Admin · Mailboxes` permite conectar y sincronizar.

## Troubleshooting (Windows / PowerShell)

Si PowerShell bloquea `npm` con error de `npm.ps1` (ExecutionPolicy), usá `npm.cmd`:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

Si `prisma generate` falla con `EPERM rename query_engine...`, apagá el backend (`Ctrl+C`) y reintentá.

Si tenés errores CORS en dev, asegurate de estar sirviendo el frontend desde `http://localhost:5173` o `http://127.0.0.1:5173`.

## Release / verificación rápida

```bash
cd pampa-crm
npm install
npm run test
npm run test:e2e
```

Backend:

```bash
cd pampa-crm/server
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

## Producción (Cloudflare Pages + Fly.io)

### Frontend (Cloudflare Pages)

- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Env var**: `VITE_API_BASE=https://api.tudominio.com`
- **Custom domain**: `app.tudominio.com`

### Backend (Fly.io)

En `server/` hay `Dockerfile` + `fly.toml`.

Variables recomendadas (secrets en Fly):

- `DATABASE_URL=...`
- `JWT_SECRET=...` (largo)
- `NODE_ENV=production`
- `FRONTEND_URL=https://app.tudominio.com`
- `FRONTEND_URLS=https://app.tudominio.com`
- `PORT=8787`

Migraciones en prod:

- `prisma migrate deploy`

### Gmail push (Pub/Sub)

- Endpoint de push: `POST /mailboxes/google/push`
- Requiere configurar Gmail `watch` → Pub/Sub topic → push subscription al endpoint del backend.

Checklist de setup (manual):

- Crear **Pub/Sub topic** (GCP)
- Crear **push subscription** al backend:
  - `https://api.tudominio.com/mailboxes/google/push`
- En la cuenta de Gmail conectada, llamar a Gmail `users.watch` (lo haremos como siguiente paso cuando activemos la parte Gmail):
  - `topicName`: el topic de Pub/Sub
  - `labelIds`: opcional (`INBOX`)
  - Guardar `historyId` inicial en `GoogleMailbox.lastHistoryId`

