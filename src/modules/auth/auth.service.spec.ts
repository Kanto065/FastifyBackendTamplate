import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashPassword } from '../../common/utils/hash.js';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    refreshToken: { create: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: TokenService,
          useValue: {
            signAccessToken: vi.fn().mockResolvedValue('access-token'),
            signRefreshToken: vi.fn().mockResolvedValue('refresh-token'),
            verifyRefreshToken: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('7d') },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('registers a new user and returns a token pair', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      role: 'USER',
    });

    const result = await service.register({
      email: 'new@example.com',
      password: 'Password123!',
    });

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it('rejects registration when the email is already taken', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.register({ email: 'taken@example.com', password: 'Password123!' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects login with an incorrect password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: 'USER',
      passwordHash: await hashPassword('correct-password'),
    });

    await expect(
      service.login({ email: 'user@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
