import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The supplied logo sits on solid black. `mix-blend-screen` drops the black against
 * the dark app background so no box shows around it.
 */
function Logo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/wekonnectz-logo.png"
      alt="WeKonnectz"
      width={800}
      height={483}
      priority={priority}
      className={cn("h-auto mix-blend-screen", className)}
    />
  );
}

function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/wekonnectz-heart.png"
      alt=""
      aria-hidden
      width={512}
      height={512}
      className={cn("h-auto mix-blend-screen", className)}
    />
  );
}

export { Logo, LogoMark };
