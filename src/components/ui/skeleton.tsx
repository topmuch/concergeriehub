import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // v4.60 — placeholder neutre (ex bg-accent vert #059669 : « ombre
      // verdâtre » signalée par le client au changement d'onglet).
      // Translucide neutre : discret sur toute surface, clair & sombre.
      className={cn("bg-black/[0.07] dark:bg-white/[0.09] animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
