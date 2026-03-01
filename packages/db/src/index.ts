// @autotaxflow/db - Punto de entrada principal
// Aquí se exportará el PrismaClient compartido entre todos los microservicios

export * from '@prisma/client';

/**
 * Placeholder para cuando se ejecute 'prisma generate'.
 * Centraliza la instancia para evitar múltiples conexiones en desarrollo.
 */
// export const prisma = new PrismaClient();
