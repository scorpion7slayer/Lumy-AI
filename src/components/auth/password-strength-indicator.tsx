import { getPasswordStrength } from "@/lib/password-strength"
import { cn } from "@/lib/utils"

export function PasswordStrengthIndicator({ password }: { password: string }) {
  const strength = getPasswordStrength(password)
  if (!password) return null

  return (
    <div className="grid gap-2" aria-live="polite">
      <div className="grid grid-cols-4 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              "h-1.5 rounded-full bg-muted",
              segment <= strength.score &&
                (strength.secure ? "bg-emerald-600" : "bg-amber-500")
            )}
          />
        ))}
      </div>
      <p
        className={cn(
          "text-xs",
          strength.secure
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-amber-700 dark:text-amber-400"
        )}
      >
        Sécurité du mot de passe : {strength.label}
      </p>
    </div>
  )
}
