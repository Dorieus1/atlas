import Dashboard from "../components/Dashboard";
import DailyBriefing from "../components/dashboard/DailyBriefing";
import KnowledgePanel from "../components/dashboard/KnowledgePanel";
import KnowledgeEditor from "../components/dashboard/KnowledgeEditor";
import IntelligencePanel from "../components/dashboard/IntelligencePanel";
import LeadPipeline from "../components/LeadPipeline";
import FollowUpAssistant from "../components/dashboard/FollowUpAssistant";
import TaskPanel from "../components/dashboard/TaskPanel";
import GettingStartedChecklist from "../components/GettingStartedChecklist";


function DashboardPage() {

  return (

    <main className="
      max-w-7xl
      mx-auto
      p-8
    ">

      <Dashboard />

      <div className="mt-8">
        <GettingStartedChecklist />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">

        <div className="lg:col-span-7">
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

        <div className="lg:col-span-12">
          <KnowledgeEditor />
        </div>

        <div className="lg:col-span-12">
          <FollowUpAssistant />
        </div>

      </div>

    </main>

  );

}


export default DashboardPage;