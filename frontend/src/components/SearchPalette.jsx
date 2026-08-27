import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Flame, CalendarDays, FileText, BookOpen, StickyNote, X } from "lucide-react";

import { search } from "../api/atlasApi";


const SECTIONS = [
  { key: "customers", label: "Customers", icon: Users },
  { key: "leads", label: "Leads", icon: Flame },
  { key: "appointments", label: "Appointments", icon: CalendarDays },
  { key: "quotes", label: "Quotes & Invoices", icon: FileText },
  { key: "knowledge", label: "Knowledge", icon: BookOpen },
  { key: "notes", label: "Notes", icon: StickyNote }
];

const EMPTY_RESULTS = { customers: [], leads: [], appointments: [], quotes: [], knowledge: [], notes: [] };


// A global Cmd/Ctrl+K palette so finding a customer, lead, appointment,
// or invoice never depends on first guessing which page it lives on -
// before this, only the Customers list had any search at all, and only
// within its own already-loaded rows.
function SearchPalette({ open, onClose }) {

  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);


  useEffect(() => {

    if (open) {

      setQuery("");
      setResults(EMPTY_RESULTS);

      // Focus after the modal has actually mounted, not before.
      setTimeout(() => inputRef.current?.focus(), 0);

    }

  }, [open]);


  useEffect(() => {

    if (!open) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = query.trim();

    if (trimmed.length < 2) {

      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;

    }

    setLoading(true);

    const thisRequestId = ++requestIdRef.current;

    debounceRef.current = setTimeout(() => {

      search(trimmed)
        .then((data) => {

          // Ignore a stale response that resolved after a newer
          // keystroke already fired another search.
          if (thisRequestId === requestIdRef.current) {
            setResults(data);
          }

        })
        .catch((error) => console.error("SEARCH ERROR:", error))
        .finally(() => {

          if (thisRequestId === requestIdRef.current) {
            setLoading(false);
          }

        });

    }, 250);

    return () => clearTimeout(debounceRef.current);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);


  const goTo = (path) => {

    onClose();
    navigate(path);

  };


  const pathFor = (item) => {

    switch (item.type) {

      case "customer":
        return `/customers/${item.id}`;

      case "lead":
        return `/customers/${item.customerId}`;

      case "appointment":
        return `/schedule?date=${item.startTime.slice(0, 10)}`;

      case "quote":
        return `/quotes?open=${item.id}`;

      case "knowledge":
        return "/knowledge";

      case "note":
        return `/customers/${item.customerId}`;

      default:
        return "/dashboard";

    }

  };


  if (!open) {
    return null;
  }

  const hasAnyResults = SECTIONS.some((section) => results[section.key]?.length > 0);
  const showEmpty = query.trim().length >= 2 && !loading && !hasAnyResults;

  return (

    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      onClick={onClose}
    >

      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex items-center gap-3 border-b border-border p-4">

          <Search size={18} className="shrink-0 text-fg-faint" />

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {

              if (e.key === "Escape") {
                onClose();
              }

            }}
            placeholder="Search customers, leads, appointments, invoices, knowledge..."
            className="w-full bg-transparent text-fg placeholder:text-fg-faint focus:outline-none"
          />

          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-fg-faint transition hover:bg-surface-muted hover:text-fg"
            aria-label="Close search"
          >
            <X size={16} />
          </button>

        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">

          {query.trim().length < 2 ? (

            <p className="p-4 text-center text-sm text-fg-faint">
              Keep typing to search.
            </p>

          ) : loading ? (

            <p className="p-4 text-center text-sm text-fg-faint">
              Searching...
            </p>

          ) : showEmpty ? (

            <p className="p-4 text-center text-sm text-fg-faint">
              No matches for "{query.trim()}".
            </p>

          ) : (

            SECTIONS.map((section) => {

              const items = results[section.key];

              if (!items || items.length === 0) {
                return null;
              }

              const Icon = section.icon;

              return (

                <div key={section.key} className="mb-2">

                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                    {section.label}
                  </p>

                  {items.map((item) => (

                    <button
                      key={item.id}
                      onClick={() => goTo(pathFor(item))}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-surface-muted"
                    >

                      <Icon size={16} className="shrink-0 text-accent-text" />

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        {item.subtitle && (
                          <p className="truncate text-xs text-fg-faint">{item.subtitle}</p>
                        )}
                      </div>

                    </button>

                  ))}

                </div>

              );

            })

          )}

        </div>

      </div>

    </div>

  );

}

export default SearchPalette;
