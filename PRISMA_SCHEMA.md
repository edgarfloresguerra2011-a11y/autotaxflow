# AutoTaxFlow - Esquema de Base de Datos (Prisma)

El siguiente es el esquema completo de base de datos para tu MVP utilizando **Prisma ORM** sobre PostgreSQL. Está diseñado completamente bajo el patrón **Multi-Tenant**, asegurando que toda la información transaccional pertenece a una `Organization`.

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------------------------------------------------------
// 1. TENANCY & USERS
// ---------------------------------------------------------

model Organization {
  id            String   @id @default(uuid())
  name          String
  country       String
  baseCurrency  String   @default("USD")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  memberships       Membership[]
  auditLogs         AuditLog[]
  connectedAccounts ConnectedAccount[]
  
  // Relaciones Financieras
  transactions      Transaction[]
  payouts           Payout[]
  expenses          Expense[]
  accounts          Account[]
  
  // Analítica & Reglas
  monthlyRevenue    StateRevenueMonthly[]
  dailyRevenue      StateRevenueDaily[]
  nexusFlags        NexusFlag[]
  anomalies         Anomaly[]
  rulesets          Ruleset[]
  reports           Report[]
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships Membership[]
  auditLogs   AuditLog[]
}

enum Role {
  OWNER
  ADMIN
  FINANCE
  VIEWER
  CPA_READONLY
}

model Membership {
  id             String       @id @default(uuid())
  organizationId String
  userId         String
  role           Role         @default(VIEWER)
  createdAt      DateTime     @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
}

model AuditLog {
  id             String       @id @default(uuid())
  organizationId String
  userId         String?
  action         String
  entity         String
  entityId       String?
  details        Json?
  createdAt      DateTime     @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
}

// ---------------------------------------------------------
// 2. INTEGRATIONS (STRIPE / QBO)
// ---------------------------------------------------------

enum ProviderName {
  STRIPE
  QUICKBOOKS
}

enum ConnectionStatus {
  CONNECTED
  ERROR
  DISCONNECTED
}

model ConnectedAccount {
  id                String           @id @default(uuid())
  organizationId    String
  provider          ProviderName
  status            ConnectionStatus @default(CONNECTED)
  externalAccountId String           // ej: acct_1234 (Stripe) o realmId (QBO)
  lastSyncAt        DateTime?
  createdAt         DateTime         @default(now())

  organization      Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  oauthTokens       OAuthToken?

  @@unique([organizationId, provider, externalAccountId])
}

model OAuthToken {
  id                   String           @id @default(uuid())
  connectedAccountId   String           @unique
  accessTokenEncrypted String
  refreshTokenEncrypted String?
  expiresAt            DateTime?
  scope                String?
  updatedAt            DateTime         @updatedAt

  connectedAccount     ConnectedAccount @relation(fields: [connectedAccountId], references: [id], onDelete: Cascade)
}

model WebhookEvent {
  id           String       @id @default(uuid())
  provider     ProviderName
  eventId      String       // ID unico del webhook (ej: evt_1234)
  payload      Json
  status       String       @default("PENDING") // PENDING, PROCESSED, ERROR
  error        String?
  receivedAt   DateTime     @default(now())
  processedAt  DateTime?

  @@unique([provider, eventId])
}

// ---------------------------------------------------------
// 3. FINANZAS NORMALIZADAS
// ---------------------------------------------------------

enum TransactionType {
  CHARGE
  REFUND
  PAYMENT
  TRANSFER
  DISPUTE
}

model Transaction {
  id              String          @id @default(uuid())
  organizationId  String
  sourceProvider  ProviderName
  sourceId        String          // ej: ch_1234
  type            TransactionType
  amount          Float
  currency        String
  occurredAt      DateTime
  
  customerState   String?         // ej: "CA", "NY"
  customerCountry String?
  
  category        String?         // Automagic categorization
  mappedAccountId String?         // Link a QBO Account si aplica
  
  rawJson         Json            // Payload original para debug/trazabilidad
  
  createdAt       DateTime        @default(now())

  organization    Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  account         Account?        @relation(fields: [mappedAccountId], references: [id], onDelete: SetNull)

  @@index([organizationId, occurredAt])
  @@index([organizationId, customerState])
}

model Payout {
  id              String       @id @default(uuid())
  organizationId  String
  sourceProvider  ProviderName
  sourceId        String       // ej: po_1234
  amount          Float
  currency        String
  arrivalDate     DateTime
  status          String
  rawJson         Json
  createdAt       DateTime     @default(now())

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

model Expense {
  id              String       @id @default(uuid())
  organizationId  String
  sourceProvider  ProviderName
  sourceId        String
  vendorName      String?
  amount          Float
  currency        String
  occurredAt      DateTime
  category        String?
  mappedAccountId String?
  rawJson         Json
  createdAt       DateTime     @default(now())

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  account         Account?     @relation(fields: [mappedAccountId], references: [id], onDelete: SetNull)
}

model Account {
  id              String       @id @default(uuid())
  organizationId  String
  sourceProvider  ProviderName
  sourceId        String       // ej: QBO account id
  name            String
  type            String
  classification  String?      // Asset, Liability, Equity, Revenue, Expense
  createdAt       DateTime     @default(now())

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  transactions    Transaction[]
  expenses        Expense[]

  @@unique([organizationId, sourceProvider, sourceId])
}

// ---------------------------------------------------------
// 4. AGREGACIONES & ANALÍTICA
// ---------------------------------------------------------

model StateRevenueMonthly {
  id              String       @id @default(uuid())
  organizationId  String
  year            Int
  month           Int
  state           String       // 2-letra (ej: TX)
  grossRevenue    Float        @default(0)
  netRevenue      Float        @default(0)
  txCount         Int          @default(0)
  updatedAt       DateTime     @updatedAt

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, year, month, state])
}

model StateRevenueDaily {
  id              String       @id @default(uuid())
  organizationId  String
  date            DateTime     @db.Date
  state           String
  grossRevenue    Float        @default(0)
  netRevenue      Float        @default(0)
  txCount         Int          @default(0)
  updatedAt       DateTime     @updatedAt

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, date, state])
}

// ---------------------------------------------------------
// 5. REGLAS & EXCEPCIONES
// ---------------------------------------------------------

enum Severity {
  LOW
  MEDIUM
  HIGH
}

enum FlagStatus {
  OPEN
  ACKNOWLEDGED
  RESOLVED
}

model NexusFlag {
  id              String       @id @default(uuid())
  organizationId  String
  state           String
  ruleId          String?
  severity        Severity     @default(MEDIUM)
  reason          String
  firstSeenAt     DateTime     @default(now())
  lastSeenAt      DateTime     @default(now())
  status          FlagStatus   @default(OPEN)

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  rule            Rule?        @relation(fields: [ruleId], references: [id], onDelete: SetNull)
}

model Anomaly {
  id              String       @id @default(uuid())
  organizationId  String
  type            String       // REVENUE_SPIKE, NEGATIVE_NET
  severity        Severity
  detectedAt      DateTime     @default(now())
  details         Json
  status          FlagStatus   @default(OPEN)

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

model Ruleset {
  id              String       @id @default(uuid())
  organizationId  String
  name            String
  isActive        Boolean      @default(true)
  createdAt       DateTime     @default(now())

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  rules           Rule[]
}

model Rule {
  id              String       @id @default(uuid())
  rulesetId       String
  type            String       // NEXUS_REVENUE_THRESHOLD, EXPENSE_CAT
  params          Json         // ej: { "state": "CA", "threshold": 500000 }
  severity        Severity     @default(MEDIUM)
  isActive        Boolean      @default(true)

  ruleset         Ruleset      @relation(fields: [rulesetId], references: [id], onDelete: Cascade)
  nexusFlags      NexusFlag[]
}

// ---------------------------------------------------------
// 6. REPORTES
// ---------------------------------------------------------

model Report {
  id              String       @id @default(uuid())
  organizationId  String
  type            String       // MONTHLY_SUMMARY, CPA_EXPORT
  periodStart     DateTime
  periodEnd       DateTime
  status          String       // PENDING, GENERATING, READY, ERROR
  fileUrl         String?      // S3 path
  createdAt       DateTime     @default(now())

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}
```

### Reglas clave aplicadas:
1.  **Aislamiento de Tenant (Multi-Tenant):** Nota que **TODA** entidad de negocio (`Transaction`, `NexusFlag`, `Account`, `Report`) tiene un `organizationId` y está rigurosamente unida con un `@relation(..., onDelete: Cascade)`. Esto asegura que si una Org se elimina, sus datos financieros mueren con ella, evitando fugas de datos huérfanos.
2.  **Rastreo Crudo (`rawJson`):** Campos críticos guardan el payload JSON original (Stripe/QBO) para auditoría o *backfilling* en caso de un bug en nuestra normalización.
3.  **Idempotencia:** `WebhookEvent` utiliza un `@@unique([provider, eventId])` a nivel de base de datos para impedir procesar el mismo webhook dos veces, crítico para no duplicar ingresos.
