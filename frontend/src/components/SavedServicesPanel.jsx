import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Wrench } from "lucide-react";
import {
  getSavedLineItems,
  createSavedLineItem,
  updateSavedLineItem,
  deleteSavedLineItem
} from "../api/atlasApi";

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}

// A business-level catalog of frequently-used services (description +
// default price) that the quote builder can quick-add from, so the same
// "Roof inspection - $150" line doesn't have to be retyped every quote.
// Editing or deleting an entry here never touches quotes built from it
// earlier - quick-add just copies the values into a fresh line item.
function SavedServicesPanel() {

  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState("");

  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);

  const [editingId, setEditingId] = useState(null);
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editError, setEditError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const savingRef = useRef(null);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const deletingRef = useRef(null);

  const loadItems = async () => {

    try {

      const data = await getSavedLineItems();
      setItems(data);
      setLoadError("");

    } catch (err) {

      console.error("SAVED LINE ITEMS LOAD ERROR:", err);
      setLoadError("Couldn't load your saved services. Please refresh to try again.");

    }

  };

  useEffect(() => {

    loadItems();

  }, []);

  const handleAdd = async () => {

    if (!newDescription.trim()) {

      setAddError("Description is required.");
      return;

    }

    const price = Number(newPrice);

    if (!Number.isFinite(price) || price < 0) {

      setAddError("Enter a valid, non-negative price.");
      return;

    }

    if (addingRef.current) {
      return;
    }

    addingRef.current = true;
    setAdding(true);
    setAddError("");

    try {

      await createSavedLineItem(newDescription.trim(), price);
      setNewDescription("");
      setNewPrice("");
      await loadItems();

    } catch (err) {

      console.error("CREATE SAVED LINE ITEM ERROR:", err);
      setAddError(err.message || "Couldn't save that service. Please try again.");

    } finally {

      addingRef.current = false;
      setAdding(false);

    }

  };

  const startEdit = (item) => {

    setEditingId(item.id);
    setEditDescription(item.description);
    setEditPrice(String(item.unit_price));
    setConfirmingDeleteId(null);
    setEditError("");

  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id) => {

    if (!editDescription.trim()) {

      setEditError("Description is required.");
      return;

    }

    const price = Number(editPrice);

    if (!Number.isFinite(price) || price < 0) {

      setEditError("Enter a valid, non-negative price.");
      return;

    }

    if (savingRef.current) {
      return;
    }

    savingRef.current = id;
    setSavingId(id);

    try {

      await updateSavedLineItem(id, editDescription.trim(), price);
      setEditingId(null);
      setEditError("");
      await loadItems();

    } catch (err) {

      console.error("UPDATE SAVED LINE ITEM ERROR:", err);
      setEditError(err.message || "Couldn't update that service. Please try again.");

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

      await deleteSavedLineItem(id);
      setConfirmingDeleteId(null);
      await loadItems();

    } catch (err) {

      console.error("DELETE SAVED LINE ITEM ERROR:", err);
      setLoadError("Couldn't delete that service. Please try again.");

    } finally {

      deletingRef.current = null;
      setDeletingId(null);

    }

  };

  return (

    <div className="bg-ink-900/60 border border-ink-700 rounded-2xl p-6 mt-6">

      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Wrench size={22} />
        Saved Services
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Save your go-to services with a default price so you can quick-add them while building a quote or invoice.
      </p>

      {loadError && (
        <p className="mt-3 text-red-400">
          {loadError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-2">

        <input
          placeholder="Description (e.g. Roof inspection)"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-ink-700 bg-ink-800 p-2.5 text-sm text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
        />

        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Price"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          className="w-28 rounded-lg border border-ink-700 bg-ink-800 p-2.5 text-sm text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
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
        <p className="mt-2 text-sm text-red-400">
          {addError}
        </p>
      )}

      {items.length > 0 && (

        <div className="mt-4 flex flex-col divide-y divide-ink-800 rounded-xl border border-ink-700">

          {items.map((item) => (

            <div key={item.id} className="p-3">

              {editingId === item.id ? (

                <div className="flex flex-wrap items-start gap-2">

                  <input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="min-w-[220px] flex-1 rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm text-white focus:border-ink-600 focus:outline-none"
                  />

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-28 rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm text-white focus:border-ink-600 focus:outline-none"
                  />

                  <button
                    onClick={() => saveEdit(item.id)}
                    disabled={savingId === item.id}
                    className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-500 disabled:opacity-50"
                  >
                    {savingId === item.id ? "Saving..." : "Save"}
                  </button>

                  <button
                    onClick={cancelEdit}
                    className="rounded-lg bg-ink-700 px-3 py-2 text-sm font-medium transition hover:bg-ink-600"
                  >
                    Cancel
                  </button>

                  {editError && (
                    <p className="w-full text-sm text-red-400">
                      {editError}
                    </p>
                  )}

                </div>

              ) : (

                <div className="flex items-center justify-between gap-3">

                  <div className="min-w-0">
                    <p className="truncate text-sm">{item.description}</p>
                    <p className="text-xs text-slate-500">{formatMoney(item.unit_price)}</p>
                  </div>

                  {confirmingDeleteId === item.id ? (

                    <div className="flex shrink-0 items-center gap-2">

                      <span className="text-xs text-slate-400">Delete this?</span>

                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium transition hover:bg-red-500 disabled:opacity-50"
                      >
                        {deletingId === item.id ? "Deleting..." : "Confirm"}
                      </button>

                      <button
                        onClick={() => setConfirmingDeleteId(null)}
                        disabled={deletingId === item.id}
                        className="rounded-lg bg-ink-700 px-3 py-1.5 text-sm font-medium transition hover:bg-ink-600 disabled:opacity-50"
                      >
                        Cancel
                      </button>

                    </div>

                  ) : (

                    <div className="flex shrink-0 items-center gap-3">

                      <button
                        onClick={() => startEdit(item)}
                        className="text-sm text-slate-400 transition hover:text-white"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => setConfirmingDeleteId(item.id)}
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                        aria-label="Delete saved service"
                      >
                        <Trash2 size={15} />
                      </button>

                    </div>

                  )}

                </div>

              )}

            </div>

          ))}

        </div>

      )}

    </div>

  );

}

export default SavedServicesPanel;
