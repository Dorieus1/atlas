import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { resetPassword } from "../api/atlasApi";
import AuthHeader from "../components/AuthHeader";


function ResetPassword() {


  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const token = searchParams.get("token");

  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);



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

    setError("");

    setSaving(true);

    try {

      await resetPassword(token, password);

      navigate("/login");

    } catch (err) {

      setError(err.message || "Something went wrong. Please try again.");

      setSaving(false);

    }

  };


  return (

    <div className="
      max-w-md
      mx-auto
      p-8
    ">

      <AuthHeader />

      <h1 className="
        text-3xl
        font-bold
        mb-6
      ">

        🔑 Choose a new password

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

      <input

        type="password"

        placeholder="New password"

        value={password}

        onChange={(e)=>setPassword(e.target.value)}

        className="
          w-full
          mb-4
          bg-slate-800
          rounded-lg
          p-3
        "

      />

      <input

        type="password"

        placeholder="Confirm new password"

        value={confirmPassword}

        onChange={(e)=>setConfirmPassword(e.target.value)}

        className="
          w-full
          mb-4
          bg-slate-800
          rounded-lg
          p-3
        "

      />

      <button

        onClick={submit}

        disabled={saving}

        className="
          bg-blue-600
          px-6
          py-3
          rounded-lg
          cursor-pointer
          disabled:opacity-50
        "

      >

        {saving ? "Saving..." : "Reset password"}

      </button>


      <p className="mt-6 text-slate-400">

        <Link to="/login" className="text-blue-400 hover:underline">

          Back to login
        </Link>

      </p>


    </div>

  );

}


export default ResetPassword;
