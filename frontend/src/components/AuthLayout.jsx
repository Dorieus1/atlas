import { Check } from "lucide-react";
import Logo from "./Logo";


const TRUST_POINTS = [
  "Set up in minutes, no technical setup required",
  "One flat login for your whole team",
  "Your data stays yours, always"
];


function AuthLayout({ children }) {

  return (

    <div className="flex min-h-screen">

      <div className="relative hidden w-[42%] shrink-0 flex-col justify-between overflow-hidden bg-ink-900 p-10 lg:flex">

        <div
          className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-brand-600/20 blur-[120px]"
          aria-hidden="true"
        />

        <div
          className="pointer-events-none absolute -bottom-32 -right-16 h-[360px] w-[360px] rounded-full bg-brand-500/10 blur-[110px]"
          aria-hidden="true"
        />

        <Logo size={34} withWordmark className="relative z-10" />

        <div className="relative z-10">

          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">
            The front office that
            {" "}
            <span className="brand-gradient-text">runs itself.</span>
          </h2>

          <p className="mt-4 max-w-sm text-slate-400">
            Atlas answers your customers, tracks every lead, and writes your
            follow-ups — so you can run the business instead of babysitting it.
          </p>

          <ul className="mt-8 flex flex-col gap-3">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-slate-300">
                <Check size={17} className="mt-0.5 shrink-0 text-brand-400" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

        </div>

        <p className="relative z-10 text-xs text-slate-600">
          &copy; {new Date().getFullYear()} Atlas. All rights reserved.
        </p>

      </div>

      <div className="flex flex-1 items-center justify-center bg-ink-950 p-6 sm:p-10">

        <div className="w-full max-w-md">

          <div className="mb-8 text-center lg:hidden">
            <Logo size={36} className="mx-auto" />
          </div>

          {children}

        </div>

      </div>

    </div>

  );

}

export default AuthLayout;
