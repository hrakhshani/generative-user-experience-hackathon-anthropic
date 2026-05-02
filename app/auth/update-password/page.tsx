"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Layers } from "lucide-react"

export default function Page() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const router = useRouter()

  useEffect(() => {
    // The recovery link redirects through /auth/callback which calls
    // exchangeCodeForSession, so by the time we land here the user has
    // a valid recovery session. We surface a friendly error if not.
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setHasSession(Boolean(data.user))
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      router.push("/dashboard")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-foreground">
          <Layers className="h-5 w-5" />
          <span className="font-mono text-sm tracking-tight">UWAL</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-balance">Set a new password</CardTitle>
            <CardDescription>
              {hasSession === false
                ? "This reset link is invalid or expired."
                : "Choose a new password for your workspace."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasSession === false ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Reset links expire after one hour. Request a new one to continue.
                </p>
                <Link
                  href="/auth/forgot-password"
                  className="text-center text-sm text-foreground underline underline-offset-4"
                >
                  Request a new link
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading || hasSession === null}>
                  {isLoading ? "Saving..." : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
