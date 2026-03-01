import { Worker } from "bullmq";
import IORedis from "ioredis";
import "dotenv/config";
import { processStripeIngest } from "./jobs/stripe-ingest";

const redisConnection = new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
});

/**
 * WORKER DE INGESTA PRAL
 * Escucha la cola 'ingest_queue' y despacha trabajos de Stripe
 */
const ingestWorker = new Worker(
    "ingest_queue",
    async (job) => {
        switch (job.name) {
            case "stripe.ingestEvent":
                return await processStripeIngest(job.data);
            default:
                console.warn(`⚠️ Trabajo desconocido: ${job.name}`);
        }
    },
    {
        connection: redisConnection,
        concurrency: 10,
    }
);

ingestWorker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} [${job.name}] finalizado con éxito`);
});

ingestWorker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} [${job?.name}] falló: ${err.message}`);
});

console.log("🚀 Worker de AutoTaxFlow encendido y escuchando Redis...");
