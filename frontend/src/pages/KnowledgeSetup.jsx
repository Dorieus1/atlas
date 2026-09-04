import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Brain } from "lucide-react";
import Logo from "../components/Logo";
import KnowledgeEditor from "../components/dashboard/KnowledgeEditor";
import KnowledgePanel from "../components/dashboard/KnowledgePanel";


// This used to be its own bespoke form - four fixed textareas (Hours,
// Services, Service Area, FAQ), saved as a batch - a completely
// different shape than the real, ongoing Knowledge page (Knowledge.jsx),
// which lets an owner add any number of freely titled/categorized
// entries, one at a time, and search/edit/delete them later. A new
// owner learned one mental model at signup and a different one the
// first time they came back to update it - a real review finding, not
// just cosmetic, since it meant re-learning the feature.
//
// This now reuses the exact same KnowledgeEditor and KnowledgePanel
// components Knowledge.jsx itself uses, wrapped in a welcoming
// first-run framing - one real mental model, taught once, in the place
// it's actually going to keep living. Each entry saves for real the
// moment it's added (KnowledgeEditor already does that), so there's
// nothing left to "batch save" - "Continue" just moves on.
function KnowledgeSetup() {

  const navigate = useNavigate();

  // KnowledgePanel manages its own fetching with no refresh hook
  // exposed - same reason Knowledge.jsx bumps this same kind of key -
  // so an entry added above shows up in the list below without a
  // manual reload.
  const [refreshKey, setRefreshKey] = useState(0);

  return (

    <div className="mx-auto mb-12 mt-12 max-w-2xl">

      <Logo size={34} className="mb-6" />

      <h1 className="flex items-center gap-2 text-3xl font-bold">
        <Brain size={28} />
        Teach Atlas Your Business
      </h1>

      <p className="mt-2 text-fg-muted">
        Add a few things Atlas should know before it starts talking to customers -
        your hours, the services you offer, the areas you serve, common questions,
        anything someone might ask. Add as many as you like, one at a time. You can
        always come back and add more later from Knowledge in the sidebar.
      </p>

      <div className="mt-6">
        <KnowledgeEditor onSaved={() => setRefreshKey((k) => k + 1)} />
      </div>

      <div className="mt-6">
        <KnowledgePanel key={refreshKey} />
      </div>

      <div className="mt-6 flex justify-end">

        <button
          onClick={() => navigate("/dashboard")}
          className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white transition hover:bg-brand-500"
        >
          Continue to Dashboard
        </button>

      </div>

    </div>

  );

}

export default KnowledgeSetup;
