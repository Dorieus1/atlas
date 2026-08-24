import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../api/atlasApi";
import AuthHeader from "../components/AuthHeader";


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

        🔐 Login

      </h1>




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





      <input

        type="password"

        placeholder="Password"

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


      <p className="mt-4 text-slate-400">

        <Link to="/forgot-password" className="text-brand-400 hover:underline">

          Forgot your password?

        </Link>

      </p>


      <p className="mt-6 text-slate-400">

        New business?{" "}

        <Link to="/onboarding" className="text-brand-400 hover:underline">

          Set up Atlas

        </Link>

      </p>



    </div>

  );


}


export default Login;