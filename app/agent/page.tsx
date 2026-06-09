export const dynamic = "force-dynamic";

// Placeholder — the agent console (goal box, plan + reasoning-trace review, campaign funnel,
// propose-next) is the product star, built Day 4.
export default function AgentPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Agent</h1>
      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
        <p className="text-lg">☕ The agent console lands here.</p>
        <p className="mt-2 text-sm">
          Goal box → plan + reasoning trace → approve → live funnel → propose next campaign.
        </p>
      </div>
    </div>
  );
}
