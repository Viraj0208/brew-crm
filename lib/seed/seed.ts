/**
 * Storytelling seed data for Brew (§2, §10 — creativity-in-scoping axis).
 *
 * The data is built to make three opinionated segments light up so the demo feels like a real
 * coffee product, not a random table:
 *   1. "Lapsed espresso regulars"            — ordered weekly, gone 60+ days
 *   2. "New-arrival browsers who never bought" — signed up recently, zero orders
 *   3. "High-LTV subscribers at churn risk"    — subscribers slipping past their cadence
 *
 * Plus healthy actives (noise/realism, so segments are selective) and a few opted-out
 * customers (match the rules but must be EXCLUDED by the opt-out guardrail at evaluate time).
 *
 * Deterministic: a seeded PRNG makes re-seeding produce the same story.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  customers,
  orders,
  orderItems,
  segments,
  type channelEnum,
  type categoryEnum,
} from "@/lib/db/schema";

type Channel = (typeof channelEnum.enumValues)[number];
type Category = (typeof categoryEnum.enumValues)[number];

// ── seeded PRNG (mulberry32) ──
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * DAY);

const UNIT_PRICE: Record<Category, number> = {
  espresso: 1800,
  filter: 1600,
  beans: 2000,
  equipment: 8500,
  subscription: 2400,
  merch: 1500,
};

const CITIES = ["Mumbai", "Bengaluru", "Delhi", "Pune", "Hyderabad", "Chennai"];

const FIRST = [
  "Aarav", "Diya", "Kabir", "Ananya", "Vivaan", "Isha", "Reyansh", "Myra", "Arjun", "Saanvi",
  "Advait", "Aadhya", "Vihaan", "Kiara", "Rohan", "Anika", "Dhruv", "Tara", "Karan", "Nisha",
  "Aditya", "Meera", "Yash", "Priya", "Neel", "Riya", "Om", "Sara", "Veer", "Zara",
  "Rahul", "Pooja", "Sahil", "Aisha", "Dev", "Naina", "Krish", "Leela", "Manav", "Trisha",
  "Ayaan", "Kavya", "Ved", "Ira", "Nikhil",
];

type NewCustomer = {
  name: string;
  email: string;
  phone: string;
  city: string;
  signupAt: Date;
  marketingOptIn: boolean;
  preferredChannel: Channel;
  isSubscriber: boolean;
};

type SeedOrder = {
  orderedAt: Date;
  status: "placed" | "fulfilled" | "refunded";
  items: { category: Category; productName: string; qty: number }[];
};

const PRODUCT_NAME: Record<Category, string[]> = {
  espresso: ["Midnight Espresso 250g", "Ristretto Blend 250g", "Crema Dark Roast 250g"],
  filter: ["Morning Filter 250g", "Bright Pourover 250g"],
  beans: ["Single-Origin Ethiopia 500g", "Colombia Supremo 500g", "House Blend 1kg"],
  equipment: ["Hand Grinder", "AeroPress", "Gooseneck Kettle"],
  subscription: ["Monthly Bean Club", "Espresso Subscription"],
  merch: ["Brew Ceramic Mug", "Brew Tote", "Brew Cap"],
};

const usedEmails = new Set<string>();
function makeCustomer(opts: {
  isSubscriber?: boolean;
  optIn?: boolean;
  signupDaysAgo: number;
  channel?: Channel;
}): NewCustomer {
  const first = pick(FIRST);
  let email = `${first.toLowerCase()}.${between(10, 99)}@example.com`;
  while (usedEmails.has(email)) email = `${first.toLowerCase()}.${between(100, 999)}@example.com`;
  usedEmails.add(email);
  return {
    name: `${first} ${pick(["Sharma", "Patel", "Iyer", "Khan", "Reddy", "Nair", "Gupta", "Das"])}`,
    email,
    phone: `+9198${between(10000000, 99999999)}`,
    city: pick(CITIES),
    signupAt: daysAgo(opts.signupDaysAgo),
    marketingOptIn: opts.optIn ?? true,
    preferredChannel: opts.channel ?? pick(["whatsapp", "sms", "email"] as Channel[]),
    isSubscriber: opts.isSubscriber ?? false,
  };
}

function makeOrder(orderedAt: Date, cats: Category[]): SeedOrder {
  return {
    orderedAt,
    status: rnd() < 0.08 ? "refunded" : "fulfilled",
    items: cats.map((category) => ({
      category,
      productName: pick(PRODUCT_NAME[category]),
      qty: between(1, 2),
    })),
  };
}

/** Build the full population with stories. Returns customer rows + their orders. */
function buildPopulation(): { customer: NewCustomer; orders: SeedOrder[] }[] {
  const pop: { customer: NewCustomer; orders: SeedOrder[] }[] = [];

  // 1. Lapsed espresso regulars (8) — weekly espresso buyers, last order 65–120 days ago.
  for (let i = 0; i < 8; i++) {
    const c = makeCustomer({ signupDaysAgo: between(220, 400), channel: "whatsapp" });
    const lastGap = between(65, 120);
    const count = between(10, 22);
    const os: SeedOrder[] = [];
    for (let k = 0; k < count; k++) {
      // historical weekly cadence ending `lastGap` days ago
      os.push(makeOrder(daysAgo(lastGap + k * 7), ["espresso"]));
    }
    pop.push({ customer: c, orders: os });
  }

  // 2. New-arrival browsers who never bought (10) — signed up 1–14 days ago, zero orders.
  for (let i = 0; i < 10; i++) {
    pop.push({ customer: makeCustomer({ signupDaysAgo: between(1, 14) }), orders: [] });
  }

  // 3. High-LTV subscribers at churn risk (6) — subscribers slipping to 25–40 day recency.
  for (let i = 0; i < 6; i++) {
    const c = makeCustomer({ isSubscriber: true, signupDaysAgo: between(180, 365), channel: "email" });
    const lastGap = between(25, 40);
    const os: SeedOrder[] = [];
    const count = between(8, 14);
    for (let k = 0; k < count; k++) {
      const cats: Category[] = k % 3 === 0 ? ["subscription", "beans"] : ["beans"];
      os.push(makeOrder(daysAgo(lastGap + k * 14), cats));
    }
    pop.push({ customer: c, orders: os });
  }

  // 4. Healthy actives (15) — recent orders (< 14 days), varied categories.
  for (let i = 0; i < 15; i++) {
    const c = makeCustomer({ signupDaysAgo: between(30, 300) });
    const count = between(2, 8);
    const os: SeedOrder[] = [];
    for (let k = 0; k < count; k++) {
      os.push(makeOrder(daysAgo(between(1, 13) + k * 12), [pick(["espresso", "filter", "beans", "merch", "equipment"] as Category[])]));
    }
    pop.push({ customer: c, orders: os });
  }

  // 5. Opted-out lapsed espresso regulars (3) — match the lapsed rule but MUST be excluded.
  for (let i = 0; i < 3; i++) {
    const c = makeCustomer({ optIn: false, signupDaysAgo: between(220, 400), channel: "sms" });
    const os: SeedOrder[] = [];
    const count = between(10, 18);
    const lastGap = between(70, 110);
    for (let k = 0; k < count; k++) os.push(makeOrder(daysAgo(lastGap + k * 7), ["espresso"]));
    pop.push({ customer: c, orders: os });
  }

  return pop;
}

const SEED_SEGMENTS = [
  {
    name: "Lapsed espresso regulars",
    description: "Used to order espresso weekly, now gone 60+ days. Win them back.",
    kind: "rule" as const,
    author: "seed" as const,
    ruleJson: {
      and: [
        { field: "recency_days", op: "gte", value: 60 },
        { field: "order_count", op: "gte", value: 8 },
        { field: "bought_category", op: "in", value: ["espresso"] },
      ],
    },
  },
  {
    name: "New-arrival browsers who never bought",
    description: "Signed up recently, never placed an order. First-purchase nudge.",
    kind: "rule" as const,
    author: "seed" as const,
    ruleJson: { and: [{ field: "order_count", op: "eq", value: 0 }] },
  },
  {
    name: "High-LTV subscribers at churn risk",
    description: "Subscribers with high spend slipping past their usual cadence.",
    kind: "rule" as const,
    author: "seed" as const,
    ruleJson: {
      and: [
        { field: "is_subscriber", op: "eq", value: true },
        { field: "total_spend_cents", op: "gte", value: 15000 },
        { field: "recency_days", op: "gte", value: 21 },
      ],
    },
  },
];

async function main() {
  console.log("⏳ clearing existing data...");
  // order matters (FKs)
  await db.execute(sql`truncate table comm_events, communications, outbox, dead_letter, campaigns, agent_runs, order_items, orders, segments, customers restart identity cascade`);

  console.log("🌱 building population...");
  const pop = buildPopulation();

  console.log(`👥 inserting ${pop.length} customers...`);
  for (const { customer, orders: os } of pop) {
    const [c] = await db.insert(customers).values(customer).returning({ id: customers.id });
    for (const o of os) {
      const total = o.items.reduce((s, it) => s + UNIT_PRICE[it.category] * it.qty, 0);
      const [ord] = await db
        .insert(orders)
        .values({ customerId: c.id, orderedAt: o.orderedAt, totalCents: total, status: o.status })
        .returning({ id: orders.id });
      await db.insert(orderItems).values(
        o.items.map((it) => ({
          orderId: ord.id,
          productName: it.productName,
          category: it.category,
          qty: it.qty,
          unitPriceCents: UNIT_PRICE[it.category],
        })),
      );
    }
  }

  console.log("📊 recomputing cached RFM...");
  await db.execute(sql`
    update customers c set
      order_count = sub.cnt,
      total_spend_cents = sub.spend,
      last_order_at = sub.last_at,
      avg_days_between_orders = sub.avg_gap,
      is_subscriber = sub.is_sub
    from (
      select o.customer_id,
        count(*)::int as cnt,
        coalesce(sum(o.total_cents) filter (where o.status <> 'refunded'), 0)::int as spend,
        max(o.ordered_at) as last_at,
        case when count(*) > 1
          then (extract(epoch from (max(o.ordered_at) - min(o.ordered_at))) / 86400.0 / (count(*) - 1))::int
          else null end as avg_gap,
        bool_or(exists (select 1 from order_items oi where oi.order_id = o.id and oi.category = 'subscription')) as is_sub
      from orders o group by o.customer_id
    ) sub
    where sub.customer_id = c.id
  `);

  console.log("🏷️  inserting seed segments + materializing member_count...");
  const { evaluateSegment } = await import("@/lib/domain/segmentEval");
  for (const s of SEED_SEGMENTS) {
    const { memberCount } = await evaluateSegment(s.ruleJson);
    await db.insert(segments).values({ ...s, memberCount });
    console.log(`   • ${s.name}: ${memberCount} members`);
  }

  console.log("✅ seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});
