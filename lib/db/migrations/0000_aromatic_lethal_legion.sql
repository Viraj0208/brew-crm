CREATE TYPE "public"."agent_run_status" AS ENUM('planning', 'awaiting_approval', 'executing', 'monitoring', 'proposed_next', 'done');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'approved', 'launching', 'live', 'done');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('espresso', 'filter', 'beans', 'equipment', 'subscription', 'merch');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('whatsapp', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."comm_event_type" AS ENUM('delivered', 'failed', 'opened', 'read', 'clicked');--> statement-breakpoint
CREATE TYPE "public"."comm_state" AS ENUM('queued', 'sent', 'delivered', 'failed', 'opened', 'read', 'clicked');--> statement-breakpoint
CREATE TYPE "public"."dead_letter_source" AS ENUM('outbox', 'receipt');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('placed', 'fulfilled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'inflight', 'sent', 'dead');--> statement-breakpoint
CREATE TYPE "public"."segment_author" AS ENUM('seed', 'user', 'agent');--> statement-breakpoint
CREATE TYPE "public"."segment_kind" AS ENUM('rule', 'ai');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'planning' NOT NULL,
	"plan_json" jsonb,
	"reasoning_trace" jsonb,
	"proposed_next_json" jsonb,
	"campaign_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"segment_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"message_template" text NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"agent_run_id" uuid,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comm_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"communication_id" uuid NOT NULL,
	"type" "comm_event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied" boolean NOT NULL,
	CONSTRAINT "comm_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"rendered_message" text NOT NULL,
	"state" "comm_state" DEFAULT 'queued' NOT NULL,
	"state_rank" smallint DEFAULT 0 NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"city" text,
	"signup_at" timestamp with time zone DEFAULT now() NOT NULL,
	"marketing_opt_in" boolean DEFAULT true NOT NULL,
	"preferred_channel" "channel",
	"last_order_at" timestamp with time zone,
	"order_count" integer DEFAULT 0 NOT NULL,
	"total_spend_cents" integer DEFAULT 0 NOT NULL,
	"avg_days_between_orders" integer,
	"is_subscriber" boolean DEFAULT false NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "dead_letter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "dead_letter_source" NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"communication_id" uuid,
	"event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"category" "category" NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"total_cents" integer NOT NULL,
	"status" "order_status" DEFAULT 'placed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"communication_id" uuid NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "segment_kind" NOT NULL,
	"rule_json" jsonb NOT NULL,
	"author" "segment_author" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_events" ADD CONSTRAINT "comm_events_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comm_events_comm_occurred_idx" ON "comm_events" USING btree ("communication_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "comm_campaign_customer_uq" ON "communications" USING btree ("campaign_id","customer_id");--> statement-breakpoint
CREATE INDEX "comm_campaign_state_idx" ON "communications" USING btree ("campaign_id","state");--> statement-breakpoint
CREATE INDEX "order_items_category_idx" ON "order_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "orders_customer_ordered_idx" ON "orders" USING btree ("customer_id","ordered_at");--> statement-breakpoint
CREATE INDEX "outbox_status_next_idx" ON "outbox" USING btree ("status","next_attempt_at");