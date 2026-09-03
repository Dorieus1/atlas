import Dashboard from "../components/Dashboard";
import DailyBriefing from "../components/dashboard/DailyBriefing";
import KnowledgePanel from "../components/dashboard/KnowledgePanel";
import IntelligencePanel from "../components/dashboard/IntelligencePanel";
import LeadPipeline from "../components/LeadPipeline";
import TaskPanel from "../components/dashboard/TaskPanel";
import ClockedInPanel from "../components/dashboard/ClockedInPanel";
import GettingStartedChecklist from "../components/GettingStartedChecklist";
import ProductTour from "../components/ProductTour";


function DashboardPage() {

  return (

    <main className="
      max-w-7xl
      mx-auto
      p-8
    ">

      <ProductTour />

      <Dashboard />

      <div className="mt-8">
        <ClockedInPanel />
      </div>

      <div className="mt-8" data-tour="checklist">
        <GettingStartedChecklist />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">

        <div className="lg:col-span-7" data-tour="briefing">
          <DailyBriefing />
        </div>

        <div className="lg:col-span-5">
          <IntelligencePanel />
        </div>

        <div className="lg:col-span-4">
          <TaskPanel />
        </div>

        <div className="lg:col-span-4">
          <KnowledgePanel />
        </div>

        <div className="lg:col-span-4">
          <LeadPipeline />
        </div>

      </div>

    </main>

  );

}


export default DashboardPage;