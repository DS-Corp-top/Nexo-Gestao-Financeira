# Nexo Gestao Financeira

Aplicacao de gestao financeira com frontend React e backend Django REST.

## Arquitetura

- `frontend/`: React + TypeScript + Vite. Consome a API por `VITE_API_URL` ou `/api/v1` por padrao.
- `backend/`: Django + Django REST Framework. Serve API, admin, jobs Celery e arquivos de media/static.
- Autenticacao da API: JWT via `/api/v1/auth/token/` e `/api/v1/auth/token/refresh/`.

O backend fica sem SSR: a UI classica Django/HTMX foi removida. Em deploy de dyno unico, o Django entrega apenas o build estatico do React em `frontend/dist`.

## Desenvolvimento Local

Comando unico pela raiz:

```powershell
npm run dev
```

Esse comando sobe o Django primeiro em `http://127.0.0.1:8003`, espera a API responder e depois sobe o Vite em `http://localhost:5173`.

Backend manual:

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

## Docker

O `Dockerfile` (raiz) compila o frontend e serve o build via Django/WhiteNoise no mesmo container. E usado tanto para rodar local/self-hosted via `docker-compose.yml` quanto para o deploy no Heroku (via `heroku.yml`, ver abaixo) — a mesma imagem em ambos os casos.

```powershell
Copy-Item .env.example .env
# edite .env com uma DJANGO_SECRET_KEY propria
docker compose up --build
```

Sobe 4 servicos:

- `db`: PostgreSQL 16
- `redis`: Redis 7
- `backend`: build multi-stage (React + Django), roda `migrate` e depois Gunicorn em `http://localhost:8000` (porta ajustavel via `WEB_PORT`)
- `worker`: Celery, mesma imagem do backend

Dados de Postgres, Redis e uploads (`media/`) persistem em volumes nomeados.

## Deploy em um dyno Heroku (Container Registry)

O deploy no Heroku usa o stack `container`: o `heroku.yml` da raiz descreve como buildar (o mesmo `Dockerfile` acima) e quais comandos rodar por tipo de dyno (`release`, `web`, `worker`).

Configuracao inicial do app (uma unica vez):

```powershell
heroku stack:set container -a nexo-gestao-financeira
```

A partir dai, cada `git push heroku main` (ou o job `deploy` do GitHub Actions) builda a imagem Docker a partir do `heroku.yml`/`Dockerfile` em vez de buildpacks. O `release` roda `check_react_build` + `migrate`; o `web` sobe o Gunicorn na porta `$PORT` do dyno; o `worker` sobe o Celery — os tres compartilham a mesma imagem.

Config minima:

```powershell
heroku config:set DJANGO_DEBUG=false -a nexo-gestao-financeira
heroku config:set SERVE_REACT_APP=true -a nexo-gestao-financeira
heroku config:set DJANGO_ALLOWED_HOSTS=nexo-gestao-financeira.herokuapp.com,appnexo.top,www.appnexo.top -a nexo-gestao-financeira
heroku config:set DJANGO_CSRF_TRUSTED_ORIGINS=https://nexo-gestao-financeira.herokuapp.com,https://appnexo.top,https://www.appnexo.top -a nexo-gestao-financeira
heroku config:set VITE_API_URL=/api/v1 -a nexo-gestao-financeira
```

Como o frontend e a API ficam no mesmo dominio, CORS nao e necessario para o app em producao.

## CI/CD (GitHub Actions)

Dois workflows separados:

`.github/workflows/ci.yml` ("CI") roda em todo push/PR para `main`:

- `backend-tests`: `manage.py check` + `pytest` (SQLite em memoria, sem servicos externos).
- `frontend-tests`: `lint`, `test` (vitest) e `build` (tsc + vite).
- `e2e-tests`: roda depois que os dois acima passam. Sobe backend (`migrate` + `seed_e2e` + `runserver`) e frontend (`vite dev`) de verdade via `webServer` do Playwright, e testa login -> navegacao -> criacao de uma transacao num navegador Chromium real. Ver `frontend/playwright.config.ts` e `frontend/e2e/`.

`.github/workflows/deploy.yml` ("Deploy") dispara via `workflow_run` assim que o workflow "CI" termina com sucesso para um push direto em `main` (nao roda para PRs nem se algum teste falhar). Faz `git push` para o Heroku, que builda a imagem Docker a partir do `heroku.yml` (stack `container` — ver secao acima).

Para o job `deploy` funcionar, configure o secret no GitHub Environment `nexo-gestao-financeira` (`Settings > Environments`) ou como secret do repositorio (`Settings > Secrets and variables > Actions`):

- `HEROKU_API_KEY`: token gerado com `heroku authorizations:create --description "github-actions-nexo"` (nao usar `heroku auth:token`, que fica preso a sessao de login pessoal).

## Deploy separado

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
npm run test:e2e
```

`npm run test:e2e` sobe backend e frontend sozinho (via `webServer` do Playwright) e roda o teste de login -> navegacao -> criacao de transacao. Na primeira vez, instale os navegadores com `npx playwright install chromium`. Usa um usuario fixo (`e2e@example.com`), criado pelo comando `python manage.py seed_e2e` — nunca roda contra um dyno Heroku (o comando se recusa se a env var `DYNO` estiver setada).
