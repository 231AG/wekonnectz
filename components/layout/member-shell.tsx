import { BottomNav } from "@/components/ui/bottom-nav";
import { cn } from "@/lib/utils";

/** Member app frame with the bottom navigation (mock-ups member 01–05). */
function MemberShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
      <main className={cn("flex flex-1 flex-col gap-5 px-5 pt-5 pb-6", className)}>{children}</main>
      <div className="sticky bottom-0 z-30">
        <BottomNav />
      </div>
    </div>
  );
}

export { MemberShell };
