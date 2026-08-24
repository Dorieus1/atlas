import { useState, useRef } from "react";
import { createKnowledge } from "../../api/atlasApi";

function KnowledgeEditor() {

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

      window.location.reload();

    } catch (err) {

      console.error(err);

      setError("Failed to save knowledge. Please try again.");

    } finally {

      savingRef.current = false;

      setSaving(false);

    }

  };

  return (

    <div className="mt-8 bg-ink-900/60 border border-ink-700 rounded-2xl p-6">

      <h2 className="text-2xl font-bold">
        ➕ Add Business Knowledge
      </h2>

      {error && (
        <p className="text-red-400 mt-3">
          {error}
        </p>
      )}

      <input
        className="w-full mt-5 bg-ink-800 border border-ink-700 rounded-xl p-3 placeholder:text-slate-500"
        placeholder="Title"
        value={title}
        onChange={(e)=>setTitle(e.target.value)}
      />

      <textarea
        className="w-full mt-4 bg-ink-800 border border-ink-700 rounded-xl p-3 h-32 placeholder:text-slate-500"
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