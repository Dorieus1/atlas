import {
  BrowserRouter,
  Routes,
  Route
} from "react-router-dom";

import Layout from "./layout/Layout";
import DashboardPage from "./pages/Dashboard";

import Customers from "./pages/Customers";
import Leads from "./pages/Leads";
import Knowledge from "./pages/Knowledge";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import CustomerProfile from "./pages/CustomerProfile";
import IntelligencePanel from "./components/dashboard/IntelligencePanel";
import Onboarding from "./pages/Onboarding"; 
import KnowledgeSetup from "./pages/KnowledgeSetup";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";

function App() {

  return (

    <BrowserRouter>

      <Layout>

        <Routes>

          <Route
  path="/"
  element={
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  }
/>

          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/forgot-password"
            element={<ForgotPassword />}
          />

          <Route
            path="/reset-password"
            element={<ResetPassword />}
          />

          <Route
            path="/onboarding"
            element={<Onboarding />}
          />

          <Route
            path="/knowledge-setup"
            element={
              <ProtectedRoute>
                <KnowledgeSetup />
              </ProtectedRoute>
            }
          />

          <Route
  path="/customers"
  element={
    <ProtectedRoute>
      <Customers />
    </ProtectedRoute>
  }
/>
          <Route
  path="/customers/:id"
  element={
    <ProtectedRoute>
      <CustomerProfile />
    </ProtectedRoute>
  }
/>
          <Route
  path="/leads"
  element={
    <ProtectedRoute>
      <Leads />
    </ProtectedRoute>
  }
/>

          <Route
            path="/knowledge"
            element={
              <ProtectedRoute>
                <Knowledge />
              </ProtectedRoute>
            }
          />

          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          <Route
            path="*"
            element={<NotFound />}
          />

        </Routes>

      </Layout>

    </BrowserRouter>

  );

}

export default App;