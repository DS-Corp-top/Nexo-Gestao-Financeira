# Nexo Frontend

React + TypeScript + Vite. Este app e deployado separado do backend Django e consome a API via `VITE_API_URL`.

## Configuracao

Crie `frontend/.env` a partir de `.env.example`:

```powershell
Copy-Item .env.example .env
```

Desenvolvimento local:

```env
VITE_API_URL=http://127.0.0.1:8003/api/v1
```

Producao:

```env
VITE_API_URL=https://api.seu-dominio.com/api/v1
```

## Desenvolvimento

```powershell
npm install
npm run dev
```

O dev server roda em `http://localhost:5173`.

## Build

```powershell
npm run build
```

O resultado fica em `frontend/dist` e pode ser publicado em qualquer host estatico.
