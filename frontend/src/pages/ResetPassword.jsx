import { useState, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { resetPassword } from "../api/atlasApi";
import AuthLayout from "../components/AuthLayout";


function ResetPassword() {


  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const token = searchParams.get("token");

  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);

  const savingRef = useRef(false);



  const submit = async () => {

    if (!token) {

      setError("This reset link is missing its token. Please request a new one.");

      return;

    }

    if (password.length < 6) {

      setError("Password must be at least 6 characters.");

      return;

    }

    if (password !== confirmPassword) {

      setError("Passwords do not match.");

      return;

    }

    if (savingRef.current) {

      return;

    }

    savingRef.current = true;

    setError("");

    setSaving(true);

    try {

      await resetPassword(token, password);

      navigate("/login");

    } catch (err) {

      setError(err.message || "Something went wrong. Please try again.");

      savingRef.current = false;

      setSaving(false);

    }

  };


  return (

    <AuthLayout>

      <h1 className="
        text-3xl
        font-bold
        mb-6
      ">

        Choose a new password

      </h1>


      {!token && (

        <p className="text-red-400 mb-4">

          This link is missing its reset token. Please request a new reset link.

        </p>

      )}

      {error && (

        <p className="
          text-red-400
          mb-4
        ">

          {error}

        </p>

      )}

      <label htmlFor="reset-password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        New Password
      </label>

      <input

        id="reset-password"

        type="password"

        placeholder="New password"

        value={password}

        onChange={(e)=>setPassword(e.target.value)}

        className="
          w-full
          mb-4
          bg-ink-800
          border
          border-ink-700
          rounded-lg
          p-3
          text-white
          placeholder:text-slate-500
          focus:outline-none
          focus:border-ink-600
        "

      />

      <label htmlFor="reset-confirm-password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        Confirm New Password
      </label>

      <input

        id="reset-confirm-password"

        type="password"

        placeholder="Confirm new password"

        value={confirmPassword}

        onChange={(e)=>setConfirmPassword(e.target.value)}

        className="
          w-full
          mb-4
          bg-ink-800
          border
          border-ink-700
          rounded-lg
          p-3
          text-white
          placeholder:text-slate-500
          focus:outline-none
          focus:border-ink-600
        "

      />

      <button

        onClick={submit}

        disabled={saving}

        className="
          bg-brand-600
          hover:bg-brand-500
          px-6
          py-3
          rounded-lg
          cursor-pointer
          font-semibold
          text-white
          transition
          disabled:opacity-50
        "

      >

        {saving ? "Saving..." : "Reset password"}

      </button>


      <p className="mt-6 text-slate-400">

        <Link to="/login" className="text-brand-400 hover:underline">

          Back to login
        </Link>

      </p>


    </AuthLayout>

  );

}


export default ResetPassword;
