import { useEffect, useState } from "react";
import { getKnowledge, updateKnowledge, deleteKnowledge } from "../../api/atlasApi";

function KnowledgePanel() {


  const [knowledge, setKnowledge] = useState([]);

  const [editingId, setEditingId] = useState(null);

  const [editTitle, setEditTitle] = useState("");

  const [editContent, setEditContent] = useState("");

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  const [error, setError] = useState("");



  async function loadKnowledge() {

    try {

      const business_id = localStorage.getItem("business_id");

      const data = await getKnowledge(business_id);

      setKnowledge(data);

    } catch (error) {

      console.error(
        "Knowledge error:",
        error
      );

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

    try {

      await updateKnowledge(id, editTitle.trim(), editContent.trim());
      setEditingId(null);
      setError("");
      await loadKnowledge();

    } catch (err) {

      console.error(err);
      setError("Failed to update knowledge. Please try again.");

    }

  };

  const handleDelete = async (id) => {

    try {

      await deleteKnowledge(id);
      setConfirmingDeleteId(null);
      setError("");
      await loadKnowledge();

    } catch (err) {

      console.error(err);
      setError("Failed to delete knowledge. Please try again.");

    }

  };


  return (

    <div className="
      mt-8
      bg-slate-900
      border
      border-slate-800
      rounded-2xl
      p-6
    ">

      <h2 className="text-2xl font-bold">

        📚 Business Knowledge

      </h2>

      {error && (

        <p className="mt-3 text-red-400">

          {error}

        </p>

      )}



      {knowledge.length === 0 ? (

        <p className="mt-4 text-slate-400">

          No business knowledge added yet.

        </p>


      ) : (

        knowledge.map((item) => (

          <div

            key={item.id}

            className="
              mt-4
              bg-slate-800
              rounded-xl
              p-4
            "

          >

            {editingId === item.id ? (

              <>

                <input

                  value={editTitle}

                  onChange={(e) => setEditTitle(e.target.value)}

                  className="w-full bg-slate-900 text-white border border-slate-700 rounded-lg p-2 mb-2"

                />

                <textarea

                  value={editContent}

                  onChange={(e) => setEditContent(e.target.value)}

                  className="w-full bg-slate-900 text-white border border-slate-700 rounded-lg p-2 h-24"

                />

                <div className="flex gap-2 mt-2">

                  <button

                    onClick={() => saveEdit(item.id)}

                    className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg text-sm"

                  >

                    Save

                  </button>

                  <button

                    onClick={cancelEdit}

                    className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg text-sm"

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

                        className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg text-sm"

                      >

                        Confirm

                      </button>

                      <button

                        onClick={() => setConfirmingDeleteId(null)}

                        className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg text-sm"

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
