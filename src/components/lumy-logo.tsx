import { cn } from "@/lib/utils"

export function LumyLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden", className)}
    >
      <img
        src="/lumyailogo.webp"
        alt="Lumy AI"
        className="absolute top-1/2 left-1/2 aspect-square w-[120%] max-w-none -translate-x-1/2 -translate-y-1/2 invert dark:invert-0"
      />
    </span>
  )
}

export function PoweredByZyranex({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-[10px] tracking-[0.12em] text-muted-foreground uppercase",
        className
      )}
    >
      Powered by <span className="font-semibold text-foreground">Zyranex</span>
    </p>
  )
}
