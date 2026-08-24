import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import {
  getCustomer,
  getCustomerSummary,
  getConversations,
  getCustomerLead,
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  updateLeadStatus,
  getBusinesses,
  deleteCustomer,
  updateCustomerInfo
} from "../api/atlasApi";

import ChatWindow from "../components/ChatWindow";
import MemoryPanel from "../components/MemoryPanel";
import PhotoGallery from "../components/PhotoGallery";
import { SkeletonText } from "../components/Skeleton";


function CustomerProfile() {

  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [business, setBusiness] = useState(null);
  const [summary, setSummary] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [conversations, setConversations] = useState([]);
  const [conversationsError, setConversationsError] = useState("");
  const [lead, setLead] = useState(null);
  const [leadError, setLeadError] = useState("");
  const [notes, setNotes] = useState([]);
  const [notesLoadError, setNotesLoadError] = useState("");
  const [newNote, setNewNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [confirmingDeleteNoteId, setConfirmingDeleteNoteId] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerEmail, setEditCustomerEmail] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [customerEditError, setCustomerEditError] = useState("");
  const [savingCustomerEdit, setSavingCustomerEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);


  useEffect(() => {

    setCustomer(null);
    setLoadingCustomer(true);
    setLoadError("");
    setSummary("");
    setSummaryError("");
    setConversations([]);
    setConversationsError("");
    setLead(null);
    setLeadError("");
    setNotes([]);
    setNotesLoadError("");

    loadCustomer();
    loadSummary();
    loadConversations();
    loadLead();
    loadNotes();

  }, [id]);



  const loadCustomer = async () => {

  try {

    const data = await getCustomer(id);

    setCustomer(data);

    if (data.business_id) {

      const businesses =
        await getBusinesses();

      const customerBusiness =
        businesses.find(
          (item) =>
            item.id === data.business_id
        );

      if (customerBusiness) {

        setBusiness(
          customerBusiness
        );

      }

    }

  } catch (err) {

    console.error(
      "CUSTOMER/BUSINESS LOAD ERROR:",
      err
    );

    setLoadError(

      err.status === 404

        ? "This customer doesn't exist, or may have been deleted."

        : "Couldn't load this customer. Please try again."

    );

  } finally {

    setLoadingCustomer(false);

  }

};



  const loadSummary = async () => {

    try {

      const data =
        await getCustomerSummary(id);

      setSummary(
        data.summary || ""
      );

      setSummaryError("");

    } catch (err) {

      console.error(
        "SUMMARY LOAD ERROR:",
        err
      );

      setSummaryError("Couldn't generate a summary. Please refresh to try again.");

    }

  };



  const loadConversations = async () => {

    try {

      const data =
        await getConversations(id);

      setConversations(data);

      setConversationsError("");

    } catch (err) {

      console.error(
        "CONVERSATIONS LOAD ERROR:",
        err
      );

      setConversationsError("Couldn't load conversation history. Please refresh to try again.");

    }

  };



  const loadLead = async () => {

    try {

      const data =
        await getCustomerLead(id);

      setLead(data);

      setLeadError("");

    } catch (err) {

      console.error(
        "LEAD LOAD ERROR:",
        err
      );

      setLeadError("Couldn't load lead information. Please refresh to try again.");

    }

  };



  const loadNotes = async () => {

    try {

      const data =
        await getNotes(id);

      setNotes(data);

      setNotesLoadError("");

    } catch (err) {

      console.error(
        "NOTES LOAD ERROR:",
        err
      );

      setNotesLoadError("Couldn't load notes. Please refresh to try again.");

    }

  };



  const addNote = async () => {

    if (!newNote.trim()) {

      setNoteError("Note cannot be empty.");

      return;

    }

    try {

      await createNote(
        id,
        newNote.trim()
      );

      setNewNote("");

      setNoteError("");

      await loadNotes();

    } catch (err) {

      console.error(
        "NOTE CREATE ERROR:",
        err
      );

      setNoteError("Failed to add note. Please try again.");

    }

  };



  const startEditNote = (note) => {

    setEditingNoteId(note.id);
    setEditNoteText(note.note);
    setConfirmingDeleteNoteId(null);
    setNoteError("");

  };

  const cancelEditNote = () => {

    setEditingNoteId(null);

  };

  const saveEditNote = async (noteId) => {

    if (!editNoteText.trim()) {

      setNoteError("Note cannot be empty.");
      return;

    }

    try {

      await updateNote(noteId, editNoteText.trim());
      setEditingNoteId(null);
      setNoteError("");
      await loadNotes();

    } catch (err) {

      console.error("NOTE UPDATE ERROR:", err);
      setNoteError("Failed to update note. Please try again.");

    }

  };

  const handleDeleteNote = async (noteId) => {

    try {

      await deleteNote(noteId);
      setConfirmingDeleteNoteId(null);
      setNoteError("");
      await loadNotes();

    } catch (err) {

      console.error("NOTE DELETE ERROR:", err);
      setNoteError("Failed to delete note. Please try again.");

    }

  };



  const changeLeadStatus = async (
    status
  ) => {

    if (!lead) {

      return;

    }

    try {

      await updateLeadStatus(
        lead.id,
        status
      );

      setLead({

        ...lead,

        status

      });

    } catch (err) {

      console.error(
        "LEAD STATUS ERROR:",
        err
      );

    }

  };



  const handleDeleteCustomer = async () => {

    setDeleting(true);

    setDeleteError("");

    try {

      await deleteCustomer(id);

      navigate("/customers");

    } catch (err) {

      console.error(
        "CUSTOMER DELETE ERROR:",
        err
      );

      setDeleteError("Failed to delete customer. Please try again.");

      setDeleting(false);

    }

  };



  const startEditCustomer = () => {

    setEditCustomerName(customer.name || "");
    setEditCustomerEmail(customer.email || "");
    setEditCustomerPhone(customer.phone || "");
    setCustomerEditError("");
    setEditingCustomer(true);

  };

  const cancelEditCustomer = () => {

    setEditingCustomer(false);

  };

  const saveEditCustomer = async () => {

    if (!editCustomerName.trim()) {

      setCustomerEditError("Name is required.");
      return;

    }

    setSavingCustomerEdit(true);

    try {

      await updateCustomerInfo(
        id,
        editCustomerName.trim(),
        editCustomerEmail.trim(),
        editCustomerPhone.trim()
      );

      setCustomer({

        ...customer,
        name: editCustomerName.trim(),
        email: editCustomerEmail.trim(),
        phone: editCustomerPhone.trim()

      });

      setEditingCustomer(false);
      setCustomerEditError("");

    } catch (err) {

      console.error("CUSTOMER UPDATE ERROR:", err);
      setCustomerEditError("Failed to update customer. Please try again.");

    } finally {

      setSavingCustomerEdit(false);

    }

  };



  if (!customer) {

    if (loadingCustomer) {

      return (

        <div className="p-8 text-slate-400">

          Loading...

        </div>

      );

    }

    return (

      <div className="p-8 text-center">

        <p className="text-slate-300">

          {loadError || "This customer doesn't exist, or may have been deleted."}

        </p>

        <button

          onClick={() => navigate("/customers")}

          className="inline-block mt-6 bg-brand-600 hover:bg-brand-500 px-5 py-2 rounded-lg"

        >
          Back to Customers
        </button>

      </div>

    );

  }



  return (

    <div className="p-8 space-y-8">


      {/* CUSTOMER HEADER */}

      <div className="flex flex-wrap items-start justify-between gap-3">

        <div>

          {editingCustomer ? (

            <div className="space-y-2">

              {customerEditError && (

                <p className="text-red-400 text-sm">{customerEditError}</p>

              )}

              <input

                value={editCustomerName}

                onChange={(e) => setEditCustomerName(e.target.value)}

                placeholder="Customer name"

                className="bg-ink-800 text-white border border-ink-700 rounded-lg p-2"

              />

              <input

                value={editCustomerEmail}

                onChange={(e) => setEditCustomerEmail(e.target.value)}

                placeholder="Customer email"

                className="bg-ink-800 text-white border border-ink-700 rounded-lg p-2 ml-2"

              />

              <input

                value={editCustomerPhone}

                onChange={(e) => setEditCustomerPhone(e.target.value)}

                placeholder="Customer phone"

                className="bg-ink-800 text-white border border-ink-700 rounded-lg p-2 ml-2"

              />

              <div className="flex gap-2">

                <button

                  onClick={saveEditCustomer}

                  disabled={savingCustomerEdit}

                  className="bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-lg disabled:opacity-50"

                >

                  {savingCustomerEdit ? "Saving..." : "Save"}

                </button>

                <button

                  onClick={cancelEditCustomer}

                  disabled={savingCustomerEdit}

                  className="bg-ink-700 hover:bg-ink-600 px-4 py-2 rounded-lg"

                >

                  Cancel

                </button>

              </div>

            </div>

          ) : (

            <>

              <h1 className="text-3xl font-bold">

                👤 {customer.name}

                <button

                  onClick={startEditCustomer}

                  className="ml-3 text-sm text-slate-400 hover:text-white font-normal"

                >

                  Edit

                </button>

              </h1>

              <p className="text-slate-400">

                {customer.email}

              </p>

              {customer.phone && (

                <p className="text-slate-400">

                  {customer.phone}

                </p>

              )}

            </>

          )}

        </div>

        <div>

          {confirmingDelete ? (

            <div className="flex flex-wrap items-center gap-3">

              <span className="text-slate-300 text-sm">

                Delete this customer and all their notes, conversations, and history?

              </span>

              <button

                onClick={handleDeleteCustomer}

                disabled={deleting}

                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg disabled:opacity-50"

              >

                {deleting ? "Deleting..." : "Confirm Delete"}

              </button>

              <button

                onClick={() => setConfirmingDelete(false)}

                disabled={deleting}

                className="bg-ink-700 hover:bg-ink-600 px-4 py-2 rounded-lg"

              >

                Cancel

              </button>

            </div>

          ) : (

            <button

              onClick={() => setConfirmingDelete(true)}

              className="bg-red-600/20 text-red-400 hover:bg-red-600/30 px-4 py-2 rounded-lg"

            >

              Delete Customer

            </button>

          )}

          {deleteError && (

            <p className="text-red-400 text-sm mt-2">

              {deleteError}

            </p>

          )}

        </div>

      </div>



      {/* ATLAS CHAT */}

      {business ? (

        <ChatWindow

          business={business}

          customer={customer}

        />

      ) : (

        <div className="
          rounded-2xl
          border
          border-ink-700
          bg-ink-900/60
          p-6
        ">

          <h2 className="text-xl font-bold">

            💬 Atlas Chat

          </h2>

          <p className="
            mt-3
            text-slate-400
          ">

            Loading business information...

          </p>

        </div>

      )}


      <MemoryPanel customer={customer} />


      <div className="mt-6">
        <PhotoGallery customerId={id} />
      </div>



      {/* AI CUSTOMER SUMMARY */}

      <div className="
        rounded-2xl
        border
        border-ink-700
        bg-ink-900/60
        p-6
      ">

        <h2 className="text-xl font-bold">

          🧠 AI Customer Summary

        </h2>

        {summaryError ? (

          <p className="mt-4 whitespace-pre-wrap text-red-400">
            {summaryError}
          </p>

        ) : summary ? (

          <p className="mt-4 whitespace-pre-wrap">
            {summary}
          </p>

        ) : (

          <SkeletonText lines={3} className="mt-4" />

        )}

      </div>



      {/* LEAD INFORMATION */}

      <div className="
        rounded-2xl
        border
        border-ink-700
        bg-ink-900/60
        p-6
      ">

        <h2 className="text-xl font-bold">

          🔥 Lead Information

        </h2>


        {lead ? (

          <div className="
            mt-4
            space-y-3
          ">

            <p>

              <strong>
                Status:
              </strong>{" "}

              {lead.status}

            </p>


            <p>

              <strong>
                Priority:
              </strong>{" "}

              {lead.priority}

            </p>


            <p>

              <strong>
                Interest:
              </strong>{" "}

              {lead.interest}

            </p>


            <select

              value={lead.status}

              onChange={(e) =>
                changeLeadStatus(
                  e.target.value
                )
              }

              className="
                bg-ink-800
                border
                border-ink-700
                rounded-lg
                p-3
              "

            >

              <option value="new">
                New
              </option>

              <option value="contacted">
                Contacted
              </option>

              <option value="qualified">
                Qualified
              </option>

              <option value="closed">
                Closed
              </option>

            </select>

          </div>

        ) : (

          <p className={
            "mt-4 " +
            (leadError ? "text-red-400" : "text-slate-400")
          }>

            {leadError || "No lead found."}

          </p>

        )}

      </div>



      {/* NOTES */}

      <div className="
        rounded-2xl
        border
        border-ink-700
        bg-ink-900/60
        p-6
      ">

        <h2 className="text-xl font-bold">

          📝 Notes

        </h2>

        {noteError && (

          <p className="text-red-400 mt-3">

            {noteError}

          </p>

        )}

        {notesLoadError && (

          <p className="text-red-400 mt-3">

            {notesLoadError}

          </p>

        )}


        <div className="
          flex
          gap-3
          mt-4
        ">

          <input

            value={newNote}

            onChange={(e) =>
              setNewNote(
                e.target.value
              )
            }

            placeholder="Add a note..."

            className="
              flex-1
              bg-ink-900/60
              border
              border-ink-700
              rounded-lg
              p-3
              text-white
              placeholder:text-slate-500
            "

          />


          <button

            onClick={addNote}

            className="
              bg-brand-600
              hover:bg-brand-500
              px-5
              rounded-lg
            "

          >

            Add

          </button>

        </div>



        {notes.map((note) => (

          <div

            key={note.id}

            className="
              bg-ink-800
              rounded-lg
              p-4
              mt-4
            "

          >

            {editingNoteId === note.id ? (

              <>

                <textarea

                  value={editNoteText}

                  onChange={(e) => setEditNoteText(e.target.value)}

                  className="w-full bg-ink-900 text-white border border-ink-700 rounded-lg p-2"

                />

                <div className="flex gap-2 mt-2">

                  <button

                    onClick={() => saveEditNote(note.id)}

                    className="bg-brand-600 hover:bg-brand-500 px-3 py-1 rounded-lg text-sm"

                  >

                    Save

                  </button>

                  <button

                    onClick={cancelEditNote}

                    className="bg-ink-700 hover:bg-ink-600 px-3 py-1 rounded-lg text-sm"

                  >

                    Cancel

                  </button>

                </div>

              </>

            ) : (

              <div className="flex justify-between items-start gap-3">

                <p>{note.note}</p>

                {confirmingDeleteNoteId === note.id ? (

                  <div className="flex gap-2 shrink-0">

                    <button

                      onClick={() => handleDeleteNote(note.id)}

                      className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg text-sm"

                    >

                      Confirm

                    </button>

                    <button

                      onClick={() => setConfirmingDeleteNoteId(null)}

                      className="bg-ink-700 hover:bg-ink-600 px-3 py-1 rounded-lg text-sm"

                    >

                      Cancel

                    </button>

                  </div>

                ) : (

                  <div className="flex gap-2 shrink-0">

                    <button

                      onClick={() => startEditNote(note)}

                      className="text-slate-400 hover:text-white text-sm"

                    >

                      Edit

                    </button>

                    <button

                      onClick={() => setConfirmingDeleteNoteId(note.id)}

                      className="text-red-400 hover:text-red-300 text-sm"

                    >

                      Delete

                    </button>

                  </div>

                )}

              </div>

            )}

          </div>

        ))}

      </div>



      {/* CONVERSATION HISTORY */}

      <div className="
        rounded-2xl
        border
        border-ink-700
        bg-ink-900/60
        p-6
      ">

        <h2 className="text-xl font-bold">

          💬 Conversation History

        </h2>


        {conversations.length === 0 ? (

          <p className={
            "mt-4 " +
            (conversationsError ? "text-red-400" : "text-slate-400")
          }>

            {conversationsError || "No conversations yet."}

          </p>

        ) : (

          conversations.map(
            (conversation) => (

              <div

                key={conversation.id}

                className="
                  mt-5
                  space-y-2
                "

              >

                <div className="
                  bg-ink-800
                  rounded-lg
                  p-4
                ">

                  <strong>
                    Customer
                  </strong>

                  <p>
                    {conversation.message}
                  </p>

                </div>


                {conversation.response && (

                  <div className="
                    bg-brand-600/15
                    rounded-lg
                    p-4
                  ">

                    <strong>
                      Atlas
                    </strong>

                    <p>
                      {conversation.response}
                    </p>

                  </div>

                )}

              </div>

            )
          )

        )}

      </div>


    </div>

  );

}


export default CustomerProfile;