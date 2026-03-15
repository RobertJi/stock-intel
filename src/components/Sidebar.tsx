import Link from "next/link";
import { Bell, LayoutDashboard, LineChart, Star } from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Watchlist", href: "/", icon: Star },
  { label: "Events", href: "/", icon: Bell },
];

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 p-4 lg:block">
      <div className="flex h-full flex-col rounded-3xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-sm">
        <div className="flex items-center gap-3 border-b border-white/[0.08] pb-5">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">
            <LineChart className="size-5" />
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-400/80">
              Signal Desk
            </p>
            <h1 className="mt-1 text-lg font-semibold tracking-[0.18em] text-[#e8eaf0]">
              STOCK INTEL
            </h1>
          </div>
        </div>

        <nav className="mt-6 space-y-2">
          {navItems.map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 text-sm text-[#e8eaf0] transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-cyan-300"
            >
              <Icon className="size-4 text-cyan-400" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/[0.08] bg-black/20 p-4">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-slate-500">
            Theme
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Dark glass surfaces, cyan signal highlights, and event-first market context.
          </p>
        </div>
      </div>
    </aside>
  );
}
