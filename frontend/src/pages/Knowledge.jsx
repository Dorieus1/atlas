import KnowledgePanel from "../components/dashboard/KnowledgePanel";
import KnowledgeEditor from "../components/dashboard/KnowledgeEditor";


function Knowledge() {

  return (

    <div className="p-8">

      <h1 className="text-3xl font-bold">
        📚 Knowledge Base
      </h1>

      <p className="mt-1 text-sm text-slate-500">
        What Atlas knows about your business.
      </p>

      <KnowledgePanel />

      <KnowledgeEditor />

    </div>

  );

}

export default Knowledge;