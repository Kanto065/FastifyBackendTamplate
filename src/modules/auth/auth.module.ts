import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy],
  // PassportModule is exported so any module using JwtAuthGuard/RolesGuard
  // (which rely on AuthGuard('jwt')'s injected AuthModuleOptions) can import
  // AuthModule instead of registering PassportModule again themselves.
  exports: [PassportModule],
})
export class AuthModule {}
