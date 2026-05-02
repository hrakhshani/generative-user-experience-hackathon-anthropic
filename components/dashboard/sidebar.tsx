"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Layers, Bookmark, Settings, LogOut, Wand2 } from "lucide-react"

const items = [
  // "Saved" is the user-facing rename of the internal "objects" concept —
  // every entry on this page is something the user explicitly saved from
  // the web via the extension, so the label maps to user intent rather
  // than the database table name.
  { href: "/dashboard", label: "Saved", icon: Bookmark, exact: true },
  { href: "/dashboard/rules", label: "Page rules", icon: Wand2, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: false },
]

export function DashboardSidebar({ email }: { email: string | null }) {
  const pathname = usePathname()
  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-b border-border bg-background md:h-svh md:w-60 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 px-4 py-4 md:py-5">
        <Layers className="h-4 w-4" />
        <span className="font-mono text-sm tracking-tight">UWAL</span>
      </div>
      <nav className="flex flex-row gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-2 md:pb-0">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto hidden border-t border-border p-3 md:block">
        <div className="mb-2 truncate px-2 font-mono text-xs text-muted-foreground" title={email ?? ""}>
          {email ?? "Not signed in"}
        </div>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
