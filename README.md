# Fastify Backend Template

A production-shaped backend template built on **[NestJS](https://nestjs.com)** running on the **Fastify** HTTP adapter (`@nestjs/platform-fastify`) instead of Express. It ships with JWT authentication (access + refresh tokens), role-based access control, a sample CRUD module, Prisma/PostgreSQL, request validation, Swagger docs, and Docker.

Because it's real NestJS, everything non-trivial here — modules, controllers, providers, guards, pipes — follows patterns straight from [NestJS's own documentation](https://docs.nestjs.com). The only Fastify-specific things to know about are called out below.

> **New to Node.js, NestJS, or backend development in general?** Read **[docs/GUIDE.md](docs/GUIDE.md)** first — it explains every concept used in this project from scratch, then walks through the codebase file by file.

## Stack

- **Framework**: NestJS 12 on `@nestjs/platform-fastify`
- **Language**: TypeScript (ESM, `NodeNext`)
- **Database**: PostgreSQL via Prisma ORM 7 (`@prisma/adapter-pg` driver adapter)
- **Auth**: `@nestjs/jwt` + `@nestjs/passport` (JWT access/refresh tokens), `argon2id` password hashing
- **Validation**: `class-validator` + `class-transformer`, wired through Nest's global `ValidationPipe`
- **Docs**: `@nestjs/swagger` (OpenAPI + Swagger UI)
- **Testing**: Vitest (unit + e2e)
- **Package manager**: pnpm
- **Runtime**: Node.js 24 LTS

## Prerequisites

- Node.js **v24** (LTS)
- pnpm (`corepack enable` will use the version pinned in `package.json`)
- Docker + Docker Compose (for PostgreSQL, and for running the app in a container)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy the example environment file and adjust values (especially JWT secrets)
cp .env.example .env

# 3. Start PostgreSQL in Docker
pnpm docker:up

# 4. Apply the database schema (creates tables) and generate the Prisma client
pnpm prisma:migrate

# 5. (Optional) Seed an admin + sample user/post
pnpm prisma:seed

# 6. Start the API in watch mode
pnpm start:dev
```

The API listens on `http://localhost:3000` by default. Interactive API docs (Swagger UI) are at:

```
http://localhost:3000/docs
```

Seeded accounts (if you ran `pnpm prisma:seed`):

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `Admin123!` | ADMIN |
| `user@example.com` | `User123!` | USER |

## Project Structure

```
src/
├── main.ts                  # Fastify adapter bootstrap, global pipes/filters, Swagger setup
├── app.module.ts            # Root module — wires ConfigModule, PrismaModule, and every feature module
├── config/
│   └── env.validation.ts    # Zod schema that validates process.env at boot (fails fast if misconfigured)
├── prisma/
│   ├── prisma.module.ts     # @Global() module exporting PrismaService
│   └── prisma.service.ts    # Prisma client wrapper (connects/disconnects with the app lifecycle)
├── common/
│   ├── decorators/          # @Roles(), @CurrentUser()
│   ├── guards/              # JwtAuthGuard, RolesGuard
│   ├── filters/              # PrismaExceptionFilter (maps Prisma errors to HTTP responses)
│   ├── types/                # AuthUser interface, Fastify request type augmentation
│   └── utils/                 # hash.ts — password hashing (argon2) and refresh-token hashing (sha256)
└── modules/
    ├── auth/                # register / login / refresh / logout
    ├── users/               # current-user profile + admin user listing
    └── posts/               # full CRUD sample resource
```

### The module convention

Every feature module under `src/modules/<name>/` follows the same shape:

- `<name>.module.ts` — a standard `@Module({ controllers, providers, imports })`
- `<name>.controller.ts` — thin, delegates to the service; route methods use Nest's `@Get`/`@Post`/etc.
- `<name>.service.ts` — `@Injectable()`, holds the business logic, injects `PrismaService` directly (no repository layer for these simple modules — add one if a module's queries get complex enough to warrant it)
- `dto/` — request DTOs, validated with `class-validator` and documented with `@ApiProperty()` for Swagger

**To add a new module:**

1. `pnpm dlx @nestjs/cli generate resource modules/<name>` (or copy the `posts/` folder as a starting point)
2. Add any Prisma models it needs to `prisma/schema.prisma`, then run `pnpm prisma:migrate`
3. Register the new module in `src/app.module.ts`'s `imports` array
4. If routes need auth, add `@UseGuards(JwtAuthGuard)` (and `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')` for admin-only routes) — see `PostsController` and `UsersController` for examples

## Authentication & RBAC

- `POST /auth/register` — creates a user (role defaults to `USER`), returns an access + refresh token pair
- `POST /auth/login` — verifies credentials, returns a new token pair
- `POST /auth/refresh` — verifies and **rotates** the refresh token (the old one is revoked; reusing it is rejected with 401)
- `POST /auth/logout` — revokes the given refresh token

Access tokens are short-lived (15m by default) and carry `{ sub, role }`. Refresh tokens are long-lived (7d by default), stored **hashed** in the `RefreshToken` table so they can be revoked/rotated server-side, and are verified with a separate secret from access tokens.

Protect a route with:

```ts
@UseGuards(JwtAuthGuard)
@Get('me')
me(@CurrentUser() user: AuthUser) { ... }
```

Restrict a route to specific roles (guards run in order, so `JwtAuthGuard` must come first to populate `request.user`):

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Get()
findAll() { ... }
```

For resource ownership (e.g. "only the post's author or an admin can edit it"), that check lives in the **service** rather than a guard, since it depends on data loaded from the database — see `PostsService.assertCanModify`.

## The one Fastify-specific wrinkle

Nest's Express-oriented docs sometimes reference `helmet` or Express-style CORS/rate-limiting packages directly — those don't work with the Fastify adapter. This template already uses the correct Fastify-native equivalents, registered directly on the underlying Fastify instance in `main.ts`:

```ts
await app.register(helmet);       // from '@fastify/helmet'
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' }); // from '@fastify/rate-limit'
```

If you add more Fastify plugins, register them the same way.

## Environment Variables

See `.env.example` for the full list with defaults. The required ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens (min 16 chars) |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (min 16 chars) — must differ from the access secret |

All environment variables are validated at boot via `src/config/env.validation.ts` (Zod) — the app refuses to start if something required is missing or malformed.

## Testing

```bash
pnpm test        # unit tests (services, with Prisma mocked)
pnpm test:e2e     # end-to-end tests (boots the real app, hits routes via Fastify's inject())
pnpm test:cov     # unit tests with coverage
```

E2E tests run against a real PostgreSQL database — point `DATABASE_URL` (and the JWT secrets) at a test database before running them, e.g. via `pnpm docker:up` and the same `.env` used for local dev.

## Database (Prisma)

Prisma 7's generated client is written to `src/generated/prisma` (not `node_modules`) — this is gitignored and regenerated automatically by `pnpm prisma:generate` / `pnpm prisma:migrate`, and by the Docker build.

```bash
pnpm prisma:migrate          # create/apply a migration in dev + regenerate the client
pnpm prisma:migrate:deploy   # apply existing migrations only (used in production/CI)
pnpm prisma:studio           # open Prisma Studio
pnpm prisma:seed             # run prisma/seed.ts
```

## Docker

```bash
pnpm docker:up      # start PostgreSQL only (docker-compose.yml's postgres service)
docker compose up --build   # build and start the full stack: PostgreSQL + the app
pnpm docker:logs     # tail the app container's logs
pnpm docker:down     # stop everything
```

The app's Docker image (`Dockerfile`) is a multi-stage build: dependencies → build (Prisma generate + `nest build`) → a slim runtime image that runs `prisma migrate deploy` before starting the server, so schema migrations are applied automatically on container start.

## Linting & Formatting

```bash
pnpm lint      # oxlint
pnpm format    # prettier --write
```

## Notes on some deliberate choices

- **Password hashing** uses `argon2id` with reduced memory cost (~19 MiB, OWASP's minimum recommended parameters) rather than the higher default — a balance between resistance to GPU/ASIC cracking and per-login server resource usage. Refresh tokens, by contrast, are hashed with plain SHA-256 before storage (`common/utils/hash.ts`) — they're high-entropy random tokens, not low-entropy user secrets, so a slow password-hashing algorithm isn't needed there.
- **`pnpm` is pinned** via the `packageManager` field in `package.json` so local installs, CI, and Docker builds all resolve the exact same pnpm version — this also avoids surprises from pnpm's supply-chain `minimumReleaseAge` check (which blocks installing packages published very recently) behaving differently across pnpm versions.
