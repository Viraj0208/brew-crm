import Link from "next/link";
import BrewMark from "@/components/BrewMark";
import NavLinks from "@/components/NavLinks";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-amber-800">
            <BrewMark className="h-5 w-5" />
            <span className="text-stone-900">Brew</span>
          </Link>
          <NavLinks />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
