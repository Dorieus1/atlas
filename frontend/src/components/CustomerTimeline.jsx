import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  History,
  UserPlus,
  StickyNote,
  CalendarClock,
  FileText,
  Camera,
  MessageSquare,
  Mail,
  Pencil,
  Trash2
} from "lucide-react";

import {
  getCustomerTimeline,
  createNote,
  updateNote,
  deleteNote,
  API_BASE
} from "../api/atlasApi";


function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

// Schedule.jsx's own day lookup (toDateKey) buckets appointments by
// LOCAL calendar date, not UTC - linking to a day here has to agree
// with that, or an evening appointment (whose stored UTC start_time can
// already be on the next calendar day for any timezone behind UTC)
// would land the owner on the wrong day. event.date.slice(0, 10) would
// read the UTC date instead.
function toLocalDateKey(dateString) {

  const d = new Date(dateString);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;

}

const APPOINTMENT_STATUS_STYLES = {
  scheduled: "bg-accent-text/20 text-accent-text",
  completed: "bg-success/20 text-success",
  cancelled: "bg-slate-500/20 text-fg-muted"
};

const QUOTE_STATUS_STYLES = {
  draft: "bg-slate-500/20 text-fg-muted",
  sent: "bg-accent-text/20 text-accent-text",
  accepted: "bg-success/20 text-success",
  declined: "bg-danger/20 text-danger",
  paid: "bg-success/20 text-success"
};


// Replaces what used to be a separate Appointment History card and a
// separate Notes card (plus no visibility into quotes, photos, or
// review requests at all) with one chronological story of the
// relationship - matching how leading CRMs structure a contact page,
// and directly addressing the audit finding that the profile felt like
// a pile of disconnected cards rather than a timeline. Appointments and
// quotes stay read-only here (they're managed on the Schedule/Quotes
// pages, which this links out to); notes are the one event type that's
// actually authored here, so add/edit/delete lives inline.
// onNoteChange is optional - CustomerProfile passes its own loadSummary
// through it, since the AI Customer Summary is generated from the same
// notes this component owns. Without it, adding/editing/deleting a note
// left the summary panel showing a stale summary from before the edit
// until the whole page was refreshed - a real bug found during review.
function CustomerTimeline({ customerId, onNoteChange }) {

  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [newNote, setNewNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [confirmingDeleteNoteId, setConfirmingDeleteNoteId] = useState(null);


  const loadTimeline = async () => {

    try {

      const data = await getCustomerTimeline(customerId);
      setEvents(data);
      setLoadError("");

    } catch (err) {

      console.error("TIMELINE LOAD ERROR:", err);
      setLoadError("Couldn't load this customer's activity. Please refresh to try again.");

    } finally {

      setLoading(false);

    }

  };


  useEffect(() => {

    setEvents([]);
    setLoading(true);
    setLoadError("");

    loadTimeline();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);


  const handleAddNote = async () => {

    if (!newNote.trim()) {

      setNoteError("Note cannot be empty.");
      return;

    }

    setAddingNote(true);
    setNoteError("");

    try {

      await createNote(customerId, newNote.trim());
      setNewNote("");
      await loadTimeline();
      onNoteChange?.();

    } catch (err) {

      console.error("NOTE CREATE ERROR:", err);
      setNoteError("Failed to add note. Please try again.");

    } finally {

      setAddingNote(false);

    }

  };


  const startEditNote = (event) => {

    setEditingNoteId(event.id);
    setEditNoteText(event.note);
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
      await loadTimeline();
      onNoteChange?.();

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
      await loadTimeline();
      onNoteChange?.();

    } catch (err) {

      console.error("NOTE DELETE ERROR:", err);
      setNoteError("Failed to delete note. Please try again.");

    }

  };


  const iconFor = (type) => {

    switch (type) {
      case "customer_created": return UserPlus;
      case "note": return StickyNote;
      case "appointment": return CalendarClock;
      case "quote": return FileText;
      case "photo": return Camera;
      case "review_request": return MessageSquare;
      case "owner_message": return Mail;
      default: return History;
    }

  };


  const renderEventContent = (event) => {

    switch (event.type) {

      case "customer_created":

        return (
          <p className="text-sm text-fg-muted">
            Customer added{event.createdByName ? ` by ${event.createdByName}` : ""}
          </p>
        );

      case "note":

        if (editingNoteId === event.id) {

          return (
            <div>

              <textarea
                value={editNoteText}
                onChange={(e) => setEditNoteText(e.target.value)}
                className="w-full bg-surface text-fg border border-border rounded-lg p-2 text-sm"
              />

              <div className="flex gap-2 mt-2">

                <button
                  onClick={() => saveEditNote(event.id)}
                  className="bg-brand-600 hover:bg-brand-500 px-3 py-1 rounded-lg text-xs"
                >
                  Save
                </button>

                <button
                  onClick={cancelEditNote}
                  className="bg-border hover:bg-border-strong px-3 py-1 rounded-lg text-xs"
                >
                  Cancel
                </button>

              </div>

            </div>
          );

        }

        return (
          <div className="flex items-start justify-between gap-3">

            <p className="text-sm text-fg-muted">{event.note}</p>

            {confirmingDeleteNoteId === event.id ? (

              <div className="flex gap-2 shrink-0">

                <button
                  onClick={() => handleDeleteNote(event.id)}
                  className="text-danger hover:opacity-80 text-xs font-medium"
                >
                  Confirm
                </button>

                <button
                  onClick={() => setConfirmingDeleteNoteId(null)}
                  className="text-fg-muted hover:text-fg text-xs"
                >
                  Cancel
                </button>

              </div>

            ) : (

              <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition">

                <button
                  onClick={() => startEditNote(event)}
                  className="text-fg-muted hover:text-fg"
                  aria-label="Edit note"
                >
                  <Pencil size={13} />
                </button>

                <button
                  onClick={() => setConfirmingDeleteNoteId(event.id)}
                  className="text-fg-muted hover:text-danger"
                  aria-label="Delete note"
                >
                  <Trash2 size={13} />
                </button>

              </div>

            )}

          </div>
        );

      case "appointment":

        return (
          <button
            onClick={() => navigate(`/schedule?date=${toLocalDateKey(event.date)}`)}
            className="text-left group/link"
          >

            <p className="text-sm text-fg-muted group-hover/link:text-fg">
              {event.title}
            </p>

            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${APPOINTMENT_STATUS_STYLES[event.status] || APPOINTMENT_STATUS_STYLES.scheduled}`}>
              {event.status}
            </span>

          </button>
        );

      case "quote":

        return (
          <button
            onClick={() => navigate(`/quotes?open=${event.id}`)}
            className="text-left group/link"
          >

            <p className="text-sm text-fg-muted group-hover/link:text-fg">
              {event.quoteType === "invoice" ? "Invoice" : "Quote"}
              {event.quoteNumberFormatted ? ` ${event.quoteNumberFormatted}` : ""}
              {" — "}
              {formatMoney(event.total)}
            </p>

            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${QUOTE_STATUS_STYLES[event.status] || QUOTE_STATUS_STYLES.draft}`}>
              {event.status}
            </span>

          </button>
        );

      case "photo":

        return (
          <div className="flex items-center gap-3">

            <img
              src={`${API_BASE}${event.photoUrl}`}
              alt={event.caption || "Customer photo"}
              className="h-12 w-12 rounded-lg object-cover border border-border"
            />

            <p className="text-sm text-fg-muted">
              {event.caption || "Photo added"}
            </p>

          </div>
        );

      case "review_request":

        return (
          <p className="text-sm text-fg-muted">
            Review request sent{event.sentTo ? ` to ${event.sentTo}` : ""}
          </p>
        );

      case "owner_message":

        return (
          <div>

            <p className="text-sm font-semibold">
              You emailed: {event.subject}
              {event.sentByName ? ` (${event.sentByName})` : ""}
            </p>

            <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">
              {event.body}
            </p>

          </div>
        );

      default:

        return null;

    }

  };


  return (

    <div className="rounded-2xl border border-border bg-surface/60 p-6">

      <h2 className="text-xl font-bold flex items-center gap-2">
        <History size={20} />
        Activity Timeline
      </h2>

      {noteError && (
        <p className="mt-3 text-sm text-danger">{noteError}</p>
      )}

      <div className="mt-4 flex gap-3">

        <input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onKeyDown={(e) => {

            if (e.key === "Enter") {
              handleAddNote();
            }

          }}
          placeholder="Add a note..."
          className="flex-1 bg-surface/60 border border-border rounded-lg p-3 text-fg placeholder:text-fg-faint"
        />

        <button
          onClick={handleAddNote}
          disabled={addingNote}
          className="bg-brand-600 hover:bg-brand-500 px-5 rounded-lg disabled:opacity-50"
        >
          {addingNote ? "Adding..." : "Add"}
        </button>

      </div>

      {loading ? (

        <p className="mt-6 text-sm text-fg-faint">Loading activity...</p>

      ) : loadError ? (

        <p className="mt-6 text-sm text-danger">{loadError}</p>

      ) : events.length === 0 ? (

        <p className="mt-6 text-sm text-fg-muted">No activity yet.</p>

      ) : (

        <div className="mt-6 space-y-5">

          {events.map((event, index) => {

            const Icon = iconFor(event.type);

            return (

              <div key={`${event.type}-${event.id}`} className="group flex gap-4">

                <div className="flex flex-col items-center">

                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-fg-muted">
                    <Icon size={14} />
                  </div>

                  {index < events.length - 1 && (
                    <div className="mt-1 w-1 flex-1 rounded-full bg-border-strong" />
                  )}

                </div>

                <div className="flex-1 pb-1">

                  <p className="text-xs text-fg-faint">{formatDate(event.date)}</p>

                  <div className="mt-1">
                    {renderEventContent(event)}
                  </div>

                </div>

              </div>

            );

          })}

        </div>

      )}

    </div>

  );

}

export default CustomerTimeline;
