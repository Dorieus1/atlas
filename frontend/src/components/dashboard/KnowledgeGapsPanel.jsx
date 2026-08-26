import { useEffect, useState, useRef } from "react";
import { Sparkles, Check, X } from "lucide-react";

import {
  getKnowledgeGaps,
  approveKnowledgeGap,
  dismissKnowledgeGap
} from "../../api/atlasApi";


// Surfaces what chatService's best-effort gap detection has flagged:
// moments where Atlas had to guess or hedge because the business hadn't
// given it specific knowledge yet. Nothing here was written by a human -
// every suggestion is editable before it becomes a real knowledge entry,
// and dismissing one is just as easy as approving it.
function KnowledgeGapsPanel({ onApproved }) {

  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const savingRef = useRef(null);


  const loadGaps = async () => {

    try {

      const data = await getKnowledgeGaps();
      setGaps(data);

      setDrafts((previous) => {

        const next = { ...previous };

        data.forEach((gap) => {

          if (!next[gap.id]) {

            next[gap.id] = {
              title: gap.suggested_title,
              content: gap.suggested_content
            };

          }

        });

        return next;

      });

    } catch (err) {

      console.error("KNOWLEDGE GAPS LOAD ERROR:", err);

    } finally {

      setLoading(false);

    }

  };


  useEffect(() => {

    loadGaps();

  }, []);


  const updateDraft = (id, field, value) => {

    setDrafts((previous) => ({
      ...previous,
      [id]: { ...previous[id], [field]: value }
    }));

  };


  const handleApprove = async (gap) => {

    if (savingRef.current) {
      return;
    }

    const draft = drafts[gap.id] || {};

    if (!draft.title?.trim() || !draft.content?.trim()) {

      setError("Title and content can't be empty.");
      return;

    }

    savingRef.current = gap.id;
    setSavingId(gap.id);
    setError("");

    try {

      await approveKnowledgeGap(gap.id, draft.title.trim(), draft.content.trim());
      await loadGaps();
      onApproved?.();

    } catch (err) {

      console.error("APPROVE KNOWLEDGE GAP ERROR:", err);
      setError("Couldn't save that. Please try again.");

    } finally {

      savingRef.current = null;
      setSavingId(null);

    }

  };


  const handleDismiss = async (gap) => {

    if (savingRef.current) {
      return;
    }

    savingRef.current = gap.id;
    setSavingId(gap.id);
    setError("");

    try {

      await dismissKnowledgeGap(gap.id);
      await loadGaps();

    } catch (err) {

      console.error("DISMISS KNOWLEDGE GAP ERROR:", err);
      setError("Couldn't dismiss that. Please try again.");

    } finally {

      savingRef.current = null;
      setSavingId(null);

    }

  };


  if (loading || gaps.length === 0) {
    return null;
  }

  return (

    <div className="rounded-2xl border border-brand-500/20 bg-brand-600/[0.04] p-6">

      <div className="flex items-center gap-2.5">

        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600/15 text-brand-400">
          <Sparkles size={17} />
        </div>

        <div>
          <h2 className="font-display text-lg font-bold">AI Suggestions</h2>
          <p className="text-xs text-slate-500">
            {gaps.length} moment{gaps.length === 1 ? "" : "s"} Atlas wasn't sure how to answer
          </p>
        </div>

      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">

        {gaps.map((gap) => {

          const draft = drafts[gap.id] || { title: "", content: "" };
          const saving = savingId === gap.id;

          return (

            <div key={gap.id} className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">

              <p className="text-xs text-slate-500">
                Customer asked: <span className="text-slate-400">"{gap.question}"</span>
              </p>

              <label htmlFor={`gap-title-${gap.id}`} className="mt-3 mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Title
              </label>

              <input
                id={`gap-title-${gap.id}`}
                value={draft.title}
                onChange={(e) => updateDraft(gap.id, "title", e.target.value)}
                placeholder="Title"
                className="w-full rounded-lg border border-ink-700 bg-ink-800 p-2.5 text-sm font-medium text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
              />

              <label htmlFor={`gap-content-${gap.id}`} className="mt-2 mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Content
              </label>

              <textarea
                id={`gap-content-${gap.id}`}
                value={draft.content}
                onChange={(e) => updateDraft(gap.id, "content", e.target.value)}
                placeholder="Content"
                className="h-20 w-full rounded-lg border border-ink-700 bg-ink-800 p-2.5 text-sm text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
              />

              <div className="mt-3 flex items-center gap-2">

                <button
                  onClick={() => handleApprove(gap)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
                >
                  <Check size={13} />
                  {saving ? "Saving..." : "Add to Knowledge"}
                </button>

                <button
                  onClick={() => handleDismiss(gap)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-ink-800 disabled:opacity-50"
                >
                  <X size={13} />
                  Dismiss
                </button>

              </div>

            </div>

          );

        })}

      </div>

    </div>

  );

}

export default KnowledgeGapsPanel;
