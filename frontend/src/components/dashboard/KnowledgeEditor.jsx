import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import { createKnowledge } from "../../api/atlasApi";

function KnowledgeEditor({ onSaved }) {

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);

  const saveKnowledge = async () => {

    if (!title.trim() || !content.trim()) {

      setError("Title and content are both required.");

      return;

    }

    if (savingRef.current) {

      return;

    }

    savingRef.current = true;

    setError("");

    setSaving(true);

    try {

      const business_id = localStorage.getItem("business_id");

      await createKnowledge(
  business_id,
  title.trim(),
  content.trim()
);

      setTitle("");
      setContent("");

      if (onSaved) {

        onSaved();

      }

    } catch (err) {

      console.error(err);

      setError("Failed to save knowledge. Please try again.");

    } finally {

      savingRef.current = false;

      setSaving(false);

    }

  };

  return (

    <div className="h-full bg-ink-900/60 border border-ink-700 rounded-2xl p-6">

      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Plus size={22} />
        Add Business Knowledge
      </h2>

      {error && (
        <p className="text-red-400 mt-3">
          {error}
        </p>
      )}

      <label htmlFor="knowledge-title" className="mt-5 mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        Title
      </label>

      <input
        id="knowledge-title"
        className="w-full bg-ink-800 border border-ink-700 rounded-xl p-3 placeholder:text-slate-500"
        placeholder="Title"
        value={title}
        onChange={(e)=>setTitle(e.target.value)}
      />

      <label htmlFor="knowledge-content" className="mt-4 mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        Content
      </label>

      <textarea
        id="knowledge-content"
        className="w-full bg-ink-800 border border-ink-700 rounded-xl p-3 h-32 placeholder:text-slate-500"
        placeholder="Content"
        value={content}
        onChange={(e)=>setContent(e.target.value)}
      />

      <button
        onClick={saveKnowledge}
        disabled={saving}
        className="mt-5 bg-brand-600 hover:bg-brand-500 px-5 py-2 rounded-xl disabled:opacity-50 transition"
      >
        {saving ? "Saving..." : "Save Knowledge"}
      </button>

    </div>

  );

}

export default KnowledgeEditor;