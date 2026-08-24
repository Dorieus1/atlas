import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/atlasApi";
import AuthHeader from "../components/AuthHeader";


function ForgotPassword() {


  const [email, setEmail] = useState("");

  const [error, setError] = useState("");

  const [submitted, setSubmitted] = useState(false);

  const [sending, setSending] = useState(false);

  const sendingRef = useRef(false);



  const submit = async () => {

    if (!email.trim()) {

      setError("Email is required.");

      return;

    }

    if (sendingRef.current) {

      return;

    }

    sendingRef.current = true;

    setError("");

    setSending(true);

    try {

      await forgotPassword(email.trim());

      setSubmitted(true);

    } catch (err) {

      setError(err.message || "Something went wrong. Please try again.");

    } finally {

      sendingRef.current = false;

      setSending(false);

    }

  };


  return (

    <div className="
      max-w-md
      mx-auto
      mt-12
      mb-12
      rounded-2xl
      border
      border-ink-700
      bg-ink-900/60
      p-8
    ">

      <AuthHeader />

      <h1 className="
        text-3xl
        font-bold
        mb-6
      ">

        🔑 Reset your password

      </h1>


      {submitted ? (

        <p className="text-slate-300">

          If that email is registered, a reset link has been sent. Check your inbox (and spam folder) for a message from Atlas.

        </p>

      ) : (

        <>

          <p className="text-slate-400 mb-6">

            Enter the email you used to sign up, and we'll send you a link to reset your password.

          </p>

          {error && (

            <p className="
              text-red-400
              mb-4
            ">

              {error}

            </p>

          )}

          <input

            placeholder="Email"

            value={email}

            onChange={(e)=>setEmail(e.target.value)}

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

            disabled={sending}

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

            {sending ? "Sending..." : "Send reset link"}

          </button>

        </>

      )}


      <p className="mt-6 text-slate-400">

        <Link to="/login" className="text-brand-400 hover:underline">

          Back to login
        </Link>

      </p>


    </div>

  );

}


export default ForgotPassword;
