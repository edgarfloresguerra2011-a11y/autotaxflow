import { Queue } from "bullmq";
import IORedis from "ioredis";

// Conexión central de Redis compartida entre API y Workers
export const redisConnection = new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null, // Necesario para BullMQ
});

// Definición de Colas
export const ingestQueue = new Queue("ingest_queue", {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
    },
});

export const syncQueue = new Queue("sync_queue", { connection: redisConnection });
export const reportQueue = new Queue("report_queue", { connection: redisConnection });
