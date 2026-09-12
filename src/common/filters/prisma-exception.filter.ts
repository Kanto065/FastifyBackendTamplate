import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { FastifyReply } from 'fastify';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    const mapped = this.mapException(exception);
    const response = mapped.getResponse();

    void reply.status(mapped.getStatus()).send(response);
  }

  private mapException(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return new ConflictException(
          `A record with this ${(exception.meta?.target as string[] | undefined)?.join(', ') ?? 'value'} already exists`,
        );
      case 'P2025':
        return new NotFoundException('Record not found');
      default:
        return new InternalServerErrorException('Unexpected database error');
    }
  }
}
