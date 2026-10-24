import { Injectable, UnauthorizedException } from '@nestjs/common';

import { Role } from '../../generated/prisma/client';
import { PasswordHasherPort } from './password-hasher.port';
import { UserRepository } from '../domain/user.repository';

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginResult = {
  userId: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
};

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();

    const user = await this.users.findByEmail(email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordIsValid = await this.passwordHasher.verify(
      user.passwordHash,
      input.password,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.users.recordLogin(user.id);

    return {
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }
}