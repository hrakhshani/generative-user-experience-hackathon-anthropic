import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { CopyButton } from "@/components/dashboard/copy-button"
import { createWorkspaceToken, revokeWorkspaceToken } from "@/app/dashboard/actions"
import { headers } from "next/headers"
import { Trash2 } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: tokens } = await supabase
    .from("workspace_tokens")
    .select("*")
    .order("created_at", { ascending: false })

  // Determine the API base URL the extension should call.
  const h = await headers()
  const proto = h.get("x-forwarded-proto") ?? "https"
  const host = h.get("host") ?? "localhost:3000"
  const apiBase = `${proto}://${host}`

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Account: {user?.email}</p>
      </header>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-medium text-foreground">Extension setup</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Load the extension unpacked in Chrome, then open its options and paste the API URL plus a workspace token.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">API URL</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="block flex-1 truncate rounded border border-border bg-muted px-2 py-1 font-mono text-xs">
                {apiBase}
              </code>
              <CopyButton value={apiBase} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Install steps</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
              <li>Download the project ZIP and unzip locally.</li>
              <li>
                Open <code className="rounded bg-muted px-1 font-mono text-xs">chrome://extensions</code>.
              </li>
              <li>Enable Developer mode, click &quot;Load unpacked&quot;, select the <code className="rounded bg-muted px-1 font-mono text-xs">extension/</code> folder.</li>
              <li>Open extension Options and paste the API URL and a token below.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-foreground">Workspace tokens</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The extension authenticates with these tokens. Treat them like passwords.
            </p>
          </div>
          <form action={createWorkspaceToken} className="flex items-end gap-2">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" placeholder="Chrome Extension" className="w-44" />
            </Field>
            <Button type="submit" size="sm">
              Create token
            </Button>
          </form>
        </div>

        {(tokens ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            No tokens yet. Create one to authenticate the extension.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(tokens ?? []).map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{t.name}</span>
                    {t.revoked ? (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                        revoked
                      </span>
                    ) : null}
                  </div>
                  <code className="block w-full max-w-md truncate rounded border border-border bg-muted px-2 py-1 font-mono text-xs">
                    {t.token}
                  </code>
                  <span className="font-mono text-xs text-muted-foreground">
                    Created {new Date(t.created_at).toLocaleString()}
                    {t.last_used_at ? ` • Last used ${new Date(t.last_used_at).toLocaleString()}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!t.revoked ? <CopyButton value={t.token} label="Copy token" /> : null}
                  {!t.revoked ? (
                    <form
                      action={async () => {
                        "use server"
                        await revokeWorkspaceToken(t.id)
                      }}
                    >
                      <Button type="submit" size="sm" variant="ghost" className="gap-2 text-muted-foreground">
                        <Trash2 className="h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
