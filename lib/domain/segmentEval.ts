import { sql, type SQL, type Column } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customers } from "@/lib/db/schema";

/**
 * Declarative segment predicate tree (§5.1).
 *
 * Both rule-based and AI-authored segments store this same `rule_json`. The agent emits it
 * via the `create_segment` tool, so the agent and the UI share one representation.
 *
 * A rule is either a boolean combinator (and/or/not) or a leaf predicate.
 */
export type Rule =
  | { and: Rule[] }
  | { or: Rule[] }
  | { not: Rule }
  | Predicate;

export type NumericField = "recency_days" | "order_count" | "total_spend_cents";
export type BoolField = "marketing_opt_in" | "is_subscriber";
export type NumericOp = "gt" | "gte" | "lt" | "lte" | "eq" | "neq";

export type Predicate =
  | { field: NumericField; op: NumericOp; value: number }
  | { field: BoolField; op: "eq"; value: boolean }
  | { field: "bought_category"; op: "in"; value: string[] };

const NUMERIC_OP_SQL: Record<NumericOp, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  eq: "=",
  neq: "<>",
};

const CATEGORIES = [
  "espresso",
  "filter",
  "beans",
  "equipment",
  "subscription",
  "merch",
] as const;

class RuleError extends Error {}

function isCombinator(r: Rule): r is { and: Rule[] } | { or: Rule[] } | { not: Rule } {
  return "and" in r || "or" in r || "not" in r;
}

/** Compile a rule (sub)tree into a SQL boolean expression over the `customers` row. */
export function compileRule(rule: unknown): SQL {
  return compile(rule as Rule);
}

function compile(rule: Rule): SQL {
  if (rule == null || typeof rule !== "object") {
    throw new RuleError("rule node must be an object");
  }

  if (isCombinator(rule)) {
    if ("and" in rule) {
      if (!Array.isArray(rule.and)) throw new RuleError("`and` must be an array");
      if (rule.and.length === 0) return sql`true`;
      return sql`(${sql.join(rule.and.map(compile), sql` and `)})`;
    }
    if ("or" in rule) {
      if (!Array.isArray(rule.or)) throw new RuleError("`or` must be an array");
      if (rule.or.length === 0) return sql`false`;
      return sql`(${sql.join(rule.or.map(compile), sql` or `)})`;
    }
    return sql`(not ${compile(rule.not)})`;
  }

  return compilePredicate(rule as Predicate);
}

function compilePredicate(p: Predicate): SQL {
  switch (p.field) {
    case "recency_days": {
      const op = NUMERIC_OP_SQL[p.op];
      if (!op) throw new RuleError(`bad op for recency_days: ${p.op}`);
      assertNumber(p.value, "recency_days");
      // Days since last order. NULL last_order_at (never ordered) never matches a recency rule.
      return sql`(${customers.lastOrderAt} is not null and extract(epoch from (now() - ${customers.lastOrderAt})) / 86400.0 ${sql.raw(op)} ${p.value})`;
    }
    case "order_count":
      return numericLeaf(customers.orderCount, p.op, p.value, "order_count");
    case "total_spend_cents":
      return numericLeaf(customers.totalSpendCents, p.op, p.value, "total_spend_cents");
    case "marketing_opt_in":
      assertBool(p.value, "marketing_opt_in");
      return sql`(${customers.marketingOptIn} = ${p.value})`;
    case "is_subscriber":
      assertBool(p.value, "is_subscriber");
      return sql`(${customers.isSubscriber} = ${p.value})`;
    case "bought_category": {
      if (!Array.isArray(p.value) || p.value.length === 0) {
        throw new RuleError("bought_category requires a non-empty array");
      }
      for (const c of p.value) {
        if (!CATEGORIES.includes(c as (typeof CATEGORIES)[number])) {
          throw new RuleError(`unknown category: ${c}`);
        }
      }
      const list = sql.join(
        p.value.map((c) => sql`${c}`),
        sql`, `,
      );
      // Refunded orders don't count as "bought".
      return sql`exists (
        select 1 from orders o
        join order_items oi on oi.order_id = o.id
        where o.customer_id = ${customers.id}
          and o.status <> 'refunded'
          and oi.category in (${list})
      )`;
    }
    default:
      throw new RuleError(`unknown predicate field: ${(p as { field: string }).field}`);
  }
}

function numericLeaf(col: Column, op: NumericOp, value: number, label: string): SQL {
  const sqlOp = NUMERIC_OP_SQL[op];
  if (!sqlOp) throw new RuleError(`bad op for ${label}: ${op}`);
  assertNumber(value, label);
  return sql`(${col} ${sql.raw(sqlOp)} ${value})`;
}

function assertNumber(v: unknown, label: string): asserts v is number {
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new RuleError(`${label} value must be a number`);
  }
}

function assertBool(v: unknown, label: string): asserts v is boolean {
  if (typeof v !== "boolean") throw new RuleError(`${label} value must be a boolean`);
}

export type SegmentSample = {
  id: string;
  name: string;
  email: string;
  city: string | null;
  orderCount: number;
  totalSpendCents: number;
  lastOrderAt: Date | null;
};

export type SegmentEvalResult = {
  memberCount: number;
  sample: SegmentSample[];
};

/**
 * Evaluate a segment against live customer/order data.
 *
 * Opt-out guardrail (§6, Tier S): `marketing_opt_in = false` customers are ALWAYS excluded at
 * evaluate time, regardless of the rule. This is the cheapest, safest place to enforce it.
 */
export async function evaluateSegment(
  ruleJson: unknown,
  sampleSize = 10,
): Promise<SegmentEvalResult> {
  const where = sql`(${customers.marketingOptIn} = true) and (${compile(ruleJson as Rule)})`;

  const countRows = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(customers)
    .where(where);
  const memberCount = countRows[0]?.n ?? 0;

  const sample = (await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      city: customers.city,
      orderCount: customers.orderCount,
      totalSpendCents: customers.totalSpendCents,
      lastOrderAt: customers.lastOrderAt,
    })
    .from(customers)
    .where(where)
    .orderBy(sql`${customers.totalSpendCents} desc`)
    .limit(sampleSize)) as SegmentSample[];

  return { memberCount, sample };
}

export type SegmentMember = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  preferredChannel: "whatsapp" | "sms" | "email" | null;
};

/**
 * Full member list for materializing a send (no sample cap). Same opt-out
 * guardrail as evaluateSegment — opted-out customers are never returned.
 */
export async function segmentMembers(ruleJson: unknown): Promise<SegmentMember[]> {
  const where = sql`(${customers.marketingOptIn} = true) and (${compile(ruleJson as Rule)})`;
  return (await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      phone: customers.phone,
      preferredChannel: customers.preferredChannel,
    })
    .from(customers)
    .where(where)) as SegmentMember[];
}

export { RuleError };
