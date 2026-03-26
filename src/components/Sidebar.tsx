import Image from "next/image";
import Link from "next/link";

const nav = [
  { label: "Dashboard", href: "/" },
  { label: "Watchlist", href: "/" },
  { label: "Events", href: "/" },
];

export function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-52 shrink-0 flex-col bg-[#1A1A2E] px-6 pb-8 pt-10 lg:flex xl:pt-12">
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-2.5">
          <Image src="/egret-dark.svg" alt="egret" width={28} height={28} />
        </div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[#5C6B8A]">
          Personal
        </p>
        <h1 className="font-display text-xl leading-tight text-[#E8E3D8]">
          Stock
          <br />
          Intel
        </h1>
      </div>

      <nav className="flex-1 space-y-1">
        {nav.map(({ label, href }) => (
          <Link
            key={label}
            href={href}
            className="block rounded px-3 py-2 font-sans text-sm text-[#8A93A8] transition-colors hover:bg-white/[0.05] hover:text-[#E8E3D8]"
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto">
        <p className="font-mono text-[11px] uppercase tracking-widest text-[#6F7890]">
          Data: EDGAR · YF
        </p>
      </div>
    </aside>
  );
}
