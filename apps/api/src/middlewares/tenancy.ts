import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@autotaxflow/db";

declare module 'fastify' {
    interface FastifyRequest {
        currentOrgId?: string;
        currentUserRole?: string;
    }
}

/**
 * TENANCY MIDDLEWARE (ORGANIZATION SECURITY)
 * Protege que un usuario no acceda a una Org de la que no es miembro.
 */
export async function verifyOrganizationAccess(
    this: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const { orgId } = request.params as { orgId: string };

    if (!orgId) {
        return reply.status(400).send({ error: "Organization ID is required in URL" });
    }

    // Placeholder para Sesión: Suponemos que ya tenemos req.user.id de un auth plugin (ej: Clerk o session cookie)
    const userId = request.headers["x-user-id"] as string || "DEFAULT_USER_ID_FOR_DEV";

    // Buscar membresía en la base de datos
    const membership = await prisma.membership.findUnique({
        where: {
            organizationId_userId: {
                organizationId: orgId,
                userId
            }
        },
        include: { organization: true }
    });

    if (!membership) {
        // Si no es miembro, devolvemos 403 Forbidden
        return reply.status(403).send({
            error: "Acceso denegado: No eres miembro de esta organización.",
            orgId
        });
    }

    // Inyectamos la Org y el Rol en la Request para que las rutas la usen
    request.currentOrgId = orgId;
    request.currentUserRole = membership.role;

    // Continuar con la ejecución de la ruta
}

/**
 * REGLA DE ROL (MIDDLEWARE ADICIONAL OPCIONAL)
 * Verifica si el miembro tiene un rol mínimo (ej: ADMIN)
 */
export const requireRole = (minRole: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.currentUserRole || !minRole.includes(request.currentUserRole)) {
            reply.status(403).send({ error: "Inadequate permissions for this operation." });
        }
    };
};
