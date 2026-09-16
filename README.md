# POKER

Planning poker colaborativo feito com Next.js. Não possui login: o facilitador cria uma sala privada por link e cada participante informa o próprio nome, salvo apenas no navegador.

## Como funciona

1. Na página inicial, informe o nome da sessão e o seu nome.
2. A aplicação cria uma URL exclusiva no formato `/room/289ece0244d3`.
3. Use **Convidar** para copiar o link e enviá-lo ao time.
4. Cada pessoa que abrir o link informa o próprio nome antes de votar.
5. Votos e participantes ficam disponíveis enquanto a sessão estiver ativa.

## Desenvolvimento

Requisitos: Node.js LTS.

```bash
cp apps/web/.env.example apps/web/.env
npm install
npm run dev
```

Acesse `http://localhost:3001`. As salas são mantidas em memória e desaparecem quando o servidor reinicia.

## Coolify

1. Crie uma aplicação apontando para este repositório.
2. Selecione o build pack **Dockerfile** e use `apps/web/Dockerfile`.
3. Defina a porta exposta como `3000`.
4. Opcionalmente, defina `NEXT_PUBLIC_APP_URL` com o domínio final para os previews de compartilhamento.

## Stack

- Next.js full-stack (App Router e Route Handlers)
- Estado efêmero em memória no servidor
- Polling leve a cada 2 segundos para sincronização
- Docker multi-stage com output standalone
- Sem autenticação, Redis, WebSocket ou serviços externos
