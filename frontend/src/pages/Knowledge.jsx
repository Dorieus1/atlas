import { useState } from "react";
import { BookOpen } from "lucide-react";
import KnowledgePanel from "../components/dashboard/KnowledgePanel";
import KnowledgeEditor from "../components/dashboard/KnowledgeEditor";
import KnowledgeGapsPanel from "../components/dashboard/KnowledgeGapsPanel";


function Knowledge() {

  // KnowledgePanel manages its own fetching with no refresh hook exposed,
  // so approving a suggestion (which saves a real entry behind the
  // scenes) wouldn't otherwise show up in the visible list without a
  // manual page reload. Bumping this key forces a clean remount instead.
  const [knowledgeListKey, setKnowledgeListKey] = useState(0);

  return (

    <div className="p-8">

      <h1 className="text-3xl font-bold flex items-center gap-2">
        <BookOpen size={28} />
        Knowledge Base
      </h1>

      <p className="mt-1 text-sm text-slate-500">
        What Atlas knows about your business.
      </p>

      <div className="mt-6">
        <KnowledgeGapsPanel onApproved={() => setKnowledgeListKey((k) => k + 1)} />
      </div>

      <KnowledgePanel key={knowledgeListKey} />

      <KnowledgeEditor onSaved={() => setKnowledgeListKey((k) => k + 1)} />

    </div>

  );

}

export default Knowledge;