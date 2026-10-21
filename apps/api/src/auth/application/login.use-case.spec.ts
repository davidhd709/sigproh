import { describe, expect, it } from 'vitest';

import { LoginUseCase } from './login.use-case';
import { PasswordHasherPort } from './password-hasher.port';
import { UserRepository } from '../domain/user.repository';

class FakeUserRepository extends UserRepository {
  async findByEmail(email: string) {
    if (email !== 'admin@sigproh.local') {
      return null;
    }

    return {
      id: 'user-1',
      organizationId: 'org-1',
      email: 'admin@sigproh.local',
      passwordHash: 'hash',
      firstName: 'Administrador',
      lastName: 'SIGPROH',
      role: 'ADMINISTRADOR' as const,
      isActive: true,
    };
  }
}

class FakePasswordHasher extends PasswordHasherPort {
  async hash(password: string): Promise<string> {
    return password;
  }

  async verify(_hash: string, password: string): Promise<boolean> {
    return password === 'Cambiar123!';
  }
}

describe('LoginUseCase', () => {
  it('debe autenticar con credenciales válidas', async () => {
    const useCase = new LoginUseCase(
      new FakeUserRepository(),
      new FakePasswordHasher(),
    );

    const result = await useCase.execute({
      email: 'ADMIN@SIGPROH.LOCAL',
      password: 'Cambiar123!',
    });

    expect(result.email).toBe('admin@sigproh.local');
    expect(result.userId).toBe('user-1');
  });

  it('debe rechazar una contraseña incorrecta', async () => {
    const useCase = new LoginUseCase(
      new FakeUserRepository(),
      new FakePasswordHasher(),
    );

    await expect(
      useCase.execute({
        email: 'admin@sigproh.local',
        password: 'incorrecta',
      }),
    ).rejects.toThrow('Credenciales inválidas');
  });

  it('debe rechazar un usuario inexistente', async () => {
    const useCase = new LoginUseCase(
      new FakeUserRepository(),
      new FakePasswordHasher(),
    );

    await expect(
      useCase.execute({
        email: 'otro@sigproh.local',
        password: 'Cambiar123!',
      }),
    ).rejects.toThrow('Credenciales inválidas');
  });
});