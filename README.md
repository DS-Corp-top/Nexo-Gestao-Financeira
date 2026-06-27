# Nexo Gestao Financeira

Aplicacao de gestao financeira com frontend React separado do backend Django.

## Arquitetura

- `frontend/`: React + TypeScript + Vite. Consome a API por `VITE_API_URL`.
- `backend/`: Django + Django REST Framework. Serve API, admin, jobs Celery e arquivos de media/static.
- Autenticacao da API: JWT via `/api/v1/auth/token/` e `/api/v1/auth/token/refresh/`.

O backend fica em modo API-only. A UI classica Django/HTMX foi removida; o frontend React e deployado separadamente.

## Desenvolvimento Local

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python manage.py migrate
python manage.py runserver 8003 --noreload
```

Frontend:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Para desenvolvimento local, `frontend/.env` deve apontar para:

```env
VITE_API_URL=http://127.0.0.1:8003/api/v1
```

E o backend deve permitir a origem do Vite:

```env
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

## Deploy Separado

Frontend:

```env
VITE_API_URL=https://api.seu-dominio.com/api/v1
```

Backend:

```env
DJANGO_ALLOWED_HOSTS=api.seu-dominio.com
CORS_ALLOWED_ORIGINS=https://app.seu-dominio.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.seu-dominio.com
```

Como a API usa JWT no header `Authorization: Bearer`, `CORS_ALLOW_CREDENTIALS=false` e cookies de sessao nao sao necessarios para o frontend.

## Comandos Uteis

Backend:

```powershell
python manage.py check
python manage.py test
```

Frontend:

```powershell
npm run build
npm run test
```
