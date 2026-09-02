import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Trash2, User, Tag, MessageSquare, Brain, Flame, DollarSign, MapPin, FileText } from "lucide-react";

import {
  getCustomer,
  getCustomerSummary,
  getCustomerLead,
  updateLeadStatus,
  getBusinesses,
  deleteCustomer,
  restoreCustomer,
  updateCustomerInfo,
  getTags,
  createTag,
  addCustomerTag,
  removeCustomerTag,
  getCustomerQuotes,
  downloadCustomerStatementPdf
} from "../api/atlasApi";

import ChatWindow from "../components/ChatWindow";
import CustomerTimeline from "../components/CustomerTimeline";
import ServiceAgreements from "../components/ServiceAgreements";
import MemoryPanel from "../components/MemoryPanel";
import PhotoGallery from "../components/PhotoGallery";
import ReviewRequestPanel from "../components/ReviewRequestPanel";
import Skeleton, { SkeletonText } from "../components/Skeleton";


function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount || 0);
}


function CustomerProfile() {

  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [business, setBusiness] = useState(null);
  const [summary, setSummary] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [lead, setLead] = useState(null);
  const [leadError, setLeadError] = useState("");
  const [quoteStats, setQuoteStats] = useState(null);
  const [quoteStatsError, setQuoteStatsError] = useState("");
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const [statementError, setStatementError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerEmail, setEditCustomerEmail] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editCustomerAddress, setEditCustomerAddress] = useState("");
  const [customerEditError, setCustomerEditError] = useState("");
  const [savingCustomerEdit, setSavingCustomerEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [allTags, setAllTags] = useState([]);
  const [tagsError, setTagsError] = useState("");
  const [selectedTagToAdd, setSelectedTagToAdd] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [removingTagId, setRemovingTagId] = useState(null);
  const [newTagName, setNewTagName] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);


  useEffect(() => {

    setCustomer(null);
    setLoadingCustomer(true);
    setLoadError("");
    setSummary("");
    setSummaryError("");
    setLead(null);
    setLeadError("");
    setQuoteStats(null);
    setQuoteStatsError("");

    loadCustomer();
    loadSummary();
    loadLead();
    loadQuoteStats();

  }, [id]);



  useEffect(() => {

    loadAllTags();

  }, []);



  const loadCustomer = async () => {

  try {

    const data = await getCustomer(id);

    // A defensive check, not the primary fix: this route id is expected
    // to always resolve to a single customer object with a real id. If
    // it ever doesn't (a malformed response, or some other route/id
    // colliding with a backend path the way "/customers/trash" once
    // did), treat it as "not found" instead of rendering a customer
    // profile shell around garbage data.
    if (!data || typeof data !== "object" || Array.isArray(data) || !data.id) {

      setLoadError("This customer doesn't exist, or may have been deleted.");
      return;

    }

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



  // A quick "how much has this customer actually been worth" summary -
  // paid invoices only, matching the definition of real revenue already
  // used everywhere else (analyticsService.getAnalytics, Analytics.jsx),
  // not sent/draft amounts that were never actually collected.
  const loadQuoteStats = async () => {

    try {

      const quotes = await getCustomerQuotes(id);

      const paidInvoices = quotes.filter((q) => q.type === "invoice" && q.status === "paid");
      const outstandingInvoices = quotes.filter((q) => q.type === "invoice" && ["sent", "accepted"].includes(q.status));

      setQuoteStats({

        totalRevenue: paidInvoices.reduce((sum, q) => sum + q.total, 0),
        totalOutstanding: outstandingInvoices.reduce((sum, q) => sum + q.total, 0),
        jobsCompleted: paidInvoices.length

      });

      setQuoteStatsError("");

    } catch (err) {

      console.error("QUOTE STATS LOAD ERROR:", err);
      setQuoteStatsError("Couldn't load this customer's job history. Please refresh to try again.");

    }

  };


  const handleDownloadStatement = async () => {

    setDownloadingStatement(true);
    setStatementError("");

    try {

      await downloadCustomerStatementPdf(id);

    } catch (err) {

      console.error("DOWNLOAD STATEMENT ERROR:", err);
      setStatementError("Couldn't download the statement. Please try again.");

    } finally {

      setDownloadingStatement(false);

    }

  };



  const loadAllTags = async () => {

    try {

      const data = await getTags();
      setAllTags(data);

    } catch (err) {

      console.error("TAGS LOAD ERROR:", err);

    }

  };



  const handleAddTag = async () => {

    if (!selectedTagToAdd) {
      return;
    }

    setAddingTag(true);
    setTagsError("");

    try {

      const result = await addCustomerTag(id, selectedTagToAdd);
      setCustomer((prev) => ({ ...prev, tags: result.tags }));
      setSelectedTagToAdd("");

    } catch (err) {

      console.error("ADD CUSTOMER TAG ERROR:", err);
      setTagsError("Couldn't add that tag. Please try again.");

    } finally {

      setAddingTag(false);

    }

  };



  const handleRemoveTag = async (tagId) => {

    setRemovingTagId(tagId);
    setTagsError("");

    try {

      const result = await removeCustomerTag(id, tagId);
      setCustomer((prev) => ({ ...prev, tags: result.tags }));

    } catch (err) {

      console.error("REMOVE CUSTOMER TAG ERROR:", err);
      setTagsError("Couldn't remove that tag. Please try again.");

    } finally {

      setRemovingTagId(null);

    }

  };



  const handleCreateAndAssignTag = async () => {

    if (!newTagName.trim()) {

      setTagsError("Tag name is required.");
      return;

    }

    setCreatingTag(true);
    setTagsError("");

    try {

      const created = await createTag(newTagName.trim());
      const result = await addCustomerTag(id, created.id);
      setCustomer((prev) => ({ ...prev, tags: result.tags }));
      setNewTagName("");
      await loadAllTags();

    } catch (err) {

      console.error("CREATE TAG ERROR:", err);
      setTagsError(err.message || "Couldn't create that tag. Please try again.");

    } finally {

      setCreatingTag(false);

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



  const handleRestoreCustomer = async () => {

    setRestoring(true);

    setRestoreError("");

    try {

      await restoreCustomer(id);

      setCustomer({ ...customer, deleted_at: null });

    } catch (err) {

      console.error(
        "CUSTOMER RESTORE ERROR:",
        err
      );

      setRestoreError("Failed to restore customer. Please try again.");

    } finally {

      setRestoring(false);

    }

  };



  const startEditCustomer = () => {

    setEditCustomerName(customer.name || "");
    setEditCustomerEmail(customer.email || "");
    setEditCustomerPhone(customer.phone || "");
    setEditCustomerAddress(customer.address || "");
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
        editCustomerPhone.trim(),
        editCustomerAddress.trim()
      );

      setCustomer({

        ...customer,
        name: editCustomerName.trim(),
        email: editCustomerEmail.trim(),
        phone: editCustomerPhone.trim(),
        address: editCustomerAddress.trim()

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

        <div className="p-8">

          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-32" />

          <div className="mt-6 flex flex-col gap-4">

            {[0, 1, 2].map((i) => (

              <div key={i} className="rounded-2xl border border-border bg-surface/60 p-6">
                <Skeleton className="h-5 w-40" />
                <SkeletonText lines={2} className="mt-4" />
              </div>

            ))}

          </div>

        </div>

      );

    }

    return (

      <div className="p-8 text-center">

        <p className="text-fg-muted">

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



  const customerTags = customer.tags || [];

  const availableTagsToAdd = allTags.filter(
    (tag) => !customerTags.some((customerTag) => customerTag.id === tag.id)
  );



  return (

    <div className="p-8 space-y-8">


      {customer.deleted_at && (

        <div className="
          flex
          flex-wrap
          items-center
          justify-between
          gap-3
          bg-amber-500/10
          border
          border-amber-500/40
          rounded-xl
          p-4
        ">

          <p className="text-amber-300 text-sm flex items-start gap-2">

            <Trash2 size={16} className="mt-0.5 shrink-0" />
            This customer is in the trash. They'll be permanently deleted 30 days after being moved here, unless restored.

          </p>

          <div className="flex items-center gap-3">

            <button

              onClick={handleRestoreCustomer}

              disabled={restoring}

              className="bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-lg text-sm disabled:opacity-50"

            >

              {restoring ? "Restoring..." : "Restore Customer"}

            </button>

          </div>

        </div>

      )}

      {restoreError && (

        <p className="text-danger text-sm">

          {restoreError}

        </p>

      )}


      {/* CUSTOMER HEADER */}

      <div className="flex flex-wrap items-start justify-between gap-3">

        <div>

          {editingCustomer ? (

            <div className="space-y-2">

              {customerEditError && (

                <p className="text-danger text-sm">{customerEditError}</p>

              )}

              <input

                value={editCustomerName}

                onChange={(e) => setEditCustomerName(e.target.value)}

                placeholder="Customer name"

                className="bg-surface-muted text-fg border border-border rounded-lg p-2"

              />

              <input

                value={editCustomerEmail}

                onChange={(e) => setEditCustomerEmail(e.target.value)}

                placeholder="Customer email"

                className="bg-surface-muted text-fg border border-border rounded-lg p-2 ml-2"

              />

              <input

                value={editCustomerPhone}

                onChange={(e) => setEditCustomerPhone(e.target.value)}

                placeholder="Customer phone"

                className="bg-surface-muted text-fg border border-border rounded-lg p-2 ml-2"

              />

              <input

                value={editCustomerAddress}

                onChange={(e) => setEditCustomerAddress(e.target.value)}

                placeholder="Service address"

                className="mt-2 block w-full max-w-md bg-surface-muted text-fg border border-border rounded-lg p-2"

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

                  className="bg-border hover:bg-border-strong px-4 py-2 rounded-lg"

                >

                  Cancel

                </button>

              </div>

            </div>

          ) : (

            <>

              <h1 className="text-3xl font-bold flex items-center gap-2">

                <User size={28} />
                {customer.name}

                <button

                  onClick={startEditCustomer}

                  className="ml-3 text-sm text-fg-muted hover:text-fg font-normal"

                >

                  Edit

                </button>

              </h1>

              <p className="text-fg-muted">

                {customer.email}

              </p>

              {customer.phone && (

                <p className="text-fg-muted">

                  {customer.phone}

                </p>

              )}

              {customer.address && (

                <p className="mt-1 flex items-center gap-1.5 text-fg-muted">

                  <MapPin size={14} className="shrink-0" />
                  {customer.address}

                </p>

              )}

              {customer.created_by_name && (

                <p className="mt-1 text-xs text-fg-faint">

                  Added by {customer.created_by_name}

                </p>

              )}

            </>

          )}

        </div>

        <div>

          {customer.deleted_at ? null : confirmingDelete ? (

            <div className="flex flex-wrap items-center gap-3">

              <span className="text-fg-muted text-sm">

                Move this customer to trash? They'll be permanently deleted after 30 days, and can be restored any time before then.

              </span>

              <button

                onClick={handleDeleteCustomer}

                disabled={deleting}

                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg disabled:opacity-50"

              >

                {deleting ? "Moving to trash..." : "Move to Trash"}

              </button>

              <button

                onClick={() => setConfirmingDelete(false)}

                disabled={deleting}

                className="bg-border hover:bg-border-strong px-4 py-2 rounded-lg"

              >

                Cancel

              </button>

            </div>

          ) : (

            <button

              onClick={() => setConfirmingDelete(true)}

              className="bg-danger/20 text-danger hover:bg-danger/30 px-4 py-2 rounded-lg"

            >

              Move to Trash

            </button>

          )}

          {deleteError && (

            <p className="text-danger text-sm mt-2">

              {deleteError}

            </p>

          )}

        </div>

      </div>



      {/* CUSTOMER VALUE */}

      {quoteStatsError ? (

        <p className="mt-6 text-sm text-danger">{quoteStatsError}</p>

      ) : quoteStats && (quoteStats.jobsCompleted > 0 || quoteStats.totalOutstanding > 0) && (

        <div className="
          mt-6
          rounded-2xl
          border
          border-border
          bg-surface/60
          p-6
        ">

          <div className="flex items-center justify-between gap-3">

            <h2 className="text-xl font-bold flex items-center gap-2">
              <DollarSign size={20} />
              Customer Value
            </h2>

            <button
              onClick={handleDownloadStatement}
              disabled={downloadingStatement}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-surface-muted hover:text-fg disabled:opacity-50"
            >
              <FileText size={13} />
              {downloadingStatement ? "Downloading..." : "Download Statement"}
            </button>

          </div>

          {statementError && (
            <p className="mt-2 text-xs text-danger">{statementError}</p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-4 text-center">

            <div>
              <p className="text-2xl font-bold">{formatMoney(quoteStats.totalRevenue)}</p>
              <p className="mt-1 text-xs text-fg-faint">Total Paid</p>
            </div>

            <div>
              <p className="text-2xl font-bold">{formatMoney(quoteStats.totalOutstanding)}</p>
              <p className="mt-1 text-xs text-fg-faint">Outstanding</p>
            </div>

            <div>
              <p className="text-2xl font-bold">{quoteStats.jobsCompleted}</p>
              <p className="mt-1 text-xs text-fg-faint">Jobs Completed</p>
            </div>

          </div>

        </div>

      )}



      {/* TAGS */}

      <div className="
        rounded-2xl
        border
        border-border
        bg-surface/60
        p-6
      ">

        <h2 className="text-xl font-bold flex items-center gap-2">
          <Tag size={20} />
          Tags
        </h2>

        {tagsError && (
          <p className="mt-3 text-danger">
            {tagsError}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">

          {customerTags.length === 0 ? (

            <p className="text-sm text-fg-muted">
              No tags yet.
            </p>

          ) : (

            customerTags.map((tag) => (

              <span
                key={tag.id}
                className="flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-sm"
              >

                {tag.name}

                <button
                  onClick={() => handleRemoveTag(tag.id)}
                  disabled={removingTagId === tag.id}
                  className="text-fg-faint hover:text-danger disabled:opacity-50"
                  aria-label={`Remove ${tag.name} tag`}
                >
                  ×
                </button>

              </span>

            ))

          )}

        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">

          <select
            value={selectedTagToAdd}
            onChange={(e) => setSelectedTagToAdd(e.target.value)}
            className="bg-surface-muted border border-border rounded-lg p-2 text-sm text-fg"
          >
            <option value="">Add existing tag...</option>
            {availableTagsToAdd.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleAddTag}
            disabled={!selectedTagToAdd || addingTag}
            className="bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {addingTag ? "Adding..." : "Add"}
          </button>

        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">

          <input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Or create a new tag..."
            className="bg-surface/60 border border-border rounded-lg p-2 text-sm text-fg placeholder:text-fg-faint"
          />

          <button
            onClick={handleCreateAndAssignTag}
            disabled={creatingTag}
            className="bg-border hover:bg-border-strong px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {creatingTag ? "Creating..." : "Create & Add"}
          </button>

        </div>

      </div>


      <ServiceAgreements customerId={id} />


      <CustomerTimeline customerId={id} onNoteChange={loadSummary} />



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
          border-border
          bg-surface/60
          p-6
        ">

          <h2 className="text-xl font-bold flex items-center gap-2">

            <MessageSquare size={20} />
            Atlas Chat

          </h2>

          <p className="
            mt-3
            text-fg-muted
          ">

            Loading business information...

          </p>

        </div>

      )}


      <MemoryPanel customer={customer} />


      <div className="mt-6">
        <PhotoGallery customerId={id} />
      </div>


      <div className="mt-6">
        <ReviewRequestPanel customerId={id} />
      </div>



      {/* AI CUSTOMER SUMMARY */}

      <div className="
        rounded-2xl
        border
        border-border
        bg-surface/60
        p-6
      ">

        <h2 className="text-xl font-bold flex items-center gap-2">

          <Brain size={20} />
          AI Customer Summary

        </h2>

        {summaryError ? (

          <p className="mt-4 whitespace-pre-wrap text-danger">
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
        border-border
        bg-surface/60
        p-6
      ">

        <h2 className="text-xl font-bold flex items-center gap-2">

          <Flame size={20} />
          Lead Information

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
                bg-surface-muted
                border
                border-border
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
            (leadError ? "text-danger" : "text-fg-muted")
          }>

            {leadError || "No lead found."}

          </p>

        )}

      </div>



    </div>

  );

}


export default CustomerProfile;