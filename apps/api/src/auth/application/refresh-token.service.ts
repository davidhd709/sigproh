import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export type GeneratedRefreshToken = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

@Injectable()
export class RefreshTokenService {
  generate(expirationDays = 7): GeneratedRefreshToken {
    const token = randomBytes(64).toString('base64url');

    return {
      token,
      tokenHash: this.hash(token),
      expiresAt: new Date(
        Date.now() + expirationDays * 24 * 60 * 60 * 1000,
      ),
    };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}