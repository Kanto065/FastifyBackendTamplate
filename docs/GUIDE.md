# Understanding This Project — A to Z

This document assumes **no prior backend, Node.js, or NestJS knowledge**. It builds up every concept from scratch, then walks through this exact codebase file by file, explaining *what* each piece does and *why* it exists. Read it top to bottom the first time; use it as a reference afterward.

## Table of Contents

1. [The Absolute Basics](#1-the-absolute-basics)
2. [TypeScript & Decorators](#2-typescript--decorators)
3. [What NestJS Is, and Why We Use It](#3-what-nestjs-is-and-why-we-use-it)
4. [The Four Core NestJS Building Blocks](#4-the-four-core-nestjs-building-blocks)
5. [The Request Lifecycle](#5-the-request-lifecycle)
6. [Project Structure, File by File](#6-project-structure-file-by-file)
7. [The Database Layer: Prisma](#7-the-database-layer-prisma)
8. [Authentication, Step by Step](#8-authentication-step-by-step)
9. [Authorization (RBAC), Step by Step](#9-authorization-rbac-step-by-step)
10. [Validation: DTOs and class-validator](#10-validation-dtos-and-class-validator)
11. [Error Handling](#11-error-handling)
12. [Testing](#12-testing)
13. [Docker](#13-docker)
14. [Walkthrough: Adding a New Feature](#14-walkthrough-adding-a-new-feature)
15. [Glossary](#15-glossary)

---

## 1. The Absolute Basics

### What is a "backend"?

When you use an app (a to-do list, a shopping site, whatever), there are usually two halves:

- **Frontend**: the part that runs in the user's browser or phone — what they see and click.
- **Backend**: a program that runs on a server somewhere, which the frontend talks to over the network to store data, check passwords, run business logic, etc.

This project **is a backend**. It doesn't have any screens — it only exposes **HTTP endpoints** (URLs like `/auth/login` or `/posts`) that respond to requests with data (usually JSON).

### What is Node.js?

JavaScript was originally a language that only ran inside web browsers. **Node.js** is a program that lets you run JavaScript (and TypeScript, once compiled) *outside* the browser — on a server, on your laptop, anywhere. It's what actually executes the code in this project when you run `pnpm start:dev`.

Node.js is well-suited to backends because of how it handles work: instead of blocking (freezing) while waiting for slow things like a database query or a file read, it registers a callback and moves on to handle other requests, coming back once the slow thing finishes. This is why a single Node process can handle many simultaneous requests. You don't need to manage this yourself — `async`/`await` (used everywhere in this codebase) is the modern syntax for writing this kind of non-blocking code as if it were simple top-to-bottom code.

### What is Fastify?

**Fastify** is a library for Node.js that does the actual low-level work of an HTTP server: listening on a port, parsing incoming requests, matching them to the code that should handle them ("routes"), and sending back responses. It's one of several such libraries (Express is the most famous alternative) — Fastify is used here because it's fast and has good TypeScript support.

By itself, Fastify is fairly bare: you register plugins and routes and it dispatches requests. It doesn't tell you how to organize a large application. That's the gap NestJS fills.

### What is an API, and what is JSON?

An **API** (Application Programming Interface) here means: a set of URLs (endpoints) that accept requests and return responses, so other programs (a frontend, a mobile app, another backend) can interact with this one over HTTP. Specifically this is a **REST API**, meaning it follows a convention where URLs represent *resources* (e.g. `/posts` is "the collection of posts", `/posts/123` is "post number 123") and HTTP *methods* represent the action:

| Method | Meaning | Example in this project |
|---|---|---|
| `GET` | Read data | `GET /posts` — list posts |
| `POST` | Create data | `POST /posts` — create a post |
| `PATCH` | Partially update data | `PATCH /posts/:id` — edit a post |
| `DELETE` | Remove data | `DELETE /posts/:id` — delete a post |

**JSON** (`{"title": "Hello", "content": "World"}`) is the text format almost all modern APIs use to send structured data back and forth. When you `POST` to `/posts`, you send a JSON body; the server sends a JSON body back.

---

## 2. TypeScript & Decorators

This project is written in **TypeScript**, which is JavaScript plus a type system (`string`, `number`, custom types like `AuthUser`, etc.) that's checked *before* the code runs (`pnpm build` / `pnpm lint`), catching a whole class of bugs early. Every `.ts` file gets compiled down to plain JavaScript before Node actually runs it.

The one TypeScript feature you'll see constantly in this codebase, and which is worth understanding on its own, is the **decorator** — anything written as `@SomethingLikeThis()` directly above a class, method, or property:

```ts
@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}
  ...
}
```

A decorator is just a function that Nest calls to attach metadata to the thing below it — think of it as a label. `@Injectable()` doesn't *do* anything by itself at runtime in a visible way; it stamps the class with "this class can be managed by Nest's dependency injection system" (explained next). Nest then reads these labels at startup to figure out how everything wires together. You don't need to know how decorators are implemented — just recognize that they're how you communicate structure and behavior to Nest declaratively, instead of writing manual setup code.

---

## 3. What NestJS Is, and Why We Use It

**NestJS** ("Nest") is a framework that sits on top of an HTTP library (normally Express, but this project configures it to use **Fastify** instead via `@nestjs/platform-fastify`) and adds:

- A standard way to **organize code** into self-contained units (**modules**)
- **Dependency Injection (DI)** — a system that constructs your classes and hands them their dependencies automatically (explained in detail below)
- Built-in support for common backend needs: validation, authentication guards, structured error handling, API documentation generation, and more — all via consistent, well-documented patterns

The single biggest reason to reach for Nest instead of writing raw Fastify routes is **structure at scale**. A raw Fastify app is just a pile of route handler functions; as it grows, nothing stops one part of the code from becoming tangled with another. Nest enforces boundaries (modules), makes dependencies between classes explicit and swappable (DI), and gives every cross-cutting concern (validation, auth, error handling) a well-defined place to live.

Because Nest is *very* popular, it also means: if you get stuck, the [official docs](https://docs.nestjs.com) and huge community answer almost any question you'll have — which is a big part of why this project uses real Nest rather than a one-off custom structure.

---

## 4. The Four Core NestJS Building Blocks

Everything in this codebase's `src/modules/` and `src/common/` folders is one of these four things.

### 4.1 Modules — `@Module()`

A **module** is a container that groups related code together. Every Nest app has exactly one root module (`src/app.module.ts`) and typically many feature modules.

```ts
// src/modules/posts/posts.module.ts
@Module({
  imports: [AuthModule],       // other modules this one depends on
  controllers: [PostsController], // classes that handle incoming HTTP requests
  providers: [PostsService],      // classes with business logic, available via DI
})
export class PostsModule {}
```

- `imports`: other modules whose exported providers this module wants to use.
- `controllers`: the classes that define this module's routes.
- `providers`: the classes with actual logic (services, guards, etc.) that Nest will instantiate and manage.
- `exports` (not shown above): providers this module is willing to share with *other* modules that import it.

The root module (`app.module.ts`) imports every feature module, which is how the whole app gets assembled:

```ts
@Module({
  imports: [ConfigModule.forRoot({...}), PrismaModule, AuthModule, UsersModule, PostsModule],
  controllers: [AppController],
})
export class AppModule {}
```

### 4.2 Controllers — `@Controller()`

A **controller** defines routes: which URL + HTTP method maps to which method on the class. Controllers should be "thin" — they parse the request and call into a service, they don't contain real business logic themselves.

```ts
// src/modules/posts/posts.controller.ts
@Controller('posts')              // base path: everything below is under /posts
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()                          // GET /posts
  findAll(@Query() query: ListPostsQueryDto) {
    return this.postsService.findAll(query);
  }

  @Post()                         // POST /posts
  create(@Body() dto: CreatePostDto, @CurrentUser() user: AuthUser) {
    return this.postsService.create(dto, user);
  }
}
```

Notice `@Get()`, `@Post()`, `@Body()`, `@Query()` — all decorators. `@Get()`/`@Post()`/`@Patch()`/`@Delete()` on a method say "this method handles this HTTP method + path." `@Body()` and `@Query()` on a *parameter* tell Nest "extract the JSON request body (or the URL's query string) and pass it as this argument" — you never manually read `request.body` yourself.

Whatever a controller method **returns**, Nest automatically converts to JSON and sends as the HTTP response. If it returns a `Promise` (as almost everything here does, since database calls are asynchronous), Nest awaits it first.

### 4.3 Providers / Services — `@Injectable()`

A **provider** (in this codebase, always called a "service") is a class that holds actual logic — talking to the database, hashing passwords, issuing tokens, enforcing business rules. Marking a class `@Injectable()` tells Nest "you're allowed to construct this and hand it to whoever asks for it."

```ts
// src/modules/posts/posts.service.ts
@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }
  ...
}
```

Services should be framework-agnostic where possible — notice `PostsService` never touches `request`/`response` objects directly, which is exactly why it's trivial to unit test in isolation (see [Testing](#12-testing)).

### 4.4 Dependency Injection (DI) — the glue between them

This is the single most important Nest concept to internalize, and it's simpler than it sounds.

**The problem it solves**: `PostsController` needs a `PostsService` to do its work. `PostsService` needs a `PrismaService` to talk to the database. Without DI, you'd have to manually write code somewhere like:

```ts
const prisma = new PrismaService(...);
const postsService = new PostsService(prisma);
const postsController = new PostsController(postsService);
```

...for every single class, in the right order, everywhere they're used. This gets unmanageable fast, and makes swapping implementations (e.g., for testing) painful.

**How Nest solves it**: you just declare what a class *needs* in its constructor, typed:

```ts
@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}
}
```

At startup, Nest looks at every `@Injectable()`/`@Controller()` class, sees what its constructor asks for, and **automatically constructs everything in the right order and wires it all together** — this is called the **DI container**. You never call `new PostsService(...)` yourself; Nest does it, and hands you a fully-wired instance whenever you (or another class) ask for one.

The huge practical benefit: in tests, you can swap a real `PrismaService` for a fake one without changing `PostsService` at all — see `src/modules/auth/auth.service.spec.ts`, where a plain object stands in for `PrismaService`.

`private readonly prisma: PrismaService` in a constructor is TypeScript shorthand that both declares a constructor parameter *and* creates `this.prisma` from it — you'll see this pattern in every service in the codebase.

---

## 5. The Request Lifecycle

When an HTTP request comes in, it passes through several stages, in this order, before your controller method's return value becomes the response. This project uses three of these stages; the diagram below shows the full picture with **this project's actual pieces** named:

```
Incoming HTTP request
        │
        ▼
 ┌─────────────┐   e.g. helmet, rate-limit, cors — registered directly
 │  Middleware │   on the Fastify instance in main.ts (not Nest middleware
 └─────────────┘   here, but conceptually the same "runs first" stage)
        │
        ▼
 ┌─────────────┐   e.g. JwtAuthGuard, RolesGuard (src/common/guards/)
 │    Guards   │   → decide: is this request ALLOWED to proceed at all?
 └─────────────┘     (checks the JWT, checks the user's role)
        │
        ▼
 ┌─────────────┐   e.g. the global ValidationPipe (registered in main.ts)
 │    Pipes    │   → transforms/validates the incoming data (DTOs)
 └─────────────┘     before it reaches your handler
        │
        ▼
 ┌─────────────┐
 │  Controller │   → your route handler method actually runs
 │   handler   │
 └─────────────┘
        │
        ▼
   (if it throws)
        │
        ▼
 ┌─────────────┐   e.g. PrismaExceptionFilter (src/common/filters/)
 │   Filters   │   → catches errors, converts them into a clean HTTP
 └─────────────┘     error response instead of crashing
        │
        ▼
   HTTP response sent
```

(Nest also has **Interceptors**, which can run code both before *and* after the handler — this project doesn't currently use any, but they're worth knowing exist, e.g. for logging or transforming every response uniformly.)

**Why this order matters**: Guards run *before* Pipes, which is why `JwtAuthGuard` can reject an unauthenticated request with a 401 before the app ever wastes time validating the request body. And Guards for a given route run in the array order you list them, e.g. `@UseGuards(JwtAuthGuard, RolesGuard)` — `JwtAuthGuard` must run first because it's the one that populates `request.user`, which `RolesGuard` then reads.

---

## 6. Project Structure, File by File

```
src/
├── main.ts                  # The entry point — starts everything
├── app.module.ts            # The root module — assembles the whole app
├── config/
│   └── env.validation.ts    # Validates environment variables at startup
├── prisma/
│   ├── prisma.module.ts     # Makes PrismaService available app-wide
│   └── prisma.service.ts    # Wraps the Prisma database client
├── common/                  # Reusable pieces shared across feature modules
│   ├── decorators/
│   │   ├── roles.decorator.ts        # @Roles('ADMIN')
│   │   └── current-user.decorator.ts # @CurrentUser()
│   ├── guards/
│   │   ├── jwt-auth.guard.ts # Checks: is there a valid access token?
│   │   └── roles.guard.ts    # Checks: does this user have the right role?
│   ├── filters/
│   │   └── prisma-exception.filter.ts # Converts DB errors to HTTP errors
│   ├── types/
│   │   ├── auth-user.interface.ts # Shape of the logged-in user object
│   │   └── fastify.d.ts           # Teaches TypeScript that requests have .user
│   └── utils/
│       └── hash.ts           # Password hashing + refresh-token hashing
└── modules/                  # Feature modules — the actual application
    ├── auth/                 # Register, login, refresh, logout
    ├── users/                # "Who am I" + admin user listing
    └── posts/                # Sample CRUD resource
```

### `src/main.ts` — the entry point

This is the first code that runs. Step by step:

```ts
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
```
Builds the whole Nest application (reading `AppModule` and everything it imports), telling it to use Fastify as the underlying HTTP server.

```ts
await app.register(helmet);
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
```
Registers two Fastify plugins directly: `helmet` adds a set of security-related HTTP response headers; `rateLimit` rejects a client with a `429 Too Many Requests` if they make more than 100 requests per minute (protects against brute-force/abuse).

```ts
app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }) });
```
**CORS** (Cross-Origin Resource Sharing) is a browser security rule that blocks a webpage on `siteA.com` from calling an API on `siteB.com` unless the API explicitly allows it. This line tells the browser which origins are allowed to call this API (configured via the `CORS_ORIGIN` environment variable).

```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
```
Registers validation globally (see [section 10](#10-validation-dtos-and-class-validator)) — every route automatically validates its incoming body/query against its DTO class.

```ts
app.useGlobalFilters(new PrismaExceptionFilter());
```
Registers our custom error handler globally (see [section 11](#11-error-handling)).

```ts
SwaggerModule.setup('docs', app, document);
```
Generates and serves interactive API documentation at `/docs`, built automatically from your controllers' decorators and DTOs.

```ts
await app.listen(port, host);
```
Finally, starts actually listening for HTTP connections.

### `src/app.module.ts` — the root module

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PostsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

This is the map of the entire application. `ConfigModule.forRoot({ validate: validateEnv })` runs our Zod schema (`env.validation.ts`) against `process.env` at boot — if a required variable is missing or malformed, the app refuses to start with a clear error, rather than failing confusingly later. `isGlobal: true` means the resulting `ConfigService` doesn't need to be imported into every module that wants it.

### `src/config/env.validation.ts`

Uses the [Zod](https://zod.dev) library to describe exactly what environment variables the app needs and what shape they must be (e.g., `JWT_ACCESS_SECRET` must be a string of at least 16 characters). This is what makes `ConfigService.get('PORT', { infer: true })` fully typed elsewhere in the code — TypeScript knows `PORT` is a `number`, `CORS_ORIGIN` is a `string`, etc., because it was inferred from this schema.

### `src/prisma/prisma.service.ts` and `prisma.module.ts`

Covered in depth in [section 7](#7-the-database-layer-prisma). In short: `PrismaService` is a thin wrapper around Prisma's database client, and `PrismaModule` is marked `@Global()` so every other module can inject `PrismaService` without explicitly importing `PrismaModule`.

### `src/common/`

Code used by more than one feature module lives here rather than being duplicated:

- **`decorators/roles.decorator.ts`** — defines `@Roles('ADMIN')`, a tiny custom decorator that just attaches an array of allowed roles as metadata to a route, for `RolesGuard` to read later.
- **`decorators/current-user.decorator.ts`** — defines `@CurrentUser()`, a custom parameter decorator that pulls the already-authenticated user (`request.user`, set by `JwtAuthGuard`) directly into a controller method's arguments, so you never write `@Req() req` and then `req.user` yourself.
- **`guards/jwt-auth.guard.ts` and `guards/roles.guard.ts`** — explained fully in sections [8](#8-authentication-step-by-step) and [9](#9-authorization-rbac-step-by-step).
- **`filters/prisma-exception.filter.ts`** — explained in [section 11](#11-error-handling).
- **`types/fastify.d.ts`** — TypeScript, out of the box, doesn't know that `FastifyRequest` might have a `.user` property (we add that ourselves via `JwtAuthGuard`/Passport). This file uses TypeScript's "module augmentation" feature to teach it that fact, so `request.user` type-checks everywhere instead of raising an error.

---

## 7. The Database Layer: Prisma

### What is an ORM?

Talking to a database directly means writing raw SQL strings (`SELECT * FROM "User" WHERE email = $1`), which is error-prone and not type-safe. An **ORM** (Object-Relational Mapper) lets you describe your data as TypeScript-friendly objects and generates the SQL for you. **Prisma** is the ORM this project uses, talking to a **PostgreSQL** database.

### `prisma/schema.prisma` — the source of truth

This file describes every table ("model") in the database:

```prisma
model User {
  id            String         @id @default(uuid())
  email         String         @unique
  passwordHash  String
  role          Role           @default(USER)
  refreshTokens RefreshToken[]
  posts         Post[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}
```

Reading this: a `User` has a UUID primary key generated automatically, a unique `email` (Postgres will reject two users with the same email at the database level), a `passwordHash` (never the plain password — see below), a `role` defaulting to `USER`, a list of related `RefreshToken`s and `Post`s, and automatic `createdAt`/`updatedAt` timestamps.

The three models in this project and how they relate:

- **`User`** — an account. Has a `role` (`USER` or `ADMIN`).
- **`RefreshToken`** — one row per issued refresh token (hashed), linked to the `User` it belongs to. Having a whole table (rather than just trusting the JWT) is what lets the server *revoke* a refresh token before it naturally expires (used on logout and on every refresh — see [section 8](#8-authentication-step-by-step)).
- **`Post`** — the sample CRUD resource, linked to the `User` who authored it via `authorId`.

### Migrations

A **migration** is a recorded, versioned change to the database schema (e.g., "add a `Post` table"). Every migration lives as a folder of plain SQL under `prisma/migrations/`, so the exact history of schema changes is tracked in version control, and can be replayed on any environment (your machine, CI, production) to bring the database up to date.

```bash
pnpm prisma:migrate          # dev: create a new migration from schema changes + apply it + regenerate the client
pnpm prisma:migrate:deploy   # production: apply existing migrations only, don't create new ones
```

### The generated Prisma Client

Running `pnpm prisma:generate` (or `prisma:migrate`, which does it for you) reads `schema.prisma` and generates fully-typed TypeScript code into `src/generated/prisma/` — this is *not* something you write by hand or commit to git (it's in `.gitignore`); it's regenerated from the schema whenever needed, including automatically during the Docker build.

### `PrismaService`

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<EnvConfig, true>) {
    const adapter = new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) });
    super({ adapter });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

This class *is* a Prisma client (it `extends PrismaClient`) wrapped so Nest can manage its lifecycle: `onModuleInit`/`onModuleDestroy` are special Nest lifecycle hooks that run when the application starts up and shuts down, ensuring the database connection opens and closes cleanly. Anywhere else in the app, injecting `PrismaService` gives you direct access to methods like `this.prisma.user.findUnique(...)`, `this.prisma.post.create(...)`, etc. — all fully typed based on your schema.

---

## 8. Authentication, Step by Step

**Authentication** answers "who is this?" (as opposed to **authorization**, "what are they allowed to do?", covered next). This project uses **JWT** (JSON Web Tokens) — a stateless way to prove identity.

### What is a JWT?

A JWT is a string like `eyJhbGciOiJIUzI1NiIs...` made of three parts separated by dots: a header, a payload (data, e.g. `{ sub: "user-id", role: "USER" }`), and a signature. The server signs it with a secret key it alone knows. Anyone can *read* the payload (it's just base64, not encrypted), but nobody can *forge* or *modify* it without knowing the secret — so when the server receives a JWT back, it can cryptographically verify it hasn't been tampered with and was genuinely issued by this server.

Because the token itself contains everything needed to identify the user, the server doesn't need to keep a session in memory — this is what "stateless" means, and it's why JWT-based auth scales well across multiple servers.

### Why two tokens (access + refresh)?

- **Access token**: short-lived (15 minutes, by default). Sent with every authenticated request as `Authorization: Bearer <token>`. Short-lived so that if one leaks, the damage window is small.
- **Refresh token**: long-lived (7 days). Its *only* job is to obtain a new access token without forcing the user to log in again. Because it's powerful and long-lived, it's tracked server-side (in the `RefreshToken` table) so it can be revoked.

### Password hashing

Never store a plain password. This project hashes passwords with **argon2id** (`src/common/utils/hash.ts`), a modern, deliberately slow-and-memory-hungry algorithm — deliberately slow so that even if the database leaks, an attacker can't feasibly guess millions of passwords per second against the stolen hashes. (See the note in the README about the specific memory-cost tuning used here.)

Refresh tokens, by contrast, are hashed with a fast algorithm (SHA-256) before being stored — this is *not* a contradiction: a refresh token is already a long random-looking string (high entropy), unlike a human-chosen password, so there's no brute-forcing risk to defend against; the hash here exists purely so that if the database leaks, the stored value alone can't be replayed as a valid token.

### The full flow

**1. Register — `POST /auth/register`** (`auth.controller.ts` → `auth.service.ts`)

```
1. Check the email isn't already taken (findUnique) → 409 Conflict if it is
2. Hash the password (argon2id)
3. Create the User row (role defaults to USER)
4. Issue an access token + refresh token pair (see step 5, shared with login)
```

**2. Login — `POST /auth/login`**

```
1. Look up the user by email
2. Verify the submitted password against the stored hash (argon2.verify)
   → 401 Unauthorized if the user doesn't exist OR the password is wrong
   (deliberately the same error for both, so an attacker can't tell
   which emails are registered)
3. Issue an access token + refresh token pair
```

**3. Issuing a token pair** (`AuthService.issueTokenPair`, used by both register and login)

```
1. Sign an access token: payload { sub: userId, role }, 15m expiry, signed
   with JWT_ACCESS_SECRET
2. Sign a refresh token: payload { sub: userId, jti: <random> }, 7d expiry,
   signed with a DIFFERENT secret, JWT_REFRESH_SECRET
   (the `jti` — "JWT ID" — is a random nonce; without it, two tokens issued
   in the same second for the same user would be byte-identical strings,
   which would collide against the database's uniqueness constraint)
3. Hash the refresh token (SHA-256) and store it in the RefreshToken table
   with an expiresAt matching its JWT expiry
4. Return both tokens to the client
```

**4. Calling a protected route** (e.g. `GET /users/me`, guarded by `@UseGuards(JwtAuthGuard)`)

```
1. Client sends: Authorization: Bearer <accessToken>
2. JwtAuthGuard (via Passport's JwtStrategy) verifies the token's
   signature and expiry using JWT_ACCESS_SECRET
   → if invalid/expired/missing: 401 Unauthorized, the route handler
     never even runs
3. If valid, the payload { sub, role } is placed on request.user
4. The route handler runs, optionally reading request.user via @CurrentUser()
```

**5. Refresh — `POST /auth/refresh`**

```
1. Verify the submitted refresh token's signature/expiry
   (JWT_REFRESH_SECRET) → 401 if invalid
2. Hash it (SHA-256) and look it up in the RefreshToken table
   → 401 if not found, already revoked, or past its stored expiresAt
3. Mark that row revoked (revokedAt = now) — this is "rotation": a
   refresh token can only ever be used once. This also means if someone
   steals an already-used refresh token, replaying it fails.
4. Issue and return a brand new access + refresh token pair (step 3 again)
```

**6. Logout — `POST /auth/logout`**

```
1. Hash the submitted refresh token
2. Mark the matching, still-valid row in RefreshToken as revoked
   (idempotent — logging out twice, or with an already-invalid token,
   doesn't error)
```

### The guard that makes step 4 work: `JwtAuthGuard`

```ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

This one-line class plugs into `@nestjs/passport`'s `AuthGuard`, configured (via `JwtStrategy`, in `src/modules/auth/strategies/jwt.strategy.ts`) to pull the bearer token out of the `Authorization` header, verify it, and — on success — call `JwtStrategy.validate(payload)`, whose return value becomes `request.user`.

---

## 9. Authorization (RBAC), Step by Step

**Authorization** answers "now that we know who you are, are you allowed to do *this*?" This project implements **RBAC** (Role-Based Access Control) with two roles, `USER` and `ADMIN`.

### `@Roles()` + `RolesGuard`

```ts
// src/modules/users/users.controller.ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) { ... }   // no @Roles() → any authenticated user

  @Get()
  @Roles('ADMIN')                              // only ADMIN may call this
  findAll() { ... }
}
```

`@Roles('ADMIN')` doesn't check anything by itself — it just attaches `['ADMIN']` as metadata to that route. `RolesGuard` is what actually reads it and enforces it:

```ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true; // no @Roles() → allow everyone (who's already authenticated)

    const user = context.switchToHttp().getRequest().user;
    return !!user && requiredRoles.includes(user.role);
  }
}
```

`Reflector` is Nest's tool for reading decorator metadata at runtime. `getAllAndOverride` checks both the specific route handler and its controller class for `@Roles()` metadata (so you could also put `@Roles()` on an entire controller to protect every route in it).

**Order matters**: `@UseGuards(JwtAuthGuard, RolesGuard)` runs `JwtAuthGuard` first (populating `request.user`) and only then `RolesGuard` (which reads `request.user.role`). Swapping the order would break it, since `RolesGuard` would run against a request with no `user` yet.

### Ownership checks — RBAC's limit, and where the rest lives

A role check answers "is this user an admin?" — it can't answer "does this user own *this specific post*?", because that depends on data (which row is being acted on), not just who the user is. That's why `PostsService` (not a guard) enforces:

```ts
private assertCanModify(authorId: string, requester: AuthUser): void {
  const isOwner = authorId === requester.id;
  const isAdmin = requester.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    throw new ForbiddenException('You do not have access to this post');
  }
}
```

This is a common and correct split: **guards** decide *before* a database lookup whether a request is even allowed to proceed (cheap, role-based); **service-level checks** decide *after* loading the specific record whether this particular user is allowed to touch this particular record (data-dependent, ownership-based). Both, when they fail, throw `ForbiddenException` — which Nest automatically converts into a `403 Forbidden` HTTP response.

---

## 10. Validation: DTOs and class-validator

**DTO** stands for "Data Transfer Object" — just a plain class describing the *shape* of data coming in or going out of the API.

```ts
// src/modules/posts/dto/create-post.dto.ts
export class CreatePostDto {
  @ApiProperty({ example: 'My first post' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ example: 'Post content goes here.' })
  @IsString()
  @MinLength(1)
  content!: string;
}
```

`@IsString()`, `@MinLength(1)` etc. come from the `class-validator` library. `@ApiProperty()` comes from `@nestjs/swagger` and is used purely to document the field in the auto-generated Swagger docs — it doesn't affect validation.

Because `main.ts` registers a **global** `ValidationPipe`:

```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
```

...every route automatically validates its `@Body()`/`@Query()`/`@Param()` against whatever DTO class it's typed as, *before* your controller code ever runs:

- `whitelist: true` — strips any properties not declared on the DTO (so extra, unexpected fields in the request are silently dropped rather than trusted).
- `forbidNonWhitelisted: true` — instead of silently dropping unknown fields, rejects the request outright with a `400 Bad Request` if any are present.
- `transform: true` — converts the raw incoming JSON into an actual instance of the DTO class (so, e.g., `ListPostsQueryDto`'s `@Type(() => Number)` fields correctly become real numbers instead of strings, since URL query parameters always arrive as strings).

If validation fails, Nest automatically responds `400 Bad Request` with details about which field(s) failed and why — you never write this check yourself.

---

## 11. Error Handling

### Nest's built-in HTTP exceptions

Nest ships classes like `NotFoundException`, `ForbiddenException`, `ConflictException`, `UnauthorizedException`, `BadRequestException`. Throwing one anywhere in a service or controller...

```ts
if (!post) {
  throw new NotFoundException('Post not found');
}
```

...is automatically caught by Nest and turned into the matching HTTP status code (`404`, `403`, `409`, `401`, `400` respectively) with a JSON error body — you never manually set a status code or catch these yourself.

### `PrismaExceptionFilter` — translating database errors

Prisma throws its *own* error types when something goes wrong at the database level (e.g. `PrismaClientKnownRequestError` with code `P2002` for a unique-constraint violation, or `P2025` for "record to update/delete not found"). Left alone, these would surface as an opaque `500 Internal Server Error`. This project's exception filter translates them into meaningful HTTP responses instead:

```ts
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception, host) {
    const mapped = this.mapException(exception); // P2002 → ConflictException, P2025 → NotFoundException, else 500
    ...
  }
}
```

`@Catch(...)` tells Nest which exception type this filter handles; `app.useGlobalFilters(new PrismaExceptionFilter())` in `main.ts` registers it for the whole app, so it's this filter's mapping you saw earlier turn a duplicate-email registration into a clean `409 Conflict` rather than a crash.

---

## 12. Testing

This project has two kinds of automated tests, run with **[Vitest](https://vitest.dev)**.

### Unit tests — `src/modules/auth/auth.service.spec.ts`

A unit test checks one class in isolation, with all its dependencies replaced by fakes ("mocks"), so the test is fast and doesn't need a real database:

```ts
const module = await Test.createTestingModule({
  providers: [
    AuthService,
    { provide: TokenService, useValue: { signAccessToken: vi.fn().mockResolvedValue('access-token'), ... } },
    { provide: PrismaService, useValue: prisma /* a plain object with fake findUnique/create functions */ },
  ],
}).compile();
```

This only works cleanly *because* of dependency injection (section 4.4): `AuthService` never calls `new PrismaService()` itself, so a test can hand it a completely fake stand-in without `AuthService`'s own code needing to know or care.

```bash
pnpm test          # run unit tests
```

### End-to-end (e2e) tests — `test/*.e2e-spec.ts`

An e2e test boots the *real* application (real modules, real database connection) and sends real HTTP requests at it, checking the full stack behaves correctly:

```ts
const app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
await app.init();
const response = await app.inject({ method: 'GET', url: '/posts' });
expect(response.statusCode).toBe(401);
```

`app.inject(...)` is a Fastify feature that simulates an HTTP request without actually opening a network socket — faster and simpler than spinning up a real server and using an HTTP client library. These tests need a real PostgreSQL database (e.g., via `pnpm docker:up`) since they exercise real Prisma queries.

```bash
pnpm test:e2e      # run e2e tests (needs DATABASE_URL pointed at a real database)
```

---

## 13. Docker

**Docker** packages an application together with everything it needs to run (Node.js itself, dependencies, etc.) into a portable, isolated unit called a **container** — "it works on my machine" becomes "it works in this container, anywhere."

### `Dockerfile` — building the app's image

This project's `Dockerfile` uses a **multi-stage build**, meaning it uses several temporary intermediate images before producing the final, small one:

```
deps stage    → install all dependencies (dev + prod)
build stage   → generate the Prisma client, compile TypeScript (`pnpm build`)
runtime stage → fresh, minimal image; install ONLY production dependencies;
                copy in just the compiled `dist/`, the generated Prisma client,
                and the Prisma schema/migrations
```

The point of doing it this way: the tools needed to *build* the app (TypeScript compiler, dev dependencies, etc.) don't need to exist in the final image that actually *runs* the app — keeping it smaller and reducing what an attacker could exploit if they ever got into the running container. The final `CMD` runs `prisma migrate deploy` (apply any pending migrations) and then starts the compiled server (`node dist/main.js`).

### `docker-compose.yml` — running multiple containers together

A real deployment needs both the app *and* a PostgreSQL database running together, able to talk to each other. **Docker Compose** describes this as one file:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    healthcheck: ...
  app:
    build: .
    depends_on:
      postgres:
        condition: service_healthy   # don't start the app until Postgres is ready to accept connections
```

```bash
pnpm docker:up               # start just Postgres (handy for local development, where you run the app itself with `pnpm start:dev`)
docker compose up --build    # build and start EVERYTHING (Postgres + the app) in containers
```

---

## 14. Walkthrough: Adding a New Feature

Say you want to add a `comments` feature (comments on posts). Here's the complete, concrete path through everything explained above:

1. **Add the data model** to `prisma/schema.prisma`:
   ```prisma
   model Comment {
     id        String   @id @default(uuid())
     content   String
     postId    String
     post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
     authorId  String
     author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
     createdAt DateTime @default(now())
   }
   ```
   Then run `pnpm prisma:migrate` — this creates a migration file, applies it to your local database, and regenerates the typed Prisma client.

2. **Scaffold the module**: `pnpm dlx @nestjs/cli generate resource modules/comments` (or copy `src/modules/posts/` as a starting template and rename everything).

3. **Write the DTO(s)** in `src/modules/comments/dto/create-comment.dto.ts`, with `class-validator` decorators for validation and `@ApiProperty()` for docs — same pattern as `create-post.dto.ts`.

4. **Write the service** (`comments.service.ts`) — inject `PrismaService`, write the actual database logic (create, findAll, etc.), following `posts.service.ts` as a template — including an ownership check if only the comment's author (or an admin) should be able to delete it.

5. **Write the controller** (`comments.controller.ts`) — thin methods that call the service, decorated with `@Get()`/`@Post()`/etc., protected with `@UseGuards(JwtAuthGuard)` (and `@Roles()`/`RolesGuard` too, if some action should be admin-only).

6. **Write the module** (`comments.module.ts`) — `@Module({ imports: [AuthModule], controllers: [CommentsController], providers: [CommentsService] })`. Import `AuthModule` specifically because `JwtAuthGuard` needs `PassportModule` (exported by `AuthModule`) to be available — see the comment in `auth.module.ts` for why.

7. **Register the module** in `src/app.module.ts`'s `imports` array — this is the one line that actually makes Nest aware the new module exists.

8. **Write tests**: a unit test for `CommentsService` with a mocked `PrismaService` (copy the pattern in `auth.service.spec.ts`), and an e2e test hitting the real routes (copy the pattern in `test/posts.e2e-spec.ts`).

That's the entire loop — every feature in this codebase (`auth`, `users`, `posts`) was built this same way, and every future one will be too.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **API** | A set of URLs a program exposes so other programs can interact with it |
| **REST** | A convention for API design: URLs are resources, HTTP methods are actions |
| **JSON** | The text format almost all modern APIs use for request/response data |
| **Node.js** | The runtime that executes JavaScript/TypeScript outside a browser |
| **Fastify** | The HTTP server library this project uses (an alternative to Express) |
| **NestJS** | The framework providing structure (modules, DI, etc.) on top of Fastify |
| **TypeScript** | JavaScript plus a compile-time type system |
| **Decorator** | `@Something()` syntax — attaches metadata to a class/method/property |
| **Module** | A `@Module()`-decorated class grouping related controllers/providers |
| **Controller** | A `@Controller()`-decorated class defining HTTP routes |
| **Provider / Service** | An `@Injectable()`-decorated class holding business logic |
| **DI (Dependency Injection)** | Nest automatically constructing classes and wiring their dependencies |
| **Guard** | Runs before a route handler; decides if the request is *allowed* to proceed |
| **Pipe** | Runs before a route handler; validates/transforms incoming data |
| **Filter** | Catches thrown errors and converts them into HTTP responses |
| **DTO** | A plain class describing the shape/validation rules of request data |
| **ORM** | A library mapping database tables to typed code objects (here: Prisma) |
| **Migration** | A versioned, recorded change to the database schema |
| **JWT** | A signed token proving identity, without needing server-side sessions |
| **Access token** | Short-lived JWT sent with every authenticated request |
| **Refresh token** | Long-lived, server-tracked token used only to obtain a new access token |
| **Authentication** | Confirming *who* a user is |
| **Authorization / RBAC** | Confirming *what* an authenticated user is allowed to do |
| **Hashing** | One-way scrambling of data (e.g. passwords) so the original can't be recovered |
| **Docker / container** | Packaging an app + its runtime environment into a portable unit |
| **CI/CD** | Automatically building/testing/deploying code on every change (not yet set up in this project) |
