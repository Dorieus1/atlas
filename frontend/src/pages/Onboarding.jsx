import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../api/atlasApi";
import AuthHeader from "../components/AuthHeader";


function Onboarding() {


  const navigate = useNavigate();

  const submittingRef = useRef(false);


  const [form,setForm] = useState({

    name:"",
    industry:"",
    phone:"",
    email:"",
    address:"",
    services:"",

    ownerName:"",
    ownerEmail:"",
    password:""

  });

  const [error, setError] = useState("");

  const [submitting, setSubmitting] = useState(false);




  const update = (e)=>{


    setForm({

      ...form,

      [e.target.name]:
      e.target.value

    });


  };





  const submit = async()=>{

    if (!form.name.trim()) {

      setError("Business name is required.");

      return;

    }

    if (!form.ownerEmail.trim() || !form.password.trim()) {

      setError("Your email and password are required to create your account.");

      return;

    }

    if (submittingRef.current) {

      return;

    }

    submittingRef.current = true;

    setError("");

    setSubmitting(true);

    try {

      const businessRes =
        await fetch(

          `${API_BASE}/api/business`,

          {

            method:"POST",

            headers:{

              "Content-Type":
              "application/json"

            },

            body:
            JSON.stringify({

              name: form.name,
              industry: form.industry,
              phone: form.phone,
              email: form.email,
              address: form.address,
              services: form.services

            })

          }

        );

      const business = await businessRes.json();

      if (!businessRes.ok) {

        throw new Error(business.error || "Failed to create business");

      }

      const registerRes =
        await fetch(

          `${API_BASE}/api/auth/register`,

          {

            method:"POST",

            headers:{

              "Content-Type":
              "application/json"

            },

            body: JSON.stringify({

              business_id: business.id,
              name: form.ownerName,
              email: form.ownerEmail,
              password: form.password

            })

          }

        );

      const registerData = await registerRes.json();

      if (!registerRes.ok) {

        throw new Error(registerData.error || "Failed to create your account");

      }

      const loginRes =
        await fetch(

          `${API_BASE}/api/auth/login`,

          {

            method:"POST",

            headers:{

              "Content-Type":
              "application/json"

            },

            body: JSON.stringify({

              email: form.ownerEmail,
              password: form.password

            })

          }

        );

      const loginData = await loginRes.json();

      if (!loginRes.ok) {

        throw new Error(loginData.error || "Account created, but login failed. Please log in.");

      }

      localStorage.setItem("token", loginData.token);

      localStorage.setItem("business_id", loginData.user.business_id);

      localStorage.setItem("user", JSON.stringify(loginData.user));

      navigate("/knowledge-setup");

    } catch (err) {

      setError(err.message);

    } finally {

      submittingRef.current = false;

      setSubmitting(false);

    }


  };





  return (

    <div className="
      max-w-xl
      mx-auto
      p-8
    ">

      <AuthHeader />

      <h1 className="
        text-3xl
        font-bold
        mb-6
      ">

        🚀 Set Up Your Business

      </h1>


      {error && (

        <p className="text-red-400 mb-4">

          {error}

        </p>

      )}


      <h2 className="text-xl font-bold mb-3">

        Business Details

      </h2>


      {[
        ["name","Business Name"],
        ["industry","Industry"],
        ["phone","Phone"],
        ["email","Business Email"],
        ["address","Address"],
        ["services","Services"]

      ].map(([name,label])=>(


        <input

          key={name}

          name={name}

          placeholder={label}

          value={form[name]}

          onChange={update}

          className="
            w-full
            mb-4
            bg-slate-800
            rounded-lg
            p-3
          "

        />


      ))}


      <h2 className="text-xl font-bold mb-3 mt-6">

        Your Account

      </h2>

      {[
        ["ownerName","Your Name"],
        ["ownerEmail","Your Email"]

      ].map(([name,label])=>(

        <input

          key={name}

          name={name}

          placeholder={label}

          value={form[name]}

          onChange={update}

          className="
            w-full
            mb-4
            bg-slate-800
            rounded-lg
            p-3
          "

        />

      ))}

      <input

        name="password"

        type="password"

        placeholder="Password"

        value={form.password}

        onChange={update}

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

        disabled={submitting}

        className="
          bg-blue-600
          px-6
          py-3
          rounded-lg
          cursor-pointer
          disabled:opacity-50
        "

      >

        {submitting ? "Creating..." : "Create Business"}

      </button>


      <p className="mt-6 text-slate-400">

        Already have an account?{" "}

        <Link to="/login" className="text-blue-400 hover:underline">

          Log in

        </Link>

      </p>


    </div>

  );


}


export default Onboarding;
