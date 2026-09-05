import { forwardRef } from "react";

// The plain bordered text input nearly every form-heavy page in the app
// wants - before this, BusinessProfile.jsx, Onboarding.jsx, Login.jsx,
// ForgotPassword.jsx, ResetPassword.jsx, PublicChat.jsx, and
// PublicBooking.jsx each hand-rolled their own near-identical (but not
// identical) copy of this exact Tailwind string - a review finding.
// One of them (BusinessProfile.jsx) was even missing the focus-border
// highlight every other page already had, a small real inconsistency
// this fixes along with the duplication itself.
//
// `className` is appended after the shared look, not merged/deduped -
// good enough here since every real caller only ever adds spacing
// (mb-3, mb-4) or a one-off modifier (h-24 on the one place that reuses
// this for a textarea's classes), never something that would conflict
// with the base classes below.
const Input = forwardRef(function Input({ className = "", ...props }, ref) {

  return (

    <input
      ref={ref}
      className={`w-full rounded-lg border border-border bg-surface-muted p-3 text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none ${className}`}
      {...props}
    />

  );

});

export default Input;
