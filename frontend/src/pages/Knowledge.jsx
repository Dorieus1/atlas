import { useRef, useState } from "react";
import { BookOpen, Upload, Download, X } from "lucide-react";
import { importKnowledgeCsv, getKnowledge } from "../api/atlasApi";
import { downloadCSV } from "../utils/csv";
import KnowledgePanel from "../components/dashboard/KnowledgePanel";
import KnowledgeEditor from "../components/dashboard/KnowledgeEditor";
import KnowledgeGapsPanel from "../components/dashboard/KnowledgeGapsPanel";


function Knowledge() {

  // KnowledgePanel manages its own fetching with no refresh hook exposed,
  // so approving a suggestion (which saves a real entry behind the
  // scenes) wouldn't otherwise show up in the visible list without a
  // manual page reload. Bumping this key forces a clean remount instead.
  const [knowledgeListKey, setKnowledgeListKey] = useState(0);

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  // Customers, Leads, and Quotes all offer an Export CSV button - the
  // Knowledge Base had an Import but no matching way out, which was the
  // one list in the app you couldn't get your own data back out of
  // without asking support for a database dump.
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState("");

  const runExport = async () => {

    setExportingCsv(true);
    setExportError("");

    try {

      const business_id = localStorage.getItem("business_id");
      const data = await getKnowledge(business_id);

      downloadCSV(
        "knowledge-base.csv",
        [
          { key: "title", label: "Title" },
          { key: "content", label: "Content" },
          { key: "category", label: "Category" }
        ],
        data
      );

    } catch (error) {

      console.error("KNOWLEDGE EXPORT ERROR:", error);
      setExportError("Couldn't export your knowledge base. Please try again.");

    } finally {

      setExportingCsv(false);

    }

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

      const result = await importKnowledgeCsv(importFile);

      setImportResult(result);
      setImportFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setKnowledgeListKey((k) => k + 1);

    } catch (error) {

      console.error("KNOWLEDGE IMPORT ERROR:", error);
      setImportError(error.message || "Import failed. Please try again.");

    } finally {

      setImporting(false);

    }

  };

  return (

    <div className="p-8">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>

          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen size={28} />
            Knowledge Base
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            What Atlas knows about your business.
          </p>

        </div>

        <div className="flex items-center gap-2">

          <button
            onClick={runExport}
            disabled={exportingCsv}
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm hover:bg-ink-700 disabled:opacity-50"
          >
            <Download size={16} /> {exportingCsv ? "Exporting..." : "Export CSV"}
          </button>

          <button
            onClick={openImport}
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm hover:bg-ink-700"
          >
            <Upload size={16} /> Import CSV
          </button>

        </div>

      </div>

      {exportError && (
        <p className="mt-4 text-sm text-red-400">
          {exportError}
        </p>
      )}

      <div className="mt-6">
        <KnowledgeGapsPanel onApproved={() => setKnowledgeListKey((k) => k + 1)} />
      </div>

      <KnowledgePanel key={knowledgeListKey} />

      <KnowledgeEditor onSaved={() => setKnowledgeListKey((k) => k + 1)} />

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
                Import Knowledge from CSV
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
              "Title" (or "Question"/"Name"), "Content" (or "Answer"/
              "Body"), and optionally "Category" (or "Group"/"Section").
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
                  {importResult.created} entr{importResult.created === 1 ? "y" : "ies"} created
                </p>

                <p className="text-amber-400">
                  {importResult.skipped_missing_fields.length} skipped for missing a title or content
                </p>

                <p className="text-amber-400">
                  {importResult.skipped_too_long.length} skipped for being too long
                </p>

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
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
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

export default Knowledge;
