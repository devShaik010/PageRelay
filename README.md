# Blankroom

A small, link-based live notepad. Create a session, share its unique URL, edit
together in real time, and let the session creator close the room when the work
is done.

## Run the complete stack

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). The API is available at
`http://localhost:4000` and PostgreSQL at `localhost:5432`.

## Services

- `web`: Next.js frontend, built as a production standalone image.
- `api`: Express, Socket.IO, and Yjs real-time service.
- `db`: PostgreSQL 16 with a persistent named volume.

The API creates its schema on startup. Creator secrets are only returned once,
stored in the creator's browser, and persisted in PostgreSQL as SHA-256 hashes.

## Local development

Start PostgreSQL with `docker compose up db`, then install and run the apps:

```bash
npm install
npm --prefix apps/api install
npm --prefix apps/web install
DATABASE_URL=postgresql://blankroom:blankroom_local@localhost:5432/blankroom npm run dev
```

