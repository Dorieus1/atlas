import { useEffect, useState, useRef } from "react";
import { BookOpen, Search } from "lucide-react";
import { getKnowledge, updateKnowledge, deleteKnowledge } from "../../api/atlasApi";
import EmptyState from "../EmptyState";

const UNCATEGORIZED_LABEL = "Uncategorized";

function KnowledgePanel() {


  const [knowledge, setKnowledge] = useState([]);

  const [search, setSearch] = useState("");

  const [editingId, setEditingId] = useState(null);

  const [editTitle, setEditTitle] = useState("");

  const [editContent, setEditContent] = useState("");

  const [editCategory, setEditCategory] = useState("");

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  const [error, setError] = useState("");

  const [savingId, setSavingId] = useState(null);

  const [deletingId, setDeletingId] = useState(null);

  const savingRef = useRef(null);

  const deletingRef = useRef(null);



  async function loadKnowledge() {

    try {

      const business_id = localStorage.getItem("business_id");

      const data = await getKnowledge(business_id);

      setKnowledge(data);

      setError("");

    } catch (err) {

      console.error(
        "Knowledge error:",
        err
      );

      setError("Couldn't load your knowledge base. Please refresh to try again.");

    }

  }


  useEffect(() => {

    loadKnowledge();

  }, []);


  const startEdit = (item) => {

    setEditingId(item.id);
    setEditTitle(item.title);
    setEditContent(item.content);
    setEditCategory(item.category || "");
    setConfirmingDeleteId(null);
    setError("");

  };

  const cancelEdit = () => {

    setEditingId(null);

  };

  const saveEdit = async (id) => {

    if (!editTitle.trim() || !editContent.trim()) {

      setError("Title and content are both required.");
      return;

    }

    if (savingRef.current) {

      return;

    }

    savingRef.current = id;

    setSavingId(id);

    try {

      await updateKnowledge(id, editTitle.trim(), editContent.trim(), editCategory.trim() || null);
      setEditingId(null);
      setError("");
      await loadKnowledge();

    } catch (err) {

      console.error(err);
      setError("Failed to update knowledge. Please try again.");

    } finally {

      savingRef.current = null;

      setSavingId(null);

    }

  };

  const handleDelete = async (id) => {

    if (deletingRef.current) {

      return;

    }

    deletingRef.current = id;

    setDeletingId(id);

    try {

      await deleteKnowledge(id);
      setConfirmingDeleteId(null);
      setError("");
      await loadKnowledge();

    } catch (err) {

      console.error(err);
      setError("Failed to delete knowledge. Please try again.");

    } finally {

      deletingRef.current = null;

      setDeletingId(null);

    }

  };


  // Client-side only - the knowledge base is small enough per business
  // (this isn't a search across thousands of rows) that a second round
  // trip to the server for a filter this simple would just add latency
  // for no real benefit.
  const filteredKnowledge = knowledge.filter((item) => {

    if (!search.trim()) {
      return true;
    }

    const query = search.trim().toLowerCase();

    return (
      item.title.toLowerCase().includes(query) ||
      item.content.toLowerCase().includes(query) ||
      (item.category || "").toLowerCase().includes(query)
    );

  });

  // Grouped so a growing knowledge base reads as sections (Pricing,
  // Hours & Location, ...) instead of one long undifferentiated list -
  // uncategorized entries collect into their own group at the end
  // rather than being scattered or hidden.
  const groups = {};

  filteredKnowledge.forEach((item) => {

    const groupName = item.category || UNCATEGORIZED_LABEL;

    if (!groups[groupName]) {
      groups[groupName] = [];
    }

    groups[groupName].push(item);

  });

  const groupNames = Object.keys(groups).sort((a, b) => {

    if (a === UNCATEGORIZED_LABEL) return 1;
    if (b === UNCATEGORIZED_LABEL) return -1;

    return a.localeCompare(b);

  });


  return (

    <div className="
      h-full
      bg-ink-900/60
      border
      border-ink-700
      rounded-2xl
      p-6
    ">

      <h2 className="text-2xl font-bold flex items-center gap-2">

        <BookOpen size={22} />
        Business Knowledge

      </h2>

      {error && (

        <p className="mt-3 text-red-400">

          {error}

        </p>

      )}

      {knowledge.length > 0 && (

        <div className="relative mt-4">

          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your knowledge base..."
            className="w-full rounded-lg border border-ink-700 bg-ink-900/60 p-2.5 pl-9 text-sm text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
          />

        </div>

      )}



      {knowledge.length === 0 && !error ? (

        <EmptyState
          icon={BookOpen}
          title="No knowledge added yet"
          description="Teach Atlas about your business below so it can answer customers accurately."
        />


      ) : knowledge.length > 0 && filteredKnowledge.length === 0 ? (

        <p className="mt-4 text-sm text-slate-400">
          No knowledge entries match "{search.trim()}".
        </p>

      ) : knowledge.length === 0 ? null : (

        groupNames.map((groupName) => (

          <div key={groupName} className="mt-5">

            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {groupName} ({groups[groupName].length})
            </h3>

            {groups[groupName].map((item) => (

          <div

            key={item.id}

            className="
              mt-4
              bg-ink-800
              rounded-xl
              p-4
            "

          >

            {editingId === item.id ? (

              <>

                <label htmlFor={`knowledge-title-${item.id}`} className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Title
                </label>

                <input

                  id={`knowledge-title-${item.id}`}

                  value={editTitle}

                  onChange={(e) => setEditTitle(e.target.value)}

                  className="w-full bg-ink-900 text-white border border-ink-700 rounded-lg p-2 mb-2"

                />

                <label htmlFor={`knowledge-content-${item.id}`} className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Content
                </label>

                <textarea

                  id={`knowledge-content-${item.id}`}

                  value={editContent}

                  onChange={(e) => setEditContent(e.target.value)}

                  className="w-full bg-ink-900 text-white border border-ink-700 rounded-lg p-2 h-24"

                />

                <label htmlFor={`knowledge-category-${item.id}`} className="mb-1 mt-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Category
                </label>

                <input

                  id={`knowledge-category-${item.id}`}

                  value={editCategory}

                  onChange={(e) => setEditCategory(e.target.value)}

                  placeholder="e.g. Pricing, Hours & Location"

                  className="w-full bg-ink-900 text-white border border-ink-700 rounded-lg p-2 placeholder:text-slate-500"

                />

                <div className="flex gap-2 mt-2">

                  <button

                    onClick={() => saveEdit(item.id)}

                    disabled={savingId === item.id}

                    className="bg-brand-600 hover:bg-brand-500 px-3 py-1 rounded-lg text-sm disabled:opacity-50"

                  >

                    {savingId === item.id ? "Saving..." : "Save"}

                  </button>

                  <button

                    onClick={cancelEdit}

                    className="bg-ink-700 hover:bg-ink-600 px-3 py-1 rounded-lg text-sm"

                  >

                    Cancel

                  </button>

                </div>

              </>

            ) : (

              <>

                <div className="flex justify-between items-start gap-3">

                  <div>

                    <h3 className="font-bold">

                      {item.title}

                    </h3>


                    <p className="mt-2 whitespace-pre-wrap">

                      {item.content}

                    </p>

                  </div>


                  {confirmingDeleteId === item.id ? (

                    <div className="flex flex-col gap-2 shrink-0">

                      <span className="text-slate-300 text-xs">

                        Delete this?

                      </span>

                      <button

                        onClick={() => handleDelete(item.id)}

                        disabled={deletingId === item.id}

                        className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg text-sm disabled:opacity-50"

                      >

                        {deletingId === item.id ? "Deleting..." : "Confirm"}

                      </button>

                      <button

                        onClick={() => setConfirmingDeleteId(null)}

                        className="bg-ink-700 hover:bg-ink-600 px-3 py-1 rounded-lg text-sm"

                      >

                        Cancel

                      </button>

                    </div>

                  ) : (

                    <div className="flex gap-2 shrink-0">

                      <button

                        onClick={() => startEdit(item)}

                        className="text-slate-400 hover:text-white text-sm"

                      >

                        Edit

                      </button>

                      <button

                        onClick={() => setConfirmingDeleteId(item.id)}

                        className="text-red-400 hover:text-red-300 text-sm"

                      >

                        Delete

                      </button>

                    </div>

                  )}

                </div>

              </>

            )}


          </div>

            ))}

          </div>

        ))

      )}


    </div>

  );

}


export default KnowledgePanel;
