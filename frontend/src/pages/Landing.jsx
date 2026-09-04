import { Link, Navigate } from "react-router-dom";
import Logo from "../components/Logo";
import DashboardMockup from "../components/DashboardMockup";
import {
  MessageSquare,
  Flame,
  Send,
  Sun,
  Brain,
  BarChart3,
  ArrowRight,
  Check
} from "lucide-react";


const FEATURES = [
  {
    icon: MessageSquare,
    title: "AI Receptionist",
    description: "Atlas answers customer questions instantly, using what you've taught it about your business — day or night, no one left waiting."
  },
  {
    icon: Flame,
    title: "Smart Lead Tracking",
    description: "Every conversation is read for buying intent automatically. Hot leads get flagged the moment they show up, so nothing slips through."
  },
  {
    icon: Send,
    title: "Follow-Ups, Written For You",
    description: "One click drafts a message for any lead, ready to copy into a text or email — in your voice, based on what they actually asked about."
  },
  {
    icon: Sun,
    title: "Daily Briefing",
    description: "Start each day with a plain-language summary of what needs your attention — no digging through old messages to find it."
  },
  {
    icon: Brain,
    title: "Remembers Every Customer",
    description: "Atlas keeps track of the details across every conversation, so customers never have to repeat themselves."
  },
  {
    icon: BarChart3,
    title: "Real Numbers, Not Guesswork",
    description: "See customers, leads, and conversion at a glance — know what's working without opening a spreadsheet."
  }
];


const STEPS = [
  {
    number: "01",
    title: "Tell Atlas about your business",
    description: "A few minutes to describe what you offer, your hours, and how you work. That's the whole setup."
  },
  {
    number: "02",
    title: "Atlas handles the conversations",
    description: "New and existing customers get answered instantly, and every interaction is logged automatically."
  },
  {
    number: "03",
    title: "You handle the business",
    description: "Check your daily briefing, follow up on hot leads, and let the busywork run itself."
  }
];


function Landing() {

  const isLoggedIn = !!localStorage.getItem("token");

  if (isLoggedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return (

    <div className="min-h-screen bg-ink-950 text-slate-100">

      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[140px]" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">

        <Logo size={30} withWordmark />

        <nav className="flex items-center gap-3">

          <Link
            to="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            Log in
          </Link>

          <Link
            to="/onboarding"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            Get Started
          </Link>

        </nav>

      </header>

      <main className="relative z-10">

        <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 text-center sm:pt-24">

          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-900/80 px-4 py-1.5 text-sm text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            AI receptionist &amp; CRM for small businesses
          </div>

          <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            Never miss a customer.
            <br />
            <span className="brand-gradient-text">Never lift a finger.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Atlas answers your customers, tracks every lead, and writes your follow-ups —
            so running the front office stops being a full-time job on top of your real one.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">

            <Link
              to="/onboarding"
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-500"
            >
              Set Up Your Business
              <ArrowRight size={18} />
            </Link>

            <Link
              to="/login"
              className="rounded-lg border border-ink-600 px-7 py-3.5 text-base font-semibold text-slate-200 transition hover:border-ink-600 hover:bg-ink-900"
            >
              Log in
            </Link>

          </div>

          <p className="mt-6 text-sm text-slate-500">
            No credit card required to get started.
          </p>

          <div className="mx-auto mt-16 hidden max-w-4xl -rotate-1 transform lg:block">
            <DashboardMockup />
          </div>

        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">

          <div className="mb-14 text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Everything the front office needs
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-400">
              Built to replace the sticky notes, missed texts, and forgotten follow-ups —
              not to add another tool to manage.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

            {FEATURES.map((feature) => (

              <div
                key={feature.title}
                className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6 transition hover:border-ink-600 hover:bg-ink-900"
              >

                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/15 text-brand-400">
                  <feature.icon size={22} />
                </div>

                <h3 className="font-display text-lg font-semibold">
                  {feature.title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {feature.description}
                </p>

              </div>

            ))}

          </div>

        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">

          <div className="mb-14 text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Up and running in minutes
            </h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">

            {STEPS.map((step) => (

              <div key={step.number}>

                <div className="font-display text-4xl font-bold text-brand-500/60">
                  {step.number}
                </div>

                <h3 className="mt-3 font-display text-lg font-semibold">
                  {step.title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {step.description}
                </p>

              </div>

            ))}

          </div>

        </section>

        <section className="mx-auto max-w-4xl px-6 pb-28">

          <div className="rounded-3xl border border-ink-700 bg-gradient-to-br from-ink-900 to-ink-850 p-10 text-center sm:p-14">

            <h2 className="mx-auto max-w-xl font-display text-3xl font-bold sm:text-4xl">
              Built for how small businesses actually run.
            </h2>

            <ul className="mx-auto mt-8 flex max-w-md flex-col gap-3 text-left text-slate-300">
              {[
                "Set up in minutes — no technical setup required",
                "One flat login for your whole team",
                "Your data stays yours, always scoped to your business only"
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check size={18} className="mt-0.5 shrink-0 text-brand-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Link
              to="/onboarding"
              className="mt-9 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-500"
            >
              Set Up Your Business
              <ArrowRight size={18} />
            </Link>

          </div>

        </section>

      </main>

      <footer className="relative z-10 border-t border-ink-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row">
          <Logo size={22} withWordmark className="text-slate-300" />
          <p>&copy; {new Date().getFullYear()} Atlas. All rights reserved.</p>
        </div>
      </footer>

    </div>

  );

}

export default Landing;
