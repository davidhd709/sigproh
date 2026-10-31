import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  enableDevAccounts: true,
  devAccounts: [
    {
      email: 'director@sigproh.local',
      password: 'Cambiar123!',
      name: 'Carlos Director Operativo',
      role: 'DIRECTOR_OPERATIVO',
      label: '👑 Director Operativo (Carlos)',
    },
    {
      email: 'coordinador1@sigproh.local',
      password: 'Cambiar123!',
      name: 'Juan Coordinador Norte',
      role: 'COORDINADOR_OPERATIVO',
      label: '👷 Coordinador (Juan - Torre Norte y Torre Sur)',
    },
    {
      email: 'gerencia@sigproh.local',
      password: 'Cambiar123!',
      name: 'María Gerente General',
      role: 'GERENTE',
      label: '🏢 Gerente General (María)',
    },
    {
      email: 'auxiliar@sigproh.local',
      password: 'Cambiar123!',
      name: 'Ana Auxiliar Gerencia',
      role: 'AUXILIAR_GERENCIA',
      label: '📑 Auxiliar de Gerencia (Ana)',
    },
    {
      email: 'admin@sigproh.local',
      password: 'Cambiar123!',
      name: 'Administrador Sistema',
      role: 'ADMINISTRADOR',
      label: '⚙️ Administrador del Sistema',
    },
  ],
};
