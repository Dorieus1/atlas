import { Flame } from "lucide-react";
import LeadPipeline from "../components/LeadPipeline";

function Leads() {

  return (

    <div className="p-8">

      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Flame size={28} />
        Leads
      </h1>

      <p className="mt-1 mb-6 text-sm text-fg-faint">
        Every opportunity, ranked by how hot it is.
      </p>

      <LeadPipeline />

    </div>

  );

}

export default Leads;
