"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ManageOverview = {
  websiteStatus: string;
  approvals: {
    blogRequireApproval: boolean;
    updateRequireApproval: boolean;
    socialRequireApproval: boolean;
    socialEnabled: boolean;
  };
  schedules: {
    updateMaxAgeDays: number;
    socialScheduleDelayHours: number;
    e2eIncludeBlog: boolean;
    e2eIncludeContentUpdate: boolean;
    e2eIncludeSocial: boolean;
  };
  pending: {
    blogs: Array<{ id: string; title: string | null; topic: string; status: string }>;
    contentUpdates: Array<{
      id: string;
      title: string;
      contentType: string;
      reason: string;
    }>;
    socialPosts: Array<{
      id: string;
      platform: string;
      caption: string;
      sourceTitle: string | null;
      status: string;
    }>;
  };
  scheduledSocial: Array<{
    id: string;
    platform: string;
    caption: string;
    scheduledAt: string | null;
    sourceTitle: string | null;
  }>;
  failedTasks: Array<{
    id: string;
    phase: string;
    title: string;
    message: string | null;
    createdAt: string;
  }>;
};

type Props = {
  onBanner: (banner: { type: "success" | "error" | "info"; message: string }) => void;
};

export function ManagementPanel({ onBanner }: Props) {
  const [data, setData] = useState<ManageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/manage");
      const json = await res.json();
      if (!res.ok) {
        onBanner({ type: "error", message: json.error ?? "Failed to load management." });
        return;
      }
      setData(json as ManageOverview);
    } catch {
      onBanner({ type: "error", message: "Failed to load management overview." });
    } finally {
      setLoading(false);
    }
  }, [onBanner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const approve = async (
    type: "blog" | "content_update" | "social" | "social_reject",
    id: string,
    extra?: { publishNow?: boolean }
  ) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/manage/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) {
        onBanner({ type: "error", message: json.error ?? "Action failed." });
        return;
      }
      onBanner({
        type: "success",
        message:
          type === "social_reject"
            ? "Social post cancelled."
            : type === "social" && extra?.publishNow
              ? "Social post approved & publish attempted."
              : "Approved successfully.",
      });
      await refresh();
    } catch {
      onBanner({ type: "error", message: "Approval request failed." });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading management…
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted">No management data available.</p>;
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Management & Approval (Phase 8)
        </h2>
        <p className="text-sm text-muted">
          Website status, pending approvals, scheduled social posts, and failed
          automation tasks.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted">Website status</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {data.websiteStatus}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted">Auto vs approval</p>
          <p className="mt-1 text-xs text-slate-700">
            Blog: {data.approvals.blogRequireApproval ? "approval" : "auto"} · Updates:{" "}
            {data.approvals.updateRequireApproval ? "approval" : "auto"} · Social:{" "}
            {data.approvals.socialRequireApproval ? "approval" : "auto"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted">Social</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {data.approvals.socialEnabled ? "Enabled" : "Disabled"}
          </p>
        </div>
      </div>

      <ApprovalList
        title="Pending blog drafts"
        empty="No blog drafts awaiting approval."
        items={data.pending.blogs.map((b) => ({
          id: b.id,
          label: b.title || b.topic,
          meta: b.status,
        }))}
        busyId={busyId}
        onApprove={(id) => approve("blog", id)}
      />

      <ApprovalList
        title="Pending content updates"
        empty="No content updates awaiting approval."
        items={data.pending.contentUpdates.map((u) => ({
          id: u.id,
          label: u.title,
          meta: `${u.contentType} · ${u.reason}`,
        }))}
        busyId={busyId}
        onApprove={(id) => approve("content_update", id)}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Pending social posts</p>
        {data.pending.socialPosts.length === 0 ? (
          <p className="text-xs text-muted">No social drafts awaiting approval.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-white text-sm">
            {data.pending.socialPosts.map((s) => (
              <li key={s.id} className="space-y-2 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800">
                      {s.platform.toUpperCase()}
                      {s.sourceTitle ? ` · ${s.sourceTitle}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 line-clamp-3">
                      {s.caption}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() =>
                        approve("social", s.id, { publishNow: false })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busyId === s.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Schedule
                    </button>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() =>
                        approve("social", s.id, { publishNow: true })
                      }
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      Publish now
                    </button>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => approve("social_reject", s.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="h-3 w-3" />
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Scheduled social</p>
        {data.scheduledSocial.length === 0 ? (
          <p className="text-xs text-muted">Nothing scheduled.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-white text-sm">
            {data.scheduledSocial.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-slate-800">
                  {s.platform.toUpperCase()}
                  {s.sourceTitle ? ` · ${s.sourceTitle}` : ""}
                </span>
                <span className="text-xs text-muted">
                  {s.scheduledAt
                    ? new Date(s.scheduledAt).toLocaleString()
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Failed automation tasks</p>
        {data.failedTasks.length === 0 ? (
          <p className="text-xs text-muted">No failed tasks.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-white text-sm">
            {data.failedTasks.map((t) => (
              <li key={t.id} className="space-y-0.5 px-3 py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-slate-800">{t.title}</span>
                  <span className="text-xs uppercase text-muted">{t.phase}</span>
                </div>
                {t.message ? (
                  <p className="text-xs text-red-700">{t.message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => void refresh()}
        className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Refresh
      </button>
    </section>
  );
}

function ApprovalList({
  title,
  empty,
  items,
  busyId,
  onApprove,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; label: string; meta: string }>;
  busyId: string | null;
  onApprove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-white text-sm">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div>
                <p className="text-slate-800">{item.label}</p>
                <p className="text-xs text-muted">{item.meta}</p>
              </div>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => onApprove(item.id)}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {busyId === item.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Approve & publish
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
