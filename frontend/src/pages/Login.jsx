import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../api/atlasApi";
import AuthLayout from "../components/AuthLayout";


function Login() {


  const navigate = useNavigate();


  const [email,setEmail] = useState("");

  const [password,setPassword] = useState("");

  const [error,setError] = useState("");

  const [loggingIn,setLoggingIn] = useState(false);

  const loggingInRef = useRef(false);





  const login = async()=>{


    if (!email.trim() || !password.trim()) {

      setError("Email and password are required.");

      return;

    }

    if (loggingInRef.current) {

      return;

    }

    loggingInRef.current = true;

    setLoggingIn(true);

    try {


      const res = await fetch(

        `${API_BASE}/api/auth/login`,

        {

          method:"POST",

          headers:{

            "Content-Type":
            "application/json"

          },

          body:JSON.stringify({

            email: email.trim(),

            password

          })

        }

      );




      const data =
        await res.json();




      if(!res.ok){

        setError(data.error || "Login failed. Please try again.");

        return;

      }




      localStorage.setItem(

        "token",

        data.token

      );



      localStorage.setItem(

        "business_id",

        data.user.business_id

      );



      localStorage.setItem(

        "user",

        JSON.stringify(data.user)

      );



      navigate("/dashboard");


    } catch(error){


      setError(error.message);


    } finally {


      loggingInRef.current = false;

      setLoggingIn(false);


    }


  };






  return (

    <AuthLayout>

      <h1 className="
        text-3xl
        font-bold
        mb-1
      ">

        Welcome back

      </h1>

      <p className="mb-6 text-fg-muted">
        Log in to your Atlas account.
      </p>




      {error && (

        <p className="
          text-danger
          mb-4
        ">

          {error}

        </p>

      )}






      <label htmlFor="login-email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Email
      </label>

      <input

        id="login-email"

        placeholder="Email"

        value={email}

        onChange={(e)=>setEmail(e.target.value)}

        className="
          w-full
          mb-4
          bg-surface-muted
          border
          border-border
          rounded-lg
          p-3
          text-fg
          placeholder:text-fg-faint
          focus:outline-none
          focus:border-border-strong
        "

      />





      <label htmlFor="login-password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Password
      </label>

      <input

        id="login-password"

        type="password"

        placeholder="Password"

        value={password}

        onChange={(e)=>setPassword(e.target.value)}

        className="
          w-full
          mb-4
          bg-surface-muted
          border
          border-border
          rounded-lg
          p-3
          text-fg
          placeholder:text-fg-faint
          focus:outline-none
          focus:border-border-strong
        "

      />





      <button

        onClick={login}

        disabled={loggingIn}

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

        {loggingIn ? "Logging in..." : "Login"}

      </button>


      <p className="mt-4 text-fg-muted">

        <Link to="/forgot-password" className="text-accent-text hover:underline">

          Forgot your password?

        </Link>

      </p>


      <p className="mt-6 text-fg-muted">

        New business?{" "}

        <Link to="/onboarding" className="text-accent-text hover:underline">

          Set up Atlas

        </Link>

      </p>



    </AuthLayout>

  );


}


export default Login;