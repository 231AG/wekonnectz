import { Logo } from "@/components/brand/logo";

// Phase 0 placeholder. The public landing page and Welcome screen arrive in Phase 1.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col items-center justify-center gap-8 px-5 py-12 text-center">
      <Logo priority className="w-64" />
      <h1 className="font-display text-[44px] leading-[1.1] font-bold">Meet with intention.</h1>
      <p className="text-lg leading-7 text-muted-foreground">
        Verified adults in Liberia. Something serious or something easy — on your terms.
      </p>
      <p className="text-sm text-muted-foreground">Coming soon · 18+ only · Available in Liberia only</p>
    </main>
  );
}
