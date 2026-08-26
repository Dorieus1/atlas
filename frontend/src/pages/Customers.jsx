import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Users, X, Upload, Trash2, Download } from "lucide-react";
import {
  getCustomers,
  getTags,
  importCustomersCsv,
  getTrashedCustomers,
  restoreCustomer
} from "../api/atlasApi";
import CustomerForm from "../components/CustomerForm";
import EmptyState from "../components/EmptyState";
import { downloadCSV } from "../utils/csv";


function Customers() {


  const [customers, setCustomers] = useState([]);

  const [search, setSearch] = useState("");

  const [loadError, setLoadError] = useState("");

  const [tags, setTags] = useState([]);

  const [tagFilter, setTagFilter] = useState("");

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState(null);

  const fileInputRef = useRef(null);

  const [trashedCustomers, setTrashedCustomers] = useState([]);

  const [trashError, setTrashError] = useState("");

  const [restoringId, setRestoringId] = useState(null);

  const restoringRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Trash is a real, addressable route (/customers/trash) rather than
  // hidden view-only state - it can be linked, bookmarked, and backed
  // out of with the browser's own back button, and it means this exact
  // path can never collide with the customer-detail route trying to
  // treat "trash" as a customer id (which used to render a broken
  // profile shell full of "couldn't load" errors instead of the actual
  // trash list).
  const showTrash = location.pathname === "/customers/trash";



  const loadCustomers = async () => {


    try {


      const data = await getCustomers();


      setCustomers(data);

      setLoadError("");


    } catch(error) {


      console.error(
        "CUSTOMER ERROR:",
        error
      );


      setLoadError("Couldn't load your customers. Please refresh to try again.");


    }


  };



  const loadTags = async () => {

    try {

      const data = await getTags();
      setTags(data);

    } catch (error) {

      console.error("TAGS LOAD ERROR:", error);

    }

  };



  const loadTrash = async () => {

    try {

      const data = await getTrashedCustomers();
      setTrashedCustomers(data);
      setTrashError("");

    } catch (error) {

      console.error("TRASH LOAD ERROR:", error);
      setTrashError("Couldn't load the trash. Please refresh to try again.");

    }

  };



  const handleRestore = async (id) => {

    if (restoringRef.current) {

      return;

    }

    restoringRef.current = id;

    setRestoringId(id);

    try {

      await restoreCustomer(id);
      await Promise.all([loadCustomers(), loadTrash()]);

    } catch (error) {

      console.error("RESTORE ERROR:", error);
      setTrashError("Failed to restore customer. Please try again.");

    } finally {

      restoringRef.current = null;
      setRestoringId(null);

    }

  };




  useEffect(() => {


    loadCustomers();
    loadTags();
    loadTrash();


  }, []);



  const query = search.trim().toLowerCase();

  const searchedCustomers = query
    ? customers.filter((customer) =>
        (customer.name || "").toLowerCase().includes(query) ||
        (customer.email || "").toLowerCase().includes(query) ||
        (customer.phone || "").toLowerCase().includes(query)
      )
    : customers;

  // Client-side, same as the search above - the full list is already
  // loaded, so there's no need for a round trip just to filter by tag.
  // The backend also supports a tag_id query param on GET /api/customers
  // independently (e.g. for a future paginated view).
  const filteredCustomers = tagFilter
    ? searchedCustomers.filter((customer) =>
        (customer.tags || []).some((tag) => tag.id === tagFilter)
      )
    : searchedCustomers;


  const exportCSV = () => {

    downloadCSV(

      "customers.csv",

      [
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "created_at", label: "Created At" }
      ],

      filteredCustomers

    );

  };


  const openImport = () => {

    setImportFile(null);
    setImportError("");
    setImportResult(null);
    setShowImport(true);

  };


  const closeImport = () => {

    if (importing) {
      return;
    }

    setShowImport(false);

  };


  const runImport = async () => {

    if (!importFile) {

      setImportError("Choose a CSV file first.");
      return;

    }

    setImporting(true);
    setImportError("");

    try {

      const result = await importCustomersCsv(importFile);

      setImportResult(result);
      setImportFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await loadCustomers();

    } catch (error) {

      console.error("CUSTOMER IMPORT ERROR:", error);

      setImportError(error.message || "Import failed. Please try again.");

    } finally {

      setImporting(false);

    }

  };


  return (

    <div className="p-8">


      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>

          <h1 className="
            text-3xl
            font-bold
            flex
            items-center
            gap-2
          ">

            {showTrash ? (<><Trash2 size={28} /> Trash</>) : (<><Users size={28} /> Customers</>)}

          </h1>

          <p className="mt-1 text-sm text-slate-500">
            {showTrash
              ? "Customers deleted in the last 30 days. Restore one to bring it back."
              : "Every customer in one place."}
          </p>

        </div>

        <div className="flex flex-wrap gap-3">

          <button

            onClick={() => navigate(showTrash ? "/customers" : "/customers/trash")}

            className="
              flex
              items-center
              gap-1.5
              bg-ink-800
              hover:bg-ink-700
              border
              border-ink-700
              px-4
              py-2
              rounded-lg
              text-sm
            "

          >

            <Trash2 size={16} />

            {showTrash ? "Back to Customers" : `View Trash (${trashedCustomers.length})`}

          </button>

          {!showTrash && (

            <button

              onClick={openImport}

              className="
                flex
                items-center
                gap-1.5
                bg-ink-800
                hover:bg-ink-700
                border
                border-ink-700
                px-4
                py-2
                rounded-lg
                text-sm
              "

            >

              <Upload size={16} /> Import CSV

            </button>

          )}

          {customers.length > 0 && !showTrash && (

            <button

              onClick={exportCSV}

              className="bg-ink-800 hover:bg-ink-700 border border-ink-700 px-4 py-2 rounded-lg text-sm flex items-center gap-1.5"

            >

              <Download size={16} /> Export CSV

            </button>

          )}

        </div>

      </div>


      {showTrash ? (

        <div className="mt-8">

          <p className="text-sm text-slate-500 mb-4">

            Trashed customers are permanently deleted 30 days after being moved here. Restore one to bring it back to your active customer list.

          </p>

          {trashError && (

            <p className="text-red-400">

              {trashError}

            </p>

          )}

          {trashedCustomers.length === 0 && !trashError ? (

            <EmptyState
              icon={Trash2}
              title="Trash is empty"
              description="Customers you delete show up here for 30 days before being permanently removed."
            />

          ) : (

            <div className="grid gap-4">

              {trashedCustomers.map((customer) => (

                <div

                  key={customer.id}

                  className="
                    flex
                    flex-wrap
                    items-center
                    justify-between
                    gap-3
                    border
                    border-ink-700
                    bg-ink-900/60
                    rounded-xl
                    p-5
                  "

                >

                  <div>

                    <h2 className="text-xl font-bold">

                      {customer.name}

                    </h2>

                    <p className="text-slate-300">

                      {customer.email}

                    </p>

                    <p className="mt-1 text-xs text-slate-500">

                      Deleted {new Date(customer.deleted_at).toLocaleDateString()}

                    </p>

                  </div>

                  <button

                    onClick={() => handleRestore(customer.id)}

                    disabled={restoringId === customer.id}

                    className="bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-lg text-sm disabled:opacity-50"

                  >

                    {restoringId === customer.id ? "Restoring..." : "Restore"}

                  </button>

                </div>

              ))}

            </div>

          )}

        </div>

      ) : (

      <>

      <CustomerForm

        onCustomerCreated={loadCustomers}

      />


      {customers.length > 0 && (

        <div className="mt-8 flex flex-wrap gap-3">

          <input

            value={search}

            onChange={(e) => setSearch(e.target.value)}

            placeholder="Search by name or email"

            className="
              flex-1
              min-w-[220px]
              bg-ink-900/60
              text-white
              placeholder:text-slate-500
              border
              border-ink-700
              rounded-lg
              p-3
            "

          />

          {tags.length > 0 && (

            <select

              value={tagFilter}

              onChange={(e) => setTagFilter(e.target.value)}

              className="
                bg-ink-900/60
                text-white
                border
                border-ink-700
                rounded-lg
                p-3
              "

            >

              <option value="">All tags</option>

              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}

            </select>

          )}

        </div>

      )}




      <div className="
        mt-8
        grid
        gap-4
      ">


      {loadError ? (

        <p className="text-red-400">

          {loadError}

        </p>


      ) : customers.length === 0 ? (

        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Add your first customer above to start tracking conversations and leads."
        />


      ) : filteredCustomers.length === 0 ? (

        <p className="text-slate-400">

          No customers match "{search.trim()}".

        </p>


      ) : (


        filteredCustomers.map((customer)=>(


          <button

            key={customer.id}

            onClick={()=>navigate(`/customers/${customer.id}`)}

            className="
              text-left
              border
              border-ink-700
              bg-ink-900/60
              hover:border-ink-600
              hover:bg-ink-900
              rounded-xl
              p-5
              transition
            "

          >

            <h2 className="
              text-xl
              font-bold
            ">

              {customer.name}

            </h2>



            <p className="text-slate-300">

              {customer.email}

            </p>

            {customer.phone && (

              <p className="text-slate-400">

                {customer.phone}

              </p>

            )}

            {(customer.tags || []).length > 0 && (

              <div className="mt-3 flex flex-wrap gap-1.5">

                {customer.tags.map((tag) => (

                  <span
                    key={tag.id}
                    className="rounded-full border border-ink-700 bg-ink-800 px-2.5 py-1 text-xs text-slate-300"
                  >
                    {tag.name}
                  </span>

                ))}

              </div>

            )}


          </button>


        ))


      )}


      </div>

      </>

      )}


      {showImport && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeImport}
        >

          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between">

              <h3 className="font-display text-lg font-bold">
                Import Customers from CSV
              </h3>

              <button
                onClick={closeImport}
                className="rounded-lg p-1 text-slate-400 hover:bg-ink-800 hover:text-white"
                aria-label="Close"
                disabled={importing}
              >
                <X size={18} />
              </button>

            </div>

            <p className="mt-2 text-sm text-slate-400">
              Upload a CSV with a header row. We'll match columns named
              "Name" (or "Full Name" / "Customer Name"), "Email" (or "Email
              Address"), and "Phone" (or "Phone Number" / "Mobile"). Rows
              matching an existing customer's email are skipped, not
              overwritten.
            </p>

            <div className="mt-4">

              <input

                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                disabled={importing}
                onChange={(e) => setImportFile(e.target.files[0] || null)}

                className="
                  w-full
                  text-sm
                  text-slate-300
                  file:mr-3
                  file:rounded-lg
                  file:border-0
                  file:bg-brand-600
                  file:px-3
                  file:py-2
                  file:text-sm
                  file:font-semibold
                  file:text-white
                  hover:file:bg-brand-500
                "

              />

            </div>

            {importError && (

              <p className="mt-3 text-sm text-red-400">
                {importError}
              </p>

            )}

            {importResult && (

              <div className="mt-4 space-y-2 rounded-lg border border-ink-700 bg-ink-800/60 p-4 text-sm">

                <p className="font-semibold text-white">
                  Processed {importResult.total_rows} row{importResult.total_rows === 1 ? "" : "s"}
                </p>

                <p className="text-emerald-400">
                  {importResult.created} customer{importResult.created === 1 ? "" : "s"} created
                </p>

                <p className="text-amber-400">
                  {importResult.skipped_duplicates.length} skipped as duplicate{importResult.skipped_duplicates.length === 1 ? "" : "s"}
                </p>

                {importResult.skipped_duplicates.length > 0 && (

                  <ul className="ml-4 list-disc text-slate-400">
                    {importResult.skipped_duplicates.map((dup, i) => (
                      <li key={i}>{dup.name} ({dup.email}) — row {dup.row}</li>
                    ))}
                  </ul>

                )}

                <p className="text-amber-400">
                  {importResult.skipped_missing_name.length} skipped for missing a name
                </p>

                {importResult.skipped_missing_name.length > 0 && (

                  <ul className="ml-4 list-disc text-slate-400">
                    {importResult.skipped_missing_name.map((missing, i) => (
                      <li key={i}>Row {missing.row}</li>
                    ))}
                  </ul>

                )}

              </div>

            )}

            <div className="mt-5 flex justify-end gap-2">

              <button
                onClick={closeImport}
                disabled={importing}
                className="rounded-lg border border-ink-700 px-4 py-2 text-sm hover:bg-ink-800"
              >
                {importResult ? "Close" : "Cancel"}
              </button>

              <button
                onClick={runImport}
                disabled={importing || !importFile}
                className="
                  flex
                  items-center
                  gap-2
                  rounded-lg
                  bg-brand-600
                  px-4
                  py-2
                  text-sm
                  font-semibold
                  text-white
                  hover:bg-brand-500
                  disabled:opacity-50
                "
              >
                <Upload size={15} />
                {importing ? "Importing..." : "Import"}
              </button>

            </div>

          </div>

        </div>

      )}


    </div>

  );

}


export default Customers;
