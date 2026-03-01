import { FastifyInstance } from "fastify";
import { ingestQueue } from "../../lib/bullmq";
import Stripe from "stripe";
// import { prisma } from "@autotaxflow/db"; // Dependerá de la fase de DB

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2025-01-27.acacia" as any,
});

/**
 * STRIPE WEBHOOK GATEWAY
 * El endpoint "ciego" que recibe, valida y encola los eventos.
 */
export async function stripeWebhookRoutes(fastify: FastifyInstance) {
    fastify.post("/", {
        config: {
            rawBody: true, // Necesario para la firma de Stripe
        },
        handler: async (request, reply) => {
            const sig = request.headers["stripe-signature"] as string;
            const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

            if (!sig || !webhookSecret) {
                return reply.status(400).send({ error: "Missing signature or secret" });
            }

            let event: Stripe.Event;

            try {
                // Validación criptográfica de la autenticidad del evento
                event = stripe.webhooks.constructEvent(
                    request.body as string | Buffer,
                    sig,
                    webhookSecret
                );
            } catch (err: any) {
                fastify.log.warn(`⚠️ Webhook signature validation failed: ${err.message}`);
                return reply.status(400).send(`Webhook Error: ${err.message}`);
            }

            // 1. Persistencia Inmediata Cruda (Idempotencia)
            // Guardamos en BD si quisiéramos antes de encolar, o dejamos que el Worker lo haga.
            // Para un scale masivo, guardamos aquí y pasamos el ID a la cola.

            // 2. Encolamiento Cinico
            // Mandamos a BullMQ para que el worker procese esto sin bloquear el OK a Stripe.
            await ingestQueue.add("stripe.ingestEvent", {
                provider: "STRIPE",
                eventId: event.id,
                payload: event,
                receivedAt: new Date().toISOString(),
            });

            // Respondemos OK a Stripe en < 200ms
            return reply.status(200).send({ received: true });
        },
    });
}
