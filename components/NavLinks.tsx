"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/segments", label: "Segments" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/worker", label: "Worker" },
  { href: "/agent", label: "Agent" },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 text-sm">
      {NAV.map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`relative rounded-md px-3 py-1.5 transition-colors ${
              active ? "text-stone-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            }`}
          >
            {n.label}
            {active && (
              <motion.span
                layoutId="nav-underline"
                className="absolute inset-x-2 -bottom-[9px] h-0.5 rounded-full bg-amber-600"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
