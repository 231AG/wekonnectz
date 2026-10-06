import { cn } from "@/lib/utils";

/** Member/onboarding page frame: phone width, mock-up padding, footer area pinned to the bottom. */
function MobileScreen({
  children,
  footer,
  className,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 pt-5 pb-6">
      <main className={cn("flex flex-1 flex-col gap-5", className)}>{children}</main>
      {footer ? <div className="mt-6 flex flex-col gap-3">{footer}</div> : null}
    </div>
  );
}

function ScreenTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h1 id={id} className="font-display text-[28px] leading-[33px] font-bold">
      {children}
    </h1>
  );
}

function ScreenLead({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-[22px] text-muted-foreground">{children}</p>;
}

function FormError({ id, children }: { id?: string; children?: React.ReactNode }) {
  return (
    <p id={id} role="alert" aria-live="assertive" className="text-sm font-semibold text-danger empty:hidden">
      {children}
    </p>
  );
}

export { FormError, MobileScreen, ScreenLead, ScreenTitle };
