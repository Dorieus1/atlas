import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Tag } from "lucide-react";
import { getTags, createTag, deleteTag } from "../api/atlasApi";

// A business-level list of reusable tag names (e.g. "VIP", "Recurring",
// "Needs follow-up") used to segment the customer list. Kept here as a
// small managed catalog - not typed freestyle per customer - so "VIP"
// doesn't fragment into "vip"/"Vip" and defeat filtering. Tags are
// assigned to individual customers from each customer's profile page.
function TagManagerPanel() {

  const [tags, setTags] = useState([]);
  const [loadError, setLoadError] = useState("");

  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const deletingRef = useRef(null);

  const loadTags = async () => {

    try {

      const data = await getTags();
      setTags(data);
      setLoadError("");

    } catch (err) {

      console.error("TAGS LOAD ERROR:", err);
      setLoadError("Couldn't load your tags. Please refresh to try again.");

    }

  };

  useEffect(() => {

    loadTags();

  }, []);

  const handleAdd = async () => {

    if (!newName.trim()) {

      setAddError("Tag name is required.");
      return;

    }

    if (addingRef.current) {
      return;
    }

    addingRef.current = true;
    setAdding(true);
    setAddError("");

    try {

      await createTag(newName.trim());
      setNewName("");
      await loadTags();

    } catch (err) {

      console.error("CREATE TAG ERROR:", err);
      setAddError(err.message || "Couldn't create that tag. Please try again.");

    } finally {

      addingRef.current = false;
      setAdding(false);

    }

  };

  const handleDelete = async (id) => {

    if (deletingRef.current) {
      return;
    }

    deletingRef.current = id;
    setDeletingId(id);

    try {

      await deleteTag(id);
      setConfirmingDeleteId(null);
      await loadTags();

    } catch (err) {

      console.error("DELETE TAG ERROR:", err);
      setLoadError("Couldn't delete that tag. Please try again.");

    } finally {

      deletingRef.current = null;
      setDeletingId(null);

    }

  };

  return (

    <div className="bg-surface/60 border border-border rounded-2xl p-6 mt-6">

      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Tag size={22} />
        Customer Tags
      </h2>

      <p className="mt-1 text-sm text-fg-faint">
        Create tags like "VIP" or "Recurring" to segment your customer list. Assign or remove them from a customer's profile page.
      </p>

      {loadError && (
        <p className="mt-3 text-danger">
          {loadError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-2">

        <input
          placeholder="Tag name (e.g. VIP)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
        />

        <button
          onClick={handleAdd}
          disabled={adding}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          <Plus size={15} />
          {adding ? "Adding..." : "Add"}
        </button>

      </div>

      {addError && (
        <p className="mt-2 text-sm text-danger">
          {addError}
        </p>
      )}

      {tags.length > 0 && (

        <div className="mt-4 flex flex-wrap gap-2">

          {tags.map((tag) => (

            <span
              key={tag.id}
              className="flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-sm"
            >

              {tag.name}

              {confirmingDeleteId === tag.id ? (

                <span className="flex items-center gap-1.5">

                  <button
                    onClick={() => handleDelete(tag.id)}
                    disabled={deletingId === tag.id}
                    className="text-xs font-medium text-danger hover:opacity-80 disabled:opacity-50"
                  >
                    {deletingId === tag.id ? "Deleting..." : "Confirm"}
                  </button>

                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    disabled={deletingId === tag.id}
                    className="text-xs text-fg-muted hover:text-fg"
                  >
                    Cancel
                  </button>

                </span>

              ) : (

                <button
                  onClick={() => setConfirmingDeleteId(tag.id)}
                  className="text-fg-faint hover:text-danger"
                  aria-label={`Delete ${tag.name} tag`}
                >
                  <Trash2 size={13} />
                </button>

              )}

            </span>

          ))}

        </div>

      )}

    </div>

  );

}

export default TagManagerPanel;
