import { useEffect, useState, useRef } from "react";
import { Plus } from "lucide-react";
import { createKnowledge, getKnowledge } from "../../api/atlasApi";

function KnowledgeEditor({ onSaved }) {

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [existingCategories, setExistingCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);

  // Suggestions only, via a <datalist> - not a hard-coded taxonomy, so a
  // business can name categories however makes sense to them, but
  // reusing "Pricing" instead of accidentally typing "Prices" a second
  // time is one click away instead of requiring them to remember their
  // own past spelling.
  useEffect(() => {

    const business_id = localStorage.getItem("business_id");

    getKnowledge(business_id)
      .then((data) => {

        const categories = [...new Set(data.map((item) => item.category).filter(Boolean))].sort();

        setExistingCategories(categories);

      })
      .catch(() => {});

  }, []);

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
      const trimmedCategory = category.trim();

      await createKnowledge(
  business_id,
  title.trim(),
  content.trim(),
  trimmedCategory || null
);

      if (trimmedCategory && !existingCategories.includes(trimmedCategory)) {

        setExistingCategories([...existingCategories, trimmedCategory].sort());

      }

      setTitle("");
      setContent("");
      setCategory("");

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

      <label htmlFor="knowledge-category" className="mt-4 mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        Category (optional)
      </label>

      <input
        id="knowledge-category"
        list="knowledge-category-options"
        className="w-full bg-ink-800 border border-ink-700 rounded-xl p-3 placeholder:text-slate-500"
        placeholder="e.g. Pricing, Hours & Location"
        value={category}
        onChange={(e)=>setCategory(e.target.value)}
      />

      <datalist id="knowledge-category-options">
        {existingCategories.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

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