export interface DevAccount {
  email: string;
  password?: string;
  name: string;
  role:
    | 'DIRECTOR_OPERATIVO'
    | 'COORDINADOR_OPERATIVO'
    | 'GERENTE'
    | 'AUXILIAR_GERENCIA'
    | 'ADMINISTRADOR';
  label: string;
}

export interface AppEnvironment {
  production: boolean;
  enableDevAccounts: boolean;
  devAccounts: DevAccount[];
}
