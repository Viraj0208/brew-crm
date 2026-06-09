import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  smallint,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ───────────────────────── enums ─────────────────────────
export const channelEnum = pgEnum("channel", ["whatsapp", "sms", "email"]);
export const orderStatusEnum = pgEnum("order_status", [
  "placed",
  "fulfilled",
  "refunded",
]);
export const categoryEnum = pgEnum("category", [
  "espresso",
  "filter",
  "beans",
  "equipment",
  "subscription",
  "merch",
]);
export const segmentKindEnum = pgEnum("segment_kind", ["rule", "ai"]);
export const segmentAuthorEnum = pgEnum("segment_author", [
  "seed",
  "user",
  "agent",
]);
export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "approved",
  "launching",
  "live",
  "done",
]);
export const commStateEnum = pgEnum("comm_state", [
  "queued",
  "sent",
  "delivered",
  "failed",
  "opened",
  "read",
  "clicked",
]);
export const commEventTypeEnum = pgEnum("comm_event_type", [
  "delivered",
  "failed",
  "opened",
  "read",
  "clicked",
]);
export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "inflight",
  "sent",
  "dead",
]);
export const deadLetterSourceEnum = pgEnum("dead_letter_source", [
  "outbox",
  "receipt",
]);
export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "planning",
  "awaiting_approval",
  "executing",
  "monitoring",
  "proposed_next",
  "done",
]);

// ───────────────────────── customers ─────────────────────────
export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  city: text("city"),
  signupAt: timestamp("signup_at", { withTimezone: true }).notNull().defaultNow(),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(true),
  preferredChannel: channelEnum("preferred_channel"),
  // cached RFM (recomputed by seed + recompute fn)
  lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
  orderCount: integer("order_count").notNull().default(0),
  totalSpendCents: integer("total_spend_cents").notNull().default(0),
  avgDaysBetweenOrders: integer("avg_days_between_orders"),
  isSubscriber: boolean("is_subscriber").notNull().default(false),
});

// ───────────────────────── orders ─────────────────────────
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull(),
    totalCents: integer("total_cents").notNull(),
    status: orderStatusEnum("status").notNull().default("placed"),
  },
  (t) => [index("orders_customer_ordered_idx").on(t.customerId, t.orderedAt)],
);

// ───────────────────────── order_items ─────────────────────────
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    productName: text("product_name").notNull(),
    category: categoryEnum("category").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (t) => [index("order_items_category_idx").on(t.category)],
);

// ───────────────────────── segments ─────────────────────────
export const segments = pgTable("segments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  kind: segmentKindEnum("kind").notNull(),
  ruleJson: jsonb("rule_json").notNull(),
  author: segmentAuthorEnum("author").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  memberCount: integer("member_count").notNull().default(0),
});

// ───────────────────────── agent_runs ─────────────────────────
// declared before campaigns for the FK reference
export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  goal: text("goal").notNull(),
  status: agentRunStatusEnum("status").notNull().default("planning"),
  planJson: jsonb("plan_json"),
  reasoningTrace: jsonb("reasoning_trace"),
  proposedNextJson: jsonb("proposed_next_json"),
  campaignId: uuid("campaign_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────── campaigns ─────────────────────────
export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  segmentId: uuid("segment_id")
    .notNull()
    .references(() => segments.id),
  channel: channelEnum("channel").notNull(),
  messageTemplate: text("message_template").notNull(),
  status: campaignStatusEnum("status").notNull().default("draft"),
  agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────── communications (state machine) ─────────────────────────
export const communications = pgTable(
  "communications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    recipient: text("recipient").notNull(),
    renderedMessage: text("rendered_message").notNull(),
    state: commStateEnum("state").notNull().default("queued"),
    stateRank: smallint("state_rank").notNull().default(0),
    attempts: smallint("attempts").notNull().default(0),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("comm_campaign_customer_uq").on(t.campaignId, t.customerId),
    index("comm_campaign_state_idx").on(t.campaignId, t.state),
  ],
);

// ───────────────────────── comm_events (append-only audit + dedupe) ─────────────────────────
export const commEvents = pgTable(
  "comm_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: text("event_id").notNull().unique(),
    communicationId: uuid("communication_id")
      .notNull()
      .references(() => communications.id),
    type: commEventTypeEnum("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    applied: boolean("applied").notNull(),
  },
  (t) => [index("comm_events_comm_occurred_idx").on(t.communicationId, t.occurredAt)],
);

// ───────────────────────── outbox (CRM → channel send queue + retry) ─────────────────────────
export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    communicationId: uuid("communication_id")
      .notNull()
      .references(() => communications.id),
    status: outboxStatusEnum("status").notNull().default("pending"),
    attempts: smallint("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
  },
  (t) => [index("outbox_status_next_idx").on(t.status, t.nextAttemptAt)],
);

// ───────────────────────── dead_letter ─────────────────────────
export const deadLetter = pgTable("dead_letter", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: deadLetterSourceEnum("source").notNull(),
  payload: jsonb("payload").notNull(),
  reason: text("reason").notNull(),
  communicationId: uuid("communication_id"),
  eventId: text("event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
