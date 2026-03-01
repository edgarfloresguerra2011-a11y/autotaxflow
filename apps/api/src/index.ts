import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";

const fastify = Fastify({
    logger: {
        transport: {
            target: "pino-pretty",
            options: {
                colorize: true,
            },
        },
    },
});

async function bootstrap() {
    try {
        // Plugins
        await fastify.register(cors, {
            origin: true, // Allow all origins in dev
        });

        // -------------------------------------------------------------------------
        // RUEGOS Y SALUDOS: RUTAS BASE
        // -------------------------------------------------------------------------
        fastify.get("/health", async () => {
            return { status: "OK", timestamp: new Date().toISOString() };
        });

        // -------------------------------------------------------------------------
        // REGISTRO DE RUTAS DINÁMICAS
        // -------------------------------------------------------------------------
        // Aquí registraremos los módulos: webhooks, orgs, nexus, etc.
        // await fastify.register(stripeWebhookRoutes, { prefix: "/api/webhooks/stripe" });

        const PORT = Number(process.env.PORT) || 3001;
        await fastify.listen({ port: PORT, host: "0.0.0.0" });

        console.log(`🚀 AutoTaxFlow API Gateway corriendo en http://localhost:${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

bootstrap();
