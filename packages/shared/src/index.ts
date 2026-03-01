// @autotaxflow/shared - Punto de entrada para constantes, tipos y esquemas Zod

import { z } from 'zod';

export const API_VERSION = 'v1';

// Ejemplo de un esquema compartido
export const OrganizationSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(2),
});

export type Organization = z.infer<typeof OrganizationSchema>;
