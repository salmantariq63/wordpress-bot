"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Rocket,
  Save,
  Upload,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  parsePipelineSsePayload,
  TerminalLogger,
  type LogMessage,
  type TerminalPipelineStatus,
} from "@/components/TerminalLogger";
import {
  DEFAULT_PAGES,
  SINGLE_CONFIG_ID,
  STANDARD_PAGE_OPTIONS,
} from "@/lib/site-config";

type TabId = "credentials" | "hosting" | "business" | "pages";

type ConnectionStatus = {
  grok: { ok: boolean; error: string | null };
  wordpress: { ok: boolean; error: string | null };
  allOk: boolean;
} | null;

type FormState = {
  xaiApiKey: string;
  wpUrl: string;
  wpUsername: string;
  wpAppPassword: string;
  sftpHost: string;
  sftpPort: string;
  sftpUsername: string;
  sftpPassword: string;
  businessName: string;
  niche: string;
  targetAudience: string;
  toneOfVoice: string;
  coreServices: string[];
  targetKeywords: string[];
  pagesToBuild: string[];
  activeThemeZipPath: string;
};

const initialForm: FormState = {
  xaiApiKey: "",
  wpUrl: "",
  wpUsername: "",
  wpAppPassword: "",
  sftpHost: "",
  sftpPort: "22",
  sftpUsername: "",
  sftpPassword: "",
  businessName: "",
  niche: "",
  targetAudience: "",
  toneOfVoice: "",
  coreServices: [],
  targetKeywords: [],
  pagesToBuild: [...DEFAULT_PAGES],
  activeThemeZipPath: "",
};

const tabs: { id: TabId; label: string }[] = [
  { id: "credentials", label: "Credentials" },
  { id: "hosting", label: "Hosting & Theme" },
  { id: "business", label: "Business Brief" },
  { id: "pages", label: "Page Structure" },
];

function parseCommaInput(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function TagInput({
  label,
  hint,
  tags,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const addTags = (raw: string) => {
    const next = parseCommaInput(raw);
    if (next.length === 0) return;
    onChange([...new Set([...tags, ...next])]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-white p-2 min-h-[42px]">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
          >
            {tag}
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[120px] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTags(draft);
            }
          }}
          onBlur={() => addTags(draft)}
          placeholder={placeholder ?? "Type and press Enter"}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

export function SettingsDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("credentials");
  const [form, setForm] = useState<FormState>(initialForm);
  const [customPage, setCustomPage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>(null);
  const [connectionsVerified, setConnectionsVerified] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [pipelineStatus, setPipelineStatus] =
    useState<TerminalPipelineStatus>("IDLE");

  const patch = useCallback((partial: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
    setConnectionsVerified(false);
    setConnectionStatus(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        if (data.config) {
          setForm({
            xaiApiKey: data.config.xaiApiKey ?? "",
            wpUrl: data.config.wpUrl ?? "",
            wpUsername: data.config.wpUsername ?? "",
            wpAppPassword: data.config.wpAppPassword ?? "",
            sftpHost: data.config.sftpHost ?? "",
            sftpPort: data.config.sftpPort ?? "22",
            sftpUsername: data.config.sftpUsername ?? "",
            sftpPassword: data.config.sftpPassword ?? "",
            businessName: data.config.businessName ?? "",
            niche: data.config.niche ?? "",
            targetAudience: data.config.targetAudience ?? "",
            toneOfVoice: data.config.toneOfVoice ?? "",
            coreServices: data.config.coreServices ?? [],
            targetKeywords: data.config.targetKeywords ?? [],
            pagesToBuild: data.config.pagesToBuild?.length
              ? data.config.pagesToBuild
              : [...DEFAULT_PAGES],
            activeThemeZipPath: data.config.activeThemeZipPath ?? "",
          });
        }
      } catch {
        setBanner({ type: "error", message: "Could not load saved configuration." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const togglePage = (page: string) => {
    patch({
      pagesToBuild: form.pagesToBuild.includes(page)
        ? form.pagesToBuild.filter((p) => p !== page)
        : [...form.pagesToBuild, page],
    });
  };

  const addCustomPage = () => {
    const name = customPage.trim();
    if (!name) return;
    if (!form.pagesToBuild.includes(name)) {
      patch({ pagesToBuild: [...form.pagesToBuild, name] });
    }
    setCustomPage("");
  };

  const customPages = useMemo(
    () =>
      form.pagesToBuild.filter(
        (p) => !(STANDARD_PAGE_OPTIONS as readonly string[]).includes(p)
      ),
    [form.pagesToBuild]
  );

  const testConnections = async () => {
    setTesting(true);
    setBanner(null);
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xaiApiKey: form.xaiApiKey,
          wpUrl: form.wpUrl,
          wpUsername: form.wpUsername,
          wpAppPassword: form.wpAppPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: "error", message: data.error ?? "Connection test failed." });
        setConnectionsVerified(false);
        return;
      }
      setConnectionStatus(data);
      setConnectionsVerified(data.allOk);
      setBanner({
        type: data.allOk ? "success" : "error",
        message: data.allOk
          ? "All connection tests passed."
          : "One or more connection tests failed. Review details below.",
      });
    } catch {
      setBanner({ type: "error", message: "Connection test request failed." });
      setConnectionsVerified(false);
    } finally {
      setTesting(false);
    }
  };

  const saveConfiguration = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: "error", message: data.error ?? "Save failed." });
        return;
      }
      setBanner({ type: "success", message: "Configuration saved successfully." });
    } catch {
      setBanner({ type: "error", message: "Could not save configuration." });
    } finally {
      setSaving(false);
    }
  };

  const uploadTheme = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setBanner(null);
    try {
      const body = new FormData();
      body.append("theme", file);
      const res = await fetch("/api/upload-theme", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: "error", message: data.error ?? "Upload failed." });
        return;
      }
      patch({ activeThemeZipPath: data.path });
      setBanner({ type: "success", message: `Theme uploaded: ${data.filename}` });
    } catch {
      setBanner({ type: "error", message: "Theme upload failed." });
    } finally {
      setUploading(false);
    }
  };

  const appendLog = useCallback((entry: LogMessage) => {
    setLogs((prev) => [...prev, entry]);
  }, []);

  const launchAutomation = async () => {
    setIsPipelineRunning(true);
    setPipelineStatus("RUNNING");
    setLogs([]);
    setBanner({
      type: "info",
      message: "Automation pipeline started. Streaming logs below…",
    });

    let failed = false;

    try {
      const saveRes = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!saveRes.ok) {
        const saveData = await saveRes.json();
        const message = saveData.error ?? "Save configuration before launching.";
        setPipelineStatus("FAILED");
        appendLog({
          timestamp: new Date().toISOString(),
          level: "error",
          message,
        });
        setBanner({ type: "error", message });
        failed = true;
        return;
      }

      const res = await fetch("/api/run-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: SINGLE_CONFIG_ID }),
      });

      if (!res.ok || !res.body) {
        const message = "Pipeline request failed.";
        setPipelineStatus("FAILED");
        appendLog({
          timestamp: new Date().toISOString(),
          level: "error",
          message,
        });
        setBanner({ type: "error", message });
        failed = true;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          const parsed = parsePipelineSsePayload(payload);
          if (!parsed) continue;

          if (parsed.kind === "log") {
            setLogs((prev) => [...prev, parsed.entry]);
            continue;
          }

          if (parsed.kind === "done") {
            completed = true;
            setPipelineStatus("COMPLETED");
            appendLog({
              timestamp: new Date().toISOString(),
              level: "info",
              phase: "complete",
              message: "Pipeline finished — status COMPLETED.",
            });
            setBanner({
              type: "success",
              message: "Phase 1–3 automation completed successfully.",
            });
            continue;
          }

          if (parsed.kind === "error") {
            failed = true;
            setPipelineStatus("FAILED");
            setLogs((prev) => {
              const last = prev[prev.length - 1];
              if (last?.level === "error" && last.message === parsed.message) {
                return prev;
              }
              return [
                ...prev,
                {
                  timestamp: new Date().toISOString(),
                  level: "error",
                  message: parsed.message,
                },
              ];
            });
            setBanner({ type: "error", message: parsed.message });
          }
        }
      }

      if (!completed && !failed) {
        setPipelineStatus("FAILED");
        appendLog({
          timestamp: new Date().toISOString(),
          level: "error",
          message: "Pipeline stream ended unexpectedly.",
        });
      }
    } catch {
      setPipelineStatus("FAILED");
      appendLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: "Pipeline stream disconnected.",
      });
      setBanner({ type: "error", message: "Pipeline stream disconnected." });
    } finally {
      setIsPipelineRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          Grok WordPress Automation
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          Setup Dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Configure API credentials, hosting, business brief, and page structure before
          launching automated theme deployment and content generation.
        </p>
      </header>

      {banner ? (
        <div
          className={`mb-6 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : banner.type === "error"
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-blue-200 bg-blue-50 text-blue-900"
          }`}
        >
          {banner.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{banner.message}</span>
        </div>
      ) : null}

      <nav className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-primary text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-border hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {activeTab === "credentials" && (
          <section className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Credentials</h2>
              <p className="text-sm text-muted">
                xAI (Grok) and WordPress REST API application password access.
              </p>
            </div>
            <Field label="xAI API Key">
              <input
                type="password"
                className={inputClass}
                value={form.xaiApiKey}
                onChange={(e) => patch({ xaiApiKey: e.target.value })}
                placeholder="xai-..."
                autoComplete="off"
              />
            </Field>
            <Field label="WordPress Site URL">
              <input
                type="url"
                className={inputClass}
                value={form.wpUrl}
                onChange={(e) => patch({ wpUrl: e.target.value })}
                placeholder="https://example.com"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="WP Username">
                <input
                  className={inputClass}
                  value={form.wpUsername}
                  onChange={(e) => patch({ wpUsername: e.target.value })}
                />
              </Field>
              <Field label="WP Application Password">
                <input
                  type="password"
                  className={inputClass}
                  value={form.wpAppPassword}
                  onChange={(e) => patch({ wpAppPassword: e.target.value })}
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={testConnections}
                disabled={testing}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
                Test Connection
              </button>
              {connectionStatus ? (
                <div className="flex flex-col gap-1 text-sm">
                  <span
                    className={
                      connectionStatus.grok.ok ? "text-success" : "text-danger"
                    }
                  >
                    {connectionStatus.grok.ok ? "✓" : "✗"} Grok:{" "}
                    {connectionStatus.grok.ok
                      ? "Connected"
                      : connectionStatus.grok.error}
                  </span>
                  <span
                    className={
                      connectionStatus.wordpress.ok ? "text-success" : "text-danger"
                    }
                  >
                    {connectionStatus.wordpress.ok ? "✓" : "✗"} WordPress:{" "}
                    {connectionStatus.wordpress.ok
                      ? "Connected"
                      : connectionStatus.wordpress.error}
                  </span>
                </div>
              ) : null}
            </div>
          </section>
        )}

        {activeTab === "hosting" && (
          <section className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Hosting & Theme
              </h2>
              <p className="text-sm text-muted">
                Optional SFTP credentials for theme deployment and your target theme
                archive.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SFTP Host">
                <input
                  className={inputClass}
                  value={form.sftpHost}
                  onChange={(e) => patch({ sftpHost: e.target.value })}
                />
              </Field>
              <Field label="SFTP Port">
                <input
                  className={inputClass}
                  value={form.sftpPort}
                  onChange={(e) => patch({ sftpPort: e.target.value })}
                />
              </Field>
              <Field label="SFTP Username">
                <input
                  className={inputClass}
                  value={form.sftpUsername}
                  onChange={(e) => patch({ sftpUsername: e.target.value })}
                />
              </Field>
              <Field label="SFTP Password">
                <input
                  type="password"
                  className={inputClass}
                  value={form.sftpPassword}
                  onChange={(e) => patch({ sftpPassword: e.target.value })}
                  autoComplete="off"
                />
              </Field>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Theme (.zip)</p>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-slate-50 px-6 py-10 text-center transition hover:border-primary/50 hover:bg-slate-100">
                <Upload className="mb-2 h-8 w-8 text-muted" />
                <span className="text-sm font-medium text-slate-700">
                  {uploading ? "Uploading…" : "Drop theme zip or click to browse"}
                </span>
                <span className="mt-1 text-xs text-muted">Max 50MB, .zip only</span>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => uploadTheme(e.target.files?.[0] ?? null)}
                />
              </label>
              {form.activeThemeZipPath ? (
                <p className="mt-2 text-xs text-muted">
                  Active theme:{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5">
                    {form.activeThemeZipPath}
                  </code>
                </p>
              ) : null}
            </div>
          </section>
        )}

        {activeTab === "business" && (
          <section className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Business Brief</h2>
              <p className="text-sm text-muted">
                Context Grok will use when generating page content in Phase 2.
              </p>
            </div>
            <Field label="Company / Business Name">
              <input
                className={inputClass}
                value={form.businessName}
                onChange={(e) => patch({ businessName: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Niche / Industry">
                <input
                  className={inputClass}
                  value={form.niche}
                  onChange={(e) => patch({ niche: e.target.value })}
                />
              </Field>
              <Field label="Tone of Voice">
                <input
                  className={inputClass}
                  value={form.toneOfVoice}
                  onChange={(e) => patch({ toneOfVoice: e.target.value })}
                  placeholder="Professional, friendly, authoritative…"
                />
              </Field>
            </div>
            <Field label="Target Audience">
              <textarea
                className={`${inputClass} min-h-[88px] resize-y`}
                value={form.targetAudience}
                onChange={(e) => patch({ targetAudience: e.target.value })}
              />
            </Field>
            <TagInput
              label="Core Services"
              hint="Comma-separated or press Enter after each service."
              tags={form.coreServices}
              onChange={(coreServices) => patch({ coreServices })}
            />
            <TagInput
              label="Target Keywords"
              tags={form.targetKeywords}
              onChange={(targetKeywords) => patch({ targetKeywords })}
            />
          </section>
        )}

        {activeTab === "pages" && (
          <section className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Page Structure</h2>
              <p className="text-sm text-muted">
                Select standard pages and add custom slugs for Phase 1 scaffolding.
              </p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {STANDARD_PAGE_OPTIONS.map((page) => (
                <li key={page}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={form.pagesToBuild.includes(page)}
                      onChange={() => togglePage(page)}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm font-medium text-slate-800">{page}</span>
                  </label>
                </li>
              ))}
            </ul>
            {customPages.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Custom pages</p>
                <ul className="flex flex-wrap gap-2">
                  {customPages.map((page) => (
                    <li
                      key={page}
                      className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                    >
                      {page}
                      <button
                        type="button"
                        className="hover:text-primary-hover"
                        onClick={() => togglePage(page)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Add Custom Page">
                <input
                  className={inputClass}
                  value={customPage}
                  onChange={(e) => setCustomPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomPage();
                    }
                  }}
                  placeholder="e.g. Pricing, Blog Landing"
                />
              </Field>
              <button
                type="button"
                onClick={addCustomPage}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:mb-0.5"
              >
                Add Page
              </button>
            </div>
          </section>
        )}
      </div>

      <TerminalLogger
        className="mt-8"
        logs={logs}
        status={isPipelineRunning ? "RUNNING" : pipelineStatus}
        onClear={() => {
          setLogs([]);
          if (!isPipelineRunning) {
            setPipelineStatus("IDLE");
          }
        }}
      />

      <footer className="mt-8 flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {connectionsVerified
            ? "Connections verified — you can launch when ready."
            : "Run connection tests on the Credentials tab before launching automation."}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveConfiguration}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Configuration
          </button>
          <button
            type="button"
            onClick={launchAutomation}
            disabled={!connectionsVerified || isPipelineRunning}
            title={
              connectionsVerified
                ? undefined
                : "Pass Grok and WordPress connection tests first"
            }
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPipelineRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            Launch Phase 1–3 Automation
          </button>
        </div>
      </footer>
    </div>
  );
}
