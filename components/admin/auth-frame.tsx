/** Centred frame for the staff sign-in screens (desktop admin style, no mock-up). */
function AdminAuthFrame({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-card border border-border bg-surface-1 p-8">
        <div>
          <p className="font-display text-xl font-bold text-brand-gradient">WeKonnectz</p>
          <p className="text-xs text-muted-foreground">Admin console</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[26px] font-bold">{title}</h1>
          <p className="text-[15px] text-muted-foreground">{lead}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export { AdminAuthFrame };
