import { NOMBRECONFI } from "@/nombreconfi"
import { getAppLogoPath } from "@/lib/app-logo"
import { cn } from "@/lib/utils"

type AppLogoProps = {
  className?: string
  alt?: string
}

export function AppLogo({ className, alt }: AppLogoProps) {
  return (
    <img
      src={getAppLogoPath()}
      alt={alt ?? NOMBRECONFI.appName}
      className={cn("object-contain", className)}
      draggable={false}
    />
  )
}
