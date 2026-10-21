import 'dotenv/config';

import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL no está configurada');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main(): Promise<void> {
  const organization = await prisma.organization.upsert({
    where: {
      id: '00000000-0000-0000-0000-000000000001',
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'EG S.A.S.',
    },
  });

  const defaultPassword = 'Cambiar123!';
  const passwordHash = await argon2.hash(defaultPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
  });

  const usersToSeed = [
    {
      id: '00000000-0000-0000-0000-000000000010',
      email: 'admin@sigproh.local',
      firstName: 'Administrador',
      lastName: 'Sistema',
      role: 'ADMINISTRADOR' as const,
    },
    {
      id: '00000000-0000-0000-0000-000000000011',
      email: 'director@sigproh.local',
      firstName: 'Carlos',
      lastName: 'Director Operativo',
      role: 'DIRECTOR_OPERATIVO' as const,
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      email: 'gerencia@sigproh.local',
      firstName: 'María',
      lastName: 'Gerente General',
      role: 'GERENTE' as const,
    },
    {
      id: '00000000-0000-0000-0000-000000000013',
      email: 'auxiliar@sigproh.local',
      firstName: 'Ana',
      lastName: 'Auxiliar Gerencia',
      role: 'AUXILIAR_GERENCIA' as const,
    },
    {
      id: '00000000-0000-0000-0000-000000000014',
      email: 'coordinador1@sigproh.local',
      firstName: 'Juan',
      lastName: 'Coordinador Norte',
      role: 'COORDINADOR_OPERATIVO' as const,
    },
    {
      id: '00000000-0000-0000-0000-000000000015',
      email: 'coordinador2@sigproh.local',
      firstName: 'Pedro',
      lastName: 'Coordinador Sur',
      role: 'COORDINADOR_OPERATIVO' as const,
    },
  ];

  for (const u of usersToSeed) {
    await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: organization.id,
          email: u.email,
        },
      },
      update: {
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
      },
      create: {
        id: u.id,
        organizationId: organization.id,
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isActive: true,
      },
    });
  }

  // Propiedades
  const prop1 = await prisma.property.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: 'PH-TORRES-PARQUE',
      },
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      organizationId: organization.id,
      name: 'Torres del Parque',
      code: 'PH-TORRES-PARQUE',
      address: 'Calle 100 # 15-20',
      nit: '900.123.456-1',
    },
  });

  const prop2 = await prisma.property.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: 'PH-RESERVA-PLAZA',
      },
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000021',
      organizationId: organization.id,
      name: 'Reserva de la Plaza',
      code: 'PH-RESERVA-PLAZA',
      address: 'Carrera 7 # 72-10',
      nit: '900.789.012-3',
    },
  });

  // Zonas de propiedad
  const zonesToSeed = [
    { propertyId: prop1.id, name: 'Ascensores Torre A y B', description: 'Equipos principales' },
    { propertyId: prop1.id, name: 'Piscina y Zonas Húmedas', description: 'Área común de recreación' },
    { propertyId: prop1.id, name: 'Cuarto de Bombas', description: 'Sistema de presión hidroneumático' },
    { propertyId: prop2.id, name: 'Acceso Vehicular y Puerta Eléctrica', description: 'Portería vehicular' },
    { propertyId: prop2.id, name: 'Subestación Eléctrica', description: 'Transformadores y planta eléctrica' },
  ];

  for (const z of zonesToSeed) {
    const existingZone = await prisma.propertyZone.findFirst({
      where: { propertyId: z.propertyId, name: z.name },
    });
    if (!existingZone) {
      await prisma.propertyZone.create({
        data: {
          propertyId: z.propertyId,
          name: z.name,
          description: z.description,
        },
      });
    }
  }

  // Áreas Internas
  const area1 = await prisma.internalArea.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: 'AREA-OPERACIONES',
      },
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000030',
      organizationId: organization.id,
      name: 'Operaciones EG S.A.S.',
      code: 'AREA-OPERACIONES',
      description: 'Gestión y coordinación operativa interna',
    },
  });

  const area2 = await prisma.internalArea.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: 'AREA-SISTEMAS',
      },
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000031',
      organizationId: organization.id,
      name: 'Tecnología y Sistemas',
      code: 'AREA-SISTEMAS',
      description: 'Infraestructura TI y soporte tecnológico',
    },
  });

  // Asignaciones de Coordinadores a Propiedades
  // Coordinador 1 asignado a Torres del Parque como Líder
  await prisma.propertyAssignment.upsert({
    where: {
      propertyId_userId: {
        propertyId: prop1.id,
        userId: '00000000-0000-0000-0000-000000000014',
      },
    },
    update: { isLead: true, isActive: true },
    create: {
      propertyId: prop1.id,
      userId: '00000000-0000-0000-0000-000000000014',
      isLead: true,
      isActive: true,
    },
  });

  // Coordinador 2 asignado a Reserva de la Plaza como Líder
  await prisma.propertyAssignment.upsert({
    where: {
      propertyId_userId: {
        propertyId: prop2.id,
        userId: '00000000-0000-0000-0000-000000000015',
      },
    },
    update: { isLead: true, isActive: true },
    create: {
      propertyId: prop2.id,
      userId: '00000000-0000-0000-0000-000000000015',
      isLead: true,
      isActive: true,
    },
  });

  // Asignación de Área Interna (Coordinador 1 asignado a Área de Operaciones)
  await prisma.areaAssignment.upsert({
    where: {
      internalAreaId_userId: {
        internalAreaId: area1.id,
        userId: '00000000-0000-0000-0000-000000000014',
      },
    },
    update: { isLead: true, isActive: true },
    create: {
      internalAreaId: area1.id,
      userId: '00000000-0000-0000-0000-000000000014',
      isLead: true,
      isActive: true,
    },
  });

  // Categorías base
  const categoriesToSeed = [
    {
      id: '00000000-0000-0000-0000-000000000040',
      scope: 'PROPIEDAD' as const,
      name: 'Mantenimiento Locativo',
      description: 'Reparaciones locativas, pintura, albañilería',
      requiresEvidence: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000041',
      scope: 'PROPIEDAD' as const,
      name: 'Equipos y Maquinaria',
      description: 'Ascensores, motobombas, plantas eléctricas',
      requiresEvidence: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000042',
      scope: 'PROPIEDAD' as const,
      name: 'Seguridad y Accesos',
      description: 'Puertas vehiculares, cámaras, citofonía',
      requiresEvidence: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000043',
      scope: 'INTERNA' as const,
      name: 'Gestión Operativa',
      description: 'Novedades internas operativas de EG S.A.S.',
      requiresEvidence: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000044',
      scope: 'INTERNA' as const,
      name: 'Tecnología y Sistemas',
      description: 'Equipos de cómputo, redes y software',
      requiresEvidence: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000045',
      scope: 'PROPIEDAD' as const,
      name: 'Gestión Administrativa',
      description: 'Comunicaciones, avisos o circulares que no requieren evidencia física de cierre',
      requiresEvidence: false,
    },
  ];

  for (const cat of categoriesToSeed) {
    await prisma.category.upsert({
      where: {
        organizationId_scope_name: {
          organizationId: organization.id,
          scope: cat.scope,
          name: cat.name,
        },
      },
      update: {
        description: cat.description,
        requiresEvidence: cat.requiresEvidence,
        isActive: true,
      },
      create: {
        id: cat.id,
        organizationId: organization.id,
        scope: cat.scope,
        name: cat.name,
        description: cat.description,
        requiresEvidence: cat.requiresEvidence,
        isActive: true,
      },
    });
  }

  console.log('Semilla completada exitosamente.');
  console.log('Usuarios creados: admin, director, gerencia, auxiliar, coordinador1, coordinador2');
  console.log('Propiedades: Torres del Parque (Coord 1), Reserva de la Plaza (Coord 2)');
  console.log('Áreas internas: Operaciones, Tecnología y Sistemas');
  console.log('Categorías: Mantenimiento, Equipos, Seguridad, Gestión Operativa, Tecnología');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });