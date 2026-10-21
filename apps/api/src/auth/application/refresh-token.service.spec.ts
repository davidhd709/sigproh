import { describe, expect, it } from 'vitest';

import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService', () => {
  const service = new RefreshTokenService();

  it('debe generar un refresh token aleatorio', () => {
    const first = service.generate();
    const second = service.generate();

    expect(first.token).not.toBe(second.token);
  });

  it('no debe almacenar el token plano como hash', () => {
    const result = service.generate();

    expect(result.tokenHash).not.toBe(result.token);
    expect(result.tokenHash).toHaveLength(64);
  });

  it('debe generar el mismo hash para el mismo token', () => {
    const result = service.generate();

    expect(service.hash(result.token)).toBe(result.tokenHash);
  });

  it('debe generar una expiración futura', () => {
    const result = service.generate();

    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});