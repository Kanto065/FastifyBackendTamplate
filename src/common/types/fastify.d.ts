import type { AuthUser } from './auth-user.interface.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
