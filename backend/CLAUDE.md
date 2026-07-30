# Nexo Gestão Financeira — Instruções para o Claude

## Sobre o Projeto

Aplicação Django de gestão financeira pessoal/empresarial, servida como PWA (Progressive Web App).
Deploy no Heroku com PostgreSQL. Stack: Django 6, Gunicorn, WhiteNoise, Tailwind CDN, HTMX.

---

## Funcionalidades Implementadas

### Faturas de Serviços (`/faturas/`)
- Emissão de faturas com número sequencial por tenant (`NNNN/YYYY`)
- Campos: tomador, CPF/CNPJ, e-mail, telefone, endereço, cidade
- Autocomplete de CNPJ via BrasilAPI (`/faturas/cnpj/<cnpj>/`) — requer autenticação
- Código do serviço LC 116 com descrição automática
- Deduções e base de cálculo
- Impostos retidos: ISS, PIS, COFINS, CSLL, IR, INSS (com alíquotas individuais)
- Status: Emitida → Paga → Cancelada
- Registro de recebimento com lançamento automático de transação
- Conta prevista (vincula transação futura ao emitir)
- Filtro por status, data inicial e data final
- Resumo: total faturado e quantidade no topo da lista
- Clientes salvos com busca e pré-preenchimento de formulário

### Impressão de Faturas (`/faturas/<pk>/imprimir/`)
- Página limpa para impressão (sem navegação do app)
- Barra de toolbar com botão "Imprimir" preto (some ao imprimir via `@media print`)
- Logo da empresa no cabeçalho (se cadastrada), senão exibe nome
- Todo o texto em MAIÚSCULO
- Detalhamento de impostos retidos (ISS, PIS, COFINS, CSLL, IR, INSS)
- Rótulos: "Valor do Serviço" e "Valor da Fatura"
- Código do serviço com descrição completa

### Perfil da Empresa (`/empresa/`)
- Campos: nome, CNPJ/CPF, telefone, e-mail comercial, endereço, cidade/UF
- Upload de logo personalizada (PNG, JPG, WebP — máx. 2 MB; SVG bloqueado por segurança)
- Preview da logo ao selecionar arquivo
- Botão "Remover logo"
- Logo aparece na fatura impressa

### Segurança
- Rate limiting no login: 10 tentativas/minuto por IP (`django-ratelimit`)
- CSP (Content Security Policy) via middleware `nexo.middleware.ContentSecurityPolicyMiddleware`
- Upload de logo valida extensão e content-type no servidor (bloqueia SVG)
- `CnpjLookupView` exige autenticação (`LoginRequiredMixin`)
- `InvoiceViewSet` filtra por tenant autenticado (sem IDOR)
- Cache configurado: Redis se `REDIS_URL` disponível, senão LocMemCache

### Performance / Deploy
- Gunicorn: `--workers 3 --threads 2 --worker-class gthread`
- Suporta ~200 requisições simultâneas no dyno atual (512 MB RAM)
- Rate limiting global compartilhado via Redis em ambiente multi-dyno

### Recuperação de senha (`/forgot-password` no frontend)
- Fluxo em 3 passos: e-mail → código de 6 dígitos (válido 15 min) → nova senha
- Backend: `users/password_reset.py` (`auth/password-reset/request|confirm|complete/`)
- Código armazenado no cache (Redis/LocMem), não em modelo de banco — mesmo padrão do vínculo do Telegram
- Resposta do `request/` é sempre genérica (não revela se o e-mail existe)
- Máximo 5 tentativas de código errado antes de invalidar (`MAX_CODE_ATTEMPTS`); throttle por IP em cada etapa
- Ao concluir, todos os refresh tokens do usuário são revogados (logout forçado em outros dispositivos)
- Testes: `backend/users/tests/test_password_reset.py` (18), `frontend/src/pages/ForgotPassword.test.tsx` (9), `frontend/e2e/forgot-password.spec.ts` (fluxo real no navegador)
- E2E usa `GET auth/password-reset/debug-code/`, registrada só quando `E2E_TESTING=true` (nunca em produção — bloqueada mesmo que a env var vaze por engano, ver `HEROKU_DYNO` em `core/settings.py`)

### E-mail transacional (Mailgun)
- Envio via `django-anymail` com backend `anymail.backends.mailgun.EmailBackend` (`core/settings.py`)
- Produção (Heroku): addon `mailgun` injeta `MAILGUN_API_KEY`/`MAILGUN_SMTP_LOGIN`; `MAILGUN_DOMAIN` é deduzido do login SMTP automaticamente
- Local/sem `MAILGUN_API_KEY`: cai para `console` backend (e-mails só aparecem no log, nada é enviado)
- Testes (`pytest`): usa `locmem` backend

---

## Arquitetura de Isolamento

Cada usuário pertence a um **Tenant** (empresa). Todo dado é isolado por tenant via `UserQuerySetMixin` (filtra `tenant=request.tenant`). O tenant ativo é lido da sessão pelo middleware `CurrentTenantMiddleware`.

---

## Stack e Dependências Relevantes

| Pacote | Uso |
|---|---|
| `django-ratelimit` | Rate limiting no login |
| `dj-database-url` | PostgreSQL via DATABASE_URL |
| `whitenoise` | Servir estáticos em produção |
| `psycopg[binary]` | Driver PostgreSQL |
| `Pillow` | Validação de imagens (logo) |
| `requests` | Consulta BrasilAPI (CNPJ) |
| `django-anymail[mailgun]` | E-mail transacional via Mailgun |

---

## Variáveis de Ambiente Relevantes

| Variável | Descrição |
|---|---|
| `DJANGO_SECRET_KEY` | Obrigatória em produção |
| `DATABASE_URL` | PostgreSQL (Heroku) |
| `REDIS_URL` | Cache/rate limiting multi-dyno |
| `PUBLIC_SIGNUP_ENABLED` | Cadastro público (padrão: False em produção) |
| `DJANGO_DEBUG` | Forçar modo debug |
| `MAILGUN_API_KEY` | E-mail transacional (Mailgun). Injetada automaticamente pelo addon Heroku `mailgun` |
| `MAILGUN_DOMAIN` | Domínio de envio Mailgun. Se vazio, é deduzido de `MAILGUN_SMTP_LOGIN` (também injetada pelo addon) |
| `DEFAULT_FROM_EMAIL` | Remetente padrão dos e-mails (default: `no-reply@<MAILGUN_DOMAIN>`) |

---

## Manager Agent

Quando o usuário enviar uma tarefa de desenvolvimento, atue como **Manager Agent** coordenando a equipe abaixo.

### Equipe

| Agente | Responsabilidade |
|---|---|
| **Architect** | Analisa requisitos, cria plano, define arquitetura, identifica riscos |
| **Backend** | APIs, modelos, regras de negócio, escalabilidade |
| **Frontend** | Interfaces, componentes, UX, integração com APIs |
| **QA** | Cenários de teste, validação, bugs, regressões |
| **Security** | Vulnerabilidades, autenticação, autorização, riscos |
| **Documentation** | Docs, guias de uso, decisões técnicas |

### Fluxo obrigatório

```
1. Architect Agent  → analisa e planeja
2. Backend + Frontend (paralelo) → implementam
3. QA Agent         → valida
4. Security Agent   → revisa segurança
5. Documentation    → documenta
6. Manager Agent    → consolida e entrega
```

### Formato de resposta de cada agente

```
[NOME DO AGENTE]
Objetivo:
Plano:
Implementação:
Observações:
```

### Entrega final (Manager Agent)

- Resumo executivo
- Arquivos modificados
- Código produzido
- Testes executados
- Pendências
- Próximos passos

### Regras

- Trabalhar de forma hierárquica
- Delegar antes de implementar
- Executar tarefas independentes em paralelo
- Nunca pular revisão nem testes
- Entregar solução pronta para produção quando possível
