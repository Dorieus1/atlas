import { useEffect, useState, useRef } from "react";
import { BookOpen } from "lucide-react";
import { getKnowledge, updateKnowledge, deleteKnowledge } from "../../api/atlasApi";
import EmptyState from "../EmptyState";

function KnowledgePanel() {


  const [knowledge, setKnowledge] = useState([]);

  const [editingId, setEditingId] = useState(null);

  const [editTitle, setEditTitle] = useState("");

  const [editContent, setEditContent] = useState("");

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

      await updateKnowledge(id, editTitle.trim(), editContent.trim());
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



      {knowledge.length === 0 && !error ? (

        <EmptyState
          icon={BookOpen}
          title="No knowledge added yet"
          description="Teach Atlas about your business below so it can answer customers accurately."
        />


      ) : knowledge.length === 0 ? null : (

        knowledge.map((item) => (

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

        ))

      )}


    </div>

  );

}


export default KnowledgePanel;
