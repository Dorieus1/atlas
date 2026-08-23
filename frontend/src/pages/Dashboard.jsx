import Dashboard from "../components/Dashboard";
import DailyBriefing from "../components/dashboard/DailyBriefing";
import KnowledgePanel from "../components/dashboard/KnowledgePanel";
import KnowledgeEditor from "../components/dashboard/KnowledgeEditor";
import IntelligencePanel from "../components/dashboard/IntelligencePanel";
import LeadPipeline from "../components/LeadPipeline";
import FollowUpAssistant from "../components/dashboard/FollowUpAssistant";
import TaskPanel from "../components/dashboard/TaskPanel";


function DashboardPage() {

  return (

    <main className="
      max-w-7xl
      mx-auto
      p-8
      space-y-8
    ">

      <Dashboard />

      <DailyBriefing />

      <IntelligencePanel />

      <TaskPanel />

      <KnowledgePanel />

      <KnowledgeEditor />

      <LeadPipeline />

      <FollowUpAssistant />

    </main>

  );

}


export default DashboardPage;