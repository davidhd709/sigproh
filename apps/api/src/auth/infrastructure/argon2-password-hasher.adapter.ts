import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

import { PasswordHasherPort } from '../application/password-hasher.port';

@Injectable()
export class Argon2PasswordHasherAdapter implements PasswordHasherPort {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      hashLength: 32,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}