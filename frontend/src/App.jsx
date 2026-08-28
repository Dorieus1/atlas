import { Suspense, lazy } from "react";

import {
  BrowserRouter,
  Routes,
  Route
} from "react-router-dom";

import Layout from "./layout/Layout";

// Landing ("/") and Login ("/login") are the first thing most visitors see -
// keeping them as eager, static imports means the very first page render
// doesn't pay for an extra network round-trip. NotFound is trivially small
// (a handful of lines, no heavy deps) so splitting it out would add a
// Suspense round-trip to every mistyped URL for no real bundle-size win -
// it stays eager too. Every other page below is lazy: none of them are the
// first thing a given visitor sees for the *common* path (a brand-new
// customer opening the public chat widget or the portal login page never
// touches the CRM dashboard, and a logged-in CRM user pays a one-time
// per-page fetch cost rather than downloading the whole app upfront).
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

import IntelligencePanel from "./components/dashboard/IntelligencePanel";
import ProtectedRoute from "./components/ProtectedRoute";

const DashboardPage = lazy(() => import("./pages/Dashboard"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerProfile = lazy(() => import("./pages/CustomerProfile"));
const Leads = lazy(() => import("./pages/Leads"));
const Today = lazy(() => import("./pages/Today"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Plans = lazy(() => import("./pages/Plans"));
const PublicChat = lazy(() => import("./pages/PublicChat"));
const PublicBooking = lazy(() => import("./pages/PublicBooking"));
const PortalLogin = lazy(() => import("./pages/PortalLogin"));
const PortalDashboard = lazy(() => import("./pages/PortalDashboard"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
// Analytics pulls in recharts, a sizeable charting library used nowhere
// else in the app - lazy-loading it means recharts only ever downloads
// for visitors who actually open the Analytics page.
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const KnowledgeSetup = lazy(() => import("./pages/KnowledgeSetup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// Matches the "Loading..." text used elsewhere in the app (e.g.
// frontend/src/pages/Schedule.jsx, Quotes.jsx) rather than inventing a new
// spinner style from scratch.
function PageLoading() {

  return (

    <div className="flex min-h-[50vh] items-center justify-center">

      <p className="text-sm text-fg-faint">
        Loading...
      </p>

    </div>

  );

}

function App() {

  return (

    <BrowserRouter>

      <Layout>

        <Suspense fallback={<PageLoading />}>

        <Routes>

          <Route
            path="/"
            element={<Landing />}
          />

          <Route
  path="/dashboard"
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
  path="/customers/trash"
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
            path="/today"
            element={
              <ProtectedRoute>
                <Today />
              </ProtectedRoute>
            }
          />

          <Route
            path="/schedule"
            element={
              <ProtectedRoute>
                <Schedule />
              </ProtectedRoute>
            }
          />

          <Route
            path="/quotes"
            element={
              <ProtectedRoute>
                <Quotes />
              </ProtectedRoute>
            }
          />

          <Route
            path="/plans"
            element={
              <ProtectedRoute>
                <Plans />
              </ProtectedRoute>
            }
          />

          <Route
            path="/talk/:slug"
            element={<PublicChat />}
          />

          <Route
            path="/book/:slug"
            element={<PublicBooking />}
          />

          <Route
            path="/portal/:slug"
            element={<PortalLogin />}
          />

          <Route
            path="/portal/:slug/dashboard"
            element={<PortalDashboard />}
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

        </Suspense>

      </Layout>

    </BrowserRouter>

  );

}

export default App;
