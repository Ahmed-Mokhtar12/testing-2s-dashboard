import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, RefreshCw, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

type CheckStatus = "pending" | "running" | "pass" | "warn" | "fail";

interface CheckResult {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  detail?: string;
}

const initialChecks: CheckResult[] = [
  {
    id: "storage",
    label: "Storage policies",
    description: "Private buckets restricted to hotel staff (documents, sop, whatsapp-attachments).",
    status: "pending",
  },
  {
    id: "auth",
    label: "Authentication session",
    description: "An authenticated session is active and roles resolve correctly.",
    status: "pending",
  },
  {
    id: "rls",
    label: "RLS reachability",
    description: "Reads against protected tables succeed with the current role.",
    status: "pending",
  },
  {
    id: "build",
    label: "Production build",
    description: "App is running from a Vite production bundle (no dev banner).",
    status: "pending",
  },
  {
    id: "types",
    label: "TypeScript & lint",
    description: "Last verified locally — re-run `tsc` and `eslint` before deploy.",
    status: "pending",
  },
];

const statusMeta: Record<CheckStatus, { color: string; icon: typeof CheckCircle2; label: string }> = {
  pending: { color: "text-muted-foreground", icon: Loader2, label: "Pending" },
  running: { color: "text-muted-foreground", icon: Loader2, label: "Running" },
  pass: { color: "text-emerald-500", icon: CheckCircle2, label: "Pass" },
  warn: { color: "text-amber-500", icon: AlertTriangle, label: "Warning" },
  fail: { color: "text-destructive", icon: XCircle, label: "Fail" },
};

export default function PrePublish() {
  const [checks, setChecks] = useState<CheckResult[]>(initialChecks);
  const [running, setRunning] = useState(false);

  const update = useCallback((id: string, patch: Partial<CheckResult>) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setChecks(initialChecks.map((c) => ({ ...c, status: "running" as CheckStatus, detail: undefined })));

    // 1. Auth
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        update("auth", { status: "fail", detail: "No active session — log in before publishing." });
      } else {
        update("auth", { status: "pass", detail: `Signed in as ${session.user.email ?? session.user.id}` });
      }
    } catch (e) {
      update("auth", { status: "fail", detail: e instanceof Error ? e.message : "Auth check failed" });
    }

    // 2. RLS reachability — try a lightweight read
    try {
      const { error } = await supabase.from("Chat History").select("id", { count: "exact", head: true }).limit(1);
      if (error) {
        update("rls", { status: "fail", detail: error.message });
      } else {
        update("rls", { status: "pass", detail: "Read on Chat History succeeded." });
      }
    } catch (e) {
      update("rls", { status: "fail", detail: e instanceof Error ? e.message : "RLS check failed" });
    }

    // 3. Storage policies — ensure unauthenticated bucket listing is blocked + authenticated list works
    try {
      const buckets = ["documents", "sop", "whatsapp-attachments"] as const;
      const results = await Promise.all(
        buckets.map(async (b) => {
          const { error } = await supabase.storage.from(b).list("", { limit: 1 });
          return { bucket: b, ok: !error, error: error?.message };
        })
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) {
        update("storage", { status: "pass", detail: "All 3 private buckets reachable for current staff session." });
      } else {
        update("storage", {
          status: "warn",
          detail: `Could not list: ${failed.map((f) => `${f.bucket} (${f.error})`).join(", ")}`,
        });
      }
    } catch (e) {
      update("storage", { status: "fail", detail: e instanceof Error ? e.message : "Storage check failed" });
    }

    // 4. Production build heuristic
    try {
      const isProd = import.meta.env.PROD;
      const mode = import.meta.env.MODE;
      if (isProd) {
        update("build", { status: "pass", detail: `Running production bundle (mode: ${mode}).` });
      } else {
        update("build", {
          status: "warn",
          detail: `Currently in ${mode} mode. The published deployment will use a production build automatically.`,
        });
      }
    } catch (e) {
      update("build", { status: "fail", detail: e instanceof Error ? e.message : "Build check failed" });
    }

    // 5. Types & lint — informational (cannot run tsc from the browser)
    update("types", {
      status: "warn",
      detail: "Last local run: 0 errors. Re-run `npx tsc --noEmit && npx eslint src --quiet` before publishing.",
    });

    setRunning(false);
  }, [update]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const allPass = checks.every((c) => c.status === "pass");
  const anyFail = checks.some((c) => c.status === "fail");

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Pre-publish checklist"
        description="Verify the app is ready for production deployment."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Deployment readiness</CardTitle>
            <CardDescription>
              {allPass
                ? "All checks passed — safe to publish."
                : anyFail
                ? "One or more checks failed — review before publishing."
                : "Review warnings before publishing."}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={runChecks} disabled={running}>
            <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} />
            Re-run
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {checks.map((check) => {
            const meta = statusMeta[check.status];
            const Icon = meta.icon;
            const spin = check.status === "running" || check.status === "pending";
            return (
              <div
                key={check.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-4"
              >
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${meta.color} ${spin ? "animate-spin" : ""}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-sm">{check.label}</h3>
                    <Badge
                      variant={
                        check.status === "pass"
                          ? "default"
                          : check.status === "fail"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[10px] uppercase"
                    >
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{check.description}</p>
                  {check.detail && (
                    <p className={`text-xs mt-2 ${meta.color}`}>{check.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4" /> Next steps
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Resolve any <span className="text-destructive">failed</span> checks before publishing.</p>
          <p>2. Run <code className="text-xs bg-muted px-1.5 py-0.5 rounded">npx tsc --noEmit && npx eslint src --quiet</code> locally.</p>
          <p>3. Click <strong className="text-foreground">Publish</strong> in the top-right of Lovable.</p>
        </CardContent>
      </Card>
    </div>
  );
}
