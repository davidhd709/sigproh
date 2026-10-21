import { describe, expect, it } from 'vitest';

import { Argon2PasswordHasherAdapter } from './argon2-password-hasher.adapter';

describe('Argon2PasswordHasherAdapter', () => {
  const hasher = new Argon2PasswordHasherAdapter();

  it('debe generar un hash Argon2id', async () => {
    const hash = await hasher.hash('PasswordSegura123!');

    expect(hash).toContain('$argon2id$');
    expect(hash).not.toBe('PasswordSegura123!');
  });

  it('debe validar una contraseña correcta', async () => {
    const password = 'PasswordSegura123!';
    const hash = await hasher.hash(password);

    const result = await hasher.verify(hash, password);

    expect(result).toBe(true);
  });

  it('debe rechazar una contraseña incorrecta', async () => {
    const hash = await hasher.hash('PasswordSegura123!');

    const result = await hasher.verify(hash, 'OtraPassword123!');

    expect(result).toBe(false);
  });
});