import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const EMAIL_PREFIX = 'posts-e2e-';

describe('Posts (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    prisma = app.get(PrismaService);

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });
    await app.close();
  });

  function uniqueCredentials() {
    return {
      email: `${EMAIL_PREFIX}${randomUUID()}@example.com`,
      password: 'Password123!',
    };
  }

  async function registerAndLogin() {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: uniqueCredentials(),
    });
    return response.json().accessToken as string;
  }

  it('rejects unauthenticated access', async () => {
    const response = await app.inject({ method: 'GET', url: '/posts' });
    expect(response.statusCode).toBe(401);
  });

  it('allows an authenticated user to create and fetch their own post', async () => {
    const token = await registerAndLogin();

    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Hello', content: 'World' },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json();

    const fetched = await app.inject({
      method: 'GET',
      url: `/posts/${post.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().title).toBe('Hello');
  });

  it('forbids a non-owner, non-admin user from updating the post', async () => {
    const ownerToken = await registerAndLogin();
    const otherToken = await registerAndLogin();

    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { title: 'Owned', content: 'Body' },
    });
    const post = created.json();

    const attempt = await app.inject({
      method: 'PATCH',
      url: `/posts/${post.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { title: 'Hijacked' },
    });
    expect(attempt.statusCode).toBe(403);
  });
});
