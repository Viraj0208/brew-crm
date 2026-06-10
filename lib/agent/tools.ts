import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { campaigns, customers, segments } from "@/lib/db/schema";
import { compileRule, evaluateSegment, RuleError } from "@/lib/domain/segmentEval";
import { campaignFunnel } from "@/lib/domain/funnel";
import { campaignAttribution } from "@/lib/domain/attribution";
import type { ToolDef } from "@/lib/llm/provider";

// The 6 agent tools (§6). Each has a canonical ToolDef (provider-translated)
// and a server-side executor that returns REAL ids/counts — the LLM never
// invents customer ids. Recursive predicate trees are passed as JSON STRINGS to
// stay inside the Gemini OpenAPI schema subset (no recursive object schemas).

export const RULE_GRAMMAR = `rule_json grammar (a predicate tree):
- combinators: {"and":[rule,...]} | {"or":[rule,...]} | {"not":rule}
- numeric leaf: {"field":"recency_days"|"order_count"|"total_spend_cents","op":"gt"|"gte"|"lt"|"lte"|"eq"|"neq","value":<number>}
- bool leaf: {"field":"marketing_opt_in"|"is_subscriber","op":"eq","value":<true|false>}
- category leaf: {"field":"bought_category","op":"in","value":["espresso"|"filter"|"beans"|"equipment"|"subscription"|"merch"]}
total_spend_cents is in cents. recency_days = days since last order.`;

const CHANNELS = ["whatsapp", "sms", "email"] as const;
type Channel = (typeof CHANNELS)[number];

const MESSAGE_TOKENS = ["{{first_name}}", "{{name}}"]; // allowlist

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "query_customers",
    description:
      "Count and sample customers matching a rule_json predicate tree, with aggregates (avg spend, avg recency). Use to size an audience before creating a segment. " +
      RULE_GRAMMAR,
    parameters: {
      type: "OBJECT",
      properties: {
        filter: { type: "STRING", description: "rule_json as a JSON string" },
      },
      required: ["filter"],
    },
  },
  {
    name: "create_segment",
    description:
      "Materialize an audience from a rule_json predicate tree. Returns the real segment_id and member_count. " +
      RULE_GRAMMAR,
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "short human segment name" },
        rule_json: { type: "STRING", description: "rule_json as a JSON string" },
      },
      required: ["name", "rule_json"],
    },
  },
  {
    name: "draft_message",
    description:
      "Draft a short marketing message template for a segment + goal + channel. Returns a message_template that may use tokens {{first_name}} or {{name}} only.",
    parameters: {
      type: "OBJECT",
      properties: {
        segment_summary: { type: "STRING" },
        goal: { type: "STRING" },
        channel: { type: "STRING", enum: [...CHANNELS] },
      },
      required: ["segment_summary", "goal", "channel"],
    },
  },
  {
    name: "pick_channel",
    description:
      "Recommend whatsapp, sms, or email for a segment with a one-line rationale. whatsapp = highest engagement, sms = urgent/short, email = detailed/older audience.",
    parameters: {
      type: "OBJECT",
      properties: { segment_summary: { type: "STRING" } },
      required: ["segment_summary"],
    },
  },
  {
    name: "launch_campaign",
    description:
      "Create a campaign for a segment + channel + message_template. Returns campaign_id. Sending happens after marketer approval.",
    parameters: {
      type: "OBJECT",
      properties: {
        segment_id: { type: "STRING" },
        channel: { type: "STRING", enum: [...CHANNELS] },
        message_template: { type: "STRING" },
        schedule: { type: "STRING", description: "ISO timestamp or empty for now" },
      },
      required: ["segment_id", "channel", "message_template"],
    },
  },
  {
    name: "get_campaign_stats",
    description: "Get the delivery funnel and attributed orders for a campaign_id.",
    parameters: {
      type: "OBJECT",
      properties: { campaign_id: { type: "STRING" } },
      required: ["campaign_id"],
    },
  },
];

// ───────────────────────── executors ─────────────────────────

type Args = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));

function parseRule(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw; // already an object
  try {
    return JSON.parse(str(raw));
  } catch {
    throw new RuleError("rule_json is not valid JSON");
  }
}

function validateTokens(template: string): void {
  const used = template.match(/\{\{[^}]+\}\}/g) ?? [];
  for (const tok of used) {
    if (!MESSAGE_TOKENS.includes(tok.replace(/\s/g, ""))) {
      throw new Error(`message uses disallowed token ${tok}; allowed: ${MESSAGE_TOKENS.join(", ")}`);
    }
  }
}

async function queryCustomers(a: Args) {
  const rule = parseRule(a.filter);
  const { memberCount, sample } = await evaluateSegment(rule, 8);
  // Aggregates over the matched set (opted-in), independent of the sample cap.
  const where = sql`(${customers.marketingOptIn} = true) and (${compileRule(rule)})`;
  const [agg] = await db
    .select({
      avgSpend: sql<number>`coalesce(avg(${customers.totalSpendCents}),0)::int`,
      avgOrders: sql<number>`coalesce(avg(${customers.orderCount}),0)::int`,
    })
    .from(customers)
    .where(where);
  return {
    count: memberCount,
    sample: sample.map((s) => ({ name: s.name, spend_cents: s.totalSpendCents, orders: s.orderCount })),
    aggregates: { avg_spend_cents: agg?.avgSpend ?? 0, avg_order_count: agg?.avgOrders ?? 0 },
  };
}

async function createSegment(a: Args) {
  const rule = parseRule(a.rule_json);
  const { memberCount } = await evaluateSegment(rule);
  const [row] = await db
    .insert(segments)
    .values({
      name: str(a.name) || "Agent segment",
      kind: "ai",
      author: "agent",
      ruleJson: rule,
      memberCount,
    })
    .returning({ id: segments.id });
  return { segment_id: row.id, member_count: memberCount };
}

function draftMessage(a: Args) {
  const channel = str(a.channel) as Channel;
  const goal = str(a.goal);
  // Deterministic scaffold (no extra LLM call — rate-limit discipline). The
  // model can revise it in the plan; the marketer can edit before approve.
  const cta =
    channel === "sms" ? "Reply YES for 15% off." : channel === "email" ? "Browse your picks →" : "Tap for 15% off ☕";
  const template = `Hi {{first_name}}, ${goal.replace(/\.$/, "")}. ${cta}`;
  validateTokens(template);
  return { message_template: template };
}

function pickChannel(a: Args) {
  const s = str(a.segment_summary).toLowerCase();
  let channel: Channel = "whatsapp";
  let why = "WhatsApp has the highest open + click engagement for an active D2C base.";
  if (/urgent|flash|expir|today|cart/.test(s)) {
    channel = "sms";
    why = "SMS is best for short, urgent nudges with near-100% delivery.";
  } else if (/lapsed|dormant|win.?back|older|detail|subscrib/.test(s)) {
    channel = "email";
    why = "Email suits a re-engagement story with more detail for a lapsed/older audience.";
  }
  return { channel, why };
}

async function launchCampaign(a: Args) {
  const segmentId = str(a.segment_id);
  const [seg] = await db.select().from(segments).where(eq(segments.id, segmentId)).limit(1);
  if (!seg) throw new Error(`segment_id ${segmentId} does not exist`);
  const channel = str(a.channel) as Channel;
  if (!CHANNELS.includes(channel)) throw new Error(`invalid channel ${channel}`);
  const template = str(a.message_template);
  validateTokens(template);
  const [row] = await db
    .insert(campaigns)
    .values({
      name: `Agent: ${seg.name}`.slice(0, 80),
      segmentId,
      channel,
      messageTemplate: template,
      status: "draft",
      scheduledAt: a.schedule ? new Date(str(a.schedule)) : null,
    })
    .returning({ id: campaigns.id });
  return { campaign_id: row.id };
}

async function getCampaignStats(a: Args) {
  const id = str(a.campaign_id);
  const [funnel, attribution] = await Promise.all([campaignFunnel(id), campaignAttribution(id)]);
  return { funnel, attributed_orders: attribution.attributedOrders, revenue_cents: attribution.revenueCents };
}

export const TOOL_EXECUTORS: Record<string, (a: Args) => Promise<unknown> | unknown> = {
  query_customers: queryCustomers,
  create_segment: createSegment,
  draft_message: draftMessage,
  pick_channel: pickChannel,
  launch_campaign: launchCampaign,
  get_campaign_stats: getCampaignStats,
};

export { CHANNELS, validateTokens };
export type { Channel };
