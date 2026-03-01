# AutoTaxFlow - Especificación de Endpoints y Schemas (Zod)

El siguiente es el diseño de la API para el Gateway principal (recomendado **Fastify** + **fastify-zod**). Todas las rutas (a excepción de los webhooks) estarán protegidas por un Middleware de Autenticación que inyecta `req.user` y valida que el usuario tiene acceso a la `:orgId` (Middlewares de Tenancy).

## 1. Zod Schemas Compartidos (`packages/shared/schemas.ts`)

```typescript
import { z } from 'zod';

// UUID standard
export const UuidSchema = z.string().uuid();

// Paginación Básica
export const PaginationQuery = z.object({
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20),
});

// Rangos de Fecha
export const DateRangeQuery = z.object({
  from: z.string().datetime(), // ISO 8601
  to: z.string().datetime(),
});
```

---

## 2. Autenticación y Organizaciones

### POST `/api/auth/login`
Autenticación estándar o recepción de token OAuth.

### POST `/api/orgs`
Crea una nueva corporación (Tenant).
```typescript
const CreateOrgBody = z.object({
  name: z.string().min(2).max(100),
  country: z.string().length(2), // ej: US
  baseCurrency: z.string().length(3).default('USD'),
});
```

---

## 3. Webhooks & Integraciones

### POST `/api/webhooks/stripe`
Recibe eventos de Stripe. No requiere OrgId en el path (Stripe lo manda en el payload).
*   **Seguridad:** Requiere validación de firma con `stripe.webhooks.constructEvent()`.
*   **Endpoint ciego:** Solo guarda el payload crudo en la tabla `WebhookEvent` y encola un trabajo en BullMQ; responde `200 OK` inmediatamente.

### POST `/api/orgs/:orgId/integrations/stripe/connect`
Inicia el flujo OAuth Connect de Stripe.
*   **Request:** Vacío (requiere Auth header).
*   **Response:** `z.object({ redirectUrl: z.string().url() })`

---

## 4. Transacciones y Finanzas

### GET `/api/orgs/:orgId/transactions`
Lista transacciones normalizadas.
```typescript
const GetTransactionsQuery = PaginationQuery.merge(DateRangeQuery).extend({
  state: z.string().length(2).optional(), // Filtrar por estado
  type: z.enum(['CHARGE', 'REFUND', 'PAYMENT', 'TRANSFER']).optional(),
  provider: z.enum(['STRIPE', 'QUICKBOOKS']).optional(),
});

// Response Schema
const TransactionResponse = z.object({
  data: z.array(z.object({
    id: z.string(),
    sourceProvider: z.string(),
    type: z.string(),
    amount: z.number(),
    currency: z.string(),
    occurredAt: z.string(),
    customerState: z.string().nullable(),
    category: z.string().nullable()
  })),
  meta: z.object({ total: z.number(), page: z.number() })
});
```

### GET `/api/orgs/:orgId/revenue/states`
El endpoint core del dashboard. Agrupa ingresos por estado para el gráfico de calor de riesgo "Nexus".
```typescript
const GetRevenueByStateQuery = z.object({
  year: z.number().int().min(2020),
  month: z.number().int().min(1).max(12).optional(), // Si no viene, es anual
});

// Response
const StateRevenueResponse = z.array(z.object({
  state: z.string(),
  grossRevenue: z.number(),
  netRevenue: z.number(),
  txCount: z.number(),
}));
```

---

## 5. Risk Rules & Nexus Flags (El Motor)

### POST `/api/orgs/:orgId/rulesets`
Permite al CPA o Dueño configurar el umbral de riesgo fiscal.
```typescript
const CreateRuleBody = z.object({
  type: z.enum(['NEXUS_REVENUE_THRESHOLD', 'NEXUS_TX_THRESHOLD', 'EXPENSE_CAT']),
  params: z.record(z.any()), // Dependiendo del type validamos paraméteros (e.g., state, threshold_amount)
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  isActive: z.boolean().default(true)
});

// Ejemplo real enviado desde UI para Regla de Nexus de CA:
// { "type": "NEXUS_REVENUE_THRESHOLD", "params": { "state": "CA", "amount": 500000 }, "severity": "HIGH" }
```

### GET `/api/orgs/:orgId/nexus/flags`
Lista las banderas rojas lanzadas por el Motor de Reglas.
```typescript
const GetFlagsQuery = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional()
});

const GetFlagsResponse = z.array(z.object({
  id: z.string(),
  state: z.string(),
  severity: z.string(),
  reason: z.string(),
  status: z.string(),
  firstSeenAt: z.string()
}));
```

### PATCH `/api/orgs/:orgId/nexus/flags/:flagId`
Acusa de recibo o resuelve una bandera (ej. El contador revisó CA).
```typescript
const UpdateFlagBody = z.object({
  status: z.enum(['ACKNOWLEDGED', 'RESOLVED'])
});
```

---

## 6. Reportes (CPA Ready Exports)

### POST `/api/orgs/:orgId/reports`
Dispara la creación de un export.
```typescript
const RequestReportBody = z.object({
  type: z.enum(['MONTHLY_SUMMARY', 'CPA_EXPORT_CSV', 'NEXUS_RISK_PDF']),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime()
});
// Respuesta: HTTP 202 Accepted { id: "report_123", status: "GENERATING" }
```

### GET `/api/orgs/:orgId/reports/:reportId/download`
Devuelve una Presigned URL (AWS S3 / R2) validada criptográficamente para que el usuario descargue el PDF/CSV directo del Bucket sin pasar los bytes por Node.
```typescript
const DownloadReportResponse = z.object({
  downloadUrl: z.string().url(),
  expiresIn: z.number() // Segundos
});
```
