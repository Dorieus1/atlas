import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";

import {
  getPortalBusiness,
  requestPortalLogin,
  verifyPortalLogin
} from "../api/atlasApi";

import Logo from "../components/Logo";


function PortalLogin() {

  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkToken = searchParams.get("token");

  const [business, setBusiness] = useState(null);
  const [loadingBusiness, setLoadingBusiness] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [verifying, setVerifying] = useState(!!linkToken);
  const [verifyError, setVerifyError] = useState("");

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const submittingRef = useRef(false);


  useEffect(() => {

    getPortalBusiness(slug)
      .then(setBusiness)
      .catch((error) => {

        console.error("PORTAL BUSINESS LOAD ERROR:", error);
        setNotFound(true);

      })
      .finally(() => setLoadingBusiness(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);


  useEffect(() => {

    if (!linkToken) {
      return;
    }

    verifyPortalLogin(slug, linkToken)
      .then((data) => {

        localStorage.setItem("portal_token", data.token);
        localStorage.setItem("portal_customer", JSON.stringify(data.customer));

        navigate(`/portal/${slug}/dashboard`, { replace: true });

      })
      .catch((error) => {

        console.error("PORTAL VERIFY ERROR:", error);
        setVerifyError(error.message || "This link is invalid or has expired. Please request a new one.");
        setVerifying(false);

      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, linkToken]);


  const handleSubmit = async () => {

    if (!email.trim()) {

      setFormError("Please enter your email.");
      return;

    }

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setFormError("");

    try {

      await requestPortalLogin(slug, email.trim());
      setSubmitted(true);

    } catch (error) {

      console.error("PORTAL LOGIN REQUEST ERROR:", error);
      setFormError(error.message || "Something went wrong. Please try again.");

    } finally {

      submittingRef.current = false;
      setSubmitting(false);

    }

  };


  if (loadingBusiness) {

    // Same branded treatment as PublicChat's loading state - this is a
    // customer's first impression of their portal, not just an internal
    // waiting screen.
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="animate-pulse">
          <Logo size={40} />
        </div>
      </div>
    );

  }

  if (notFound) {

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-center">
        <Logo size={40} />
        <h1 className="mt-4 text-xl font-bold">We couldn't find that business</h1>
        <p className="mt-2 text-fg-muted">Double check the link and try again.</p>
      </div>
    );

  }

  return (

    <div className="flex min-h-screen items-center justify-center bg-bg p-4 sm:p-6">

      <div className="w-full max-w-md">

        <div className="mb-6 flex flex-col items-center text-center">

          <Logo size={38} />

          <h1 className="mt-3 font-display text-2xl font-bold">
            {business?.name}
          </h1>

          <p className="mt-1 text-sm text-fg-faint">
            Your customer portal
          </p>

        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-5 sm:p-6">

          {verifying ? (

            <p className="text-center text-sm text-fg-muted">
              Logging you in...
            </p>

          ) : submitted ? (

            <div className="text-center">

              <Mail size={28} className="mx-auto text-accent-text" />

              <p className="mt-3 text-sm text-fg-muted">
                If that email is on file, we've sent a login link to it. Check your inbox (and spam folder) — the link expires in 15 minutes.
              </p>

            </div>

          ) : (

            <div>

              <div className="mb-4 flex items-center gap-2 text-fg-muted">
                <Mail size={18} className="text-accent-text" />
                <span className="text-sm font-medium">Enter your email to view your account</span>
              </div>

              {verifyError && (
                <p className="mb-3 text-sm text-danger">
                  {verifyError}
                </p>
              )}

              {formError && (
                <p className="mb-3 text-sm text-danger">
                  {formError}
                </p>
              )}

              <label htmlFor="portal-email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
                Email
              </label>

              <input
                id="portal-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSubmit();
                  }
                }}
                className="mb-4 w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
              />

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                {submitting ? "Sending..." : "Send login link"}
              </button>

            </div>

          )}

        </div>

        <p className="mt-6 text-center text-xs text-fg-faint">
          Powered by Atlas
        </p>

      </div>

    </div>

  );

}

export default PortalLogin;
