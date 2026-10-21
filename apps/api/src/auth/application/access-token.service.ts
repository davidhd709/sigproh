import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { LoginResult } from './login.use-case';

@Injectable()
export class AccessTokenService {
  constructor(private readonly jwt: JwtService) {}

  async generate(user: LoginResult): Promise<string> {
    return this.jwt.signAsync({
      sub: user.userId,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
    });
  }
}