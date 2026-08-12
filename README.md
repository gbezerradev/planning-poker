# PONTO

Planning poker colaborativo feito com Next.js, PostgreSQL e Drizzle. Não possui login: cada pessoa informa apenas o nome, que fica salvo no próprio navegador.

## Desenvolvimento

Requisitos: Node.js LTS e PostgreSQL.

```bash
cp apps/web/.env.example apps/web/.env
npm install
npm run dev
```

Acesse `http://localhost:3001`. As tabelas e as histórias iniciais são criadas automaticamente na primeira entrada da sala.

## Coolify

1. Crie um PostgreSQL no mesmo projeto/ambiente da aplicação.
2. Crie uma aplicação apontando para este repositório.
3. Selecione o build pack **Dockerfile** e use `apps/web/Dockerfile`.
4. Defina a porta exposta como `3000`.
5. Adicione `DATABASE_URL` usando a URL interna do PostgreSQL.
6. Opcionalmente, defina `NEXT_PUBLIC_APP_URL` com o domínio final para os previews de compartilhamento.

Não é necessário executar migrations no deploy: a aplicação prepara o esquema de forma idempotente ao abrir a primeira sala.

## Stack

- Next.js full-stack (App Router e Route Handlers)
- PostgreSQL + Drizzle ORM
- Polling leve a cada 2 segundos para sincronização
- Docker multi-stage com output standalone
- Sem autenticação, Redis, WebSocket ou serviços externos
