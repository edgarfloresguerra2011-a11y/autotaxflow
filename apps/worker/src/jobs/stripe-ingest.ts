import { prisma } from "@autotaxflow/db";
import Stripe from "stripe";

interface StripeIngestData {
    provider: "STRIPE";
    eventId: string;
    payload: Stripe.Event; // El payload crudo que guardamos en la API
}

/**
 * PROCESADOR DE INGESTA DE STRIPE
 * Toma un evento crudo de un webhook y decide qué hacer con él.
 */
export async function processStripeIngest(data: StripeIngestData) {
    const { eventId, payload } = data;

    try {
        // 1. Verificar duplicidad (Idempotencia en Worker nivel DB)
        const existing = await prisma.webhookEvent.findUnique({
            where: { provider_eventId: { provider: "STRIPE", eventId } },
        });

        if (existing?.status === "PROCESSED") {
            console.log(`⏩ Evento ${eventId} ya procesado, saltando...`);
            return;
        }

        // 2. Upsert del WebhookEvent (Inicialización)
        const webhook = await prisma.webhookEvent.upsert({
            where: { provider_eventId: { provider: "STRIPE", eventId } },
            create: {
                provider: "STRIPE",
                eventId,
                payload: payload as any,
                status: "PROCESSING",
            },
            update: { status: "PROCESSING" },
        });

        // 3. Dispatch según tipo de evento
        switch (payload.type) {
            case "charge.succeeded":
                await handleChargeSucceeded(payload.data.object as Stripe.Charge, webhook.id);
                break;
            case "charge.refunded":
                await handleChargeRefunded(payload.data.object as Stripe.Charge, webhook.id);
                break;
            default:
                console.log(`🔘 Evento ${payload.type} ignorado (sin handler asignado)`);
        }

        // 4. Marcar como finalizado
        await prisma.webhookEvent.update({
            where: { id: webhook.id },
            data: { status: "PROCESSED", processedAt: new Date() },
        });

    } catch (err: any) {
        console.error(`💥 Error procesando Stripe Event ${eventId}: ${err.message}`);
        // Marcar como error para inspección manual
        await prisma.webhookEvent.update({
            where: { provider_eventId: { provider: "STRIPE", eventId } },
            data: { status: "ERROR", error: err.message },
        }).catch(() => { });
        throw err; // Para que BullMQ lo reintente
    }
}

/**
 * CARGO EXITOSO -> Transacción de Ingreso
 */
async function handleChargeSucceeded(charge: Stripe.Charge, webhookId: string) {
    const stripeAccountId = charge.on_behalf_of || charge.customer?.toString() || "UNKNOWN";

    // Buscar Organización (Tenant) por External Account ID (Stripe)
    const connectedAccount = await prisma.connectedAccount.findFirst({
        where: { externalAccountId: stripeAccountId, provider: "STRIPE" },
        include: { organization: true },
    });

    if (!connectedAccount) {
        console.warn(`🛑 No se encontró Org para Stripe Account: ${stripeAccountId}`);
        return;
    }

    // Insertar Transacción Normalizada
    await prisma.transaction.create({
        data: {
            organizationId: connectedAccount.organizationId,
            sourceProvider: "STRIPE",
            sourceId: charge.id,
            type: "CHARGE",
            amount: charge.amount / 100, // Stripe manda en centavos
            currency: charge.currency.toUpperCase(),
            occurredAt: new Date(charge.created * 1000),
            customerState: charge.billing_details?.address?.state || null,
            customerCountry: charge.billing_details?.address?.country || null,
            rawJson: charge as any,
        },
    });
}

/**
 * REEMBOLSO -> Transacción de Egreso (Refund)
 */
async function handleChargeRefunded(charge: Stripe.Charge, webhookId: string) {
    // Lógica similar para revertir montos o crear facturas negativas
}
