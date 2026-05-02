import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  return (
    <div className="flex min-h-svh flex-col bg-background md:flex-row">
      <DashboardSidebar email={user.email ?? null} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  )
}
