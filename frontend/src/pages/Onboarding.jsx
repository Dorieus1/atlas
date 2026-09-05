import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Rocket } from "lucide-react";
import { createBusiness, register, deleteIncompleteBusiness, login } from "../api/atlasApi";
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

      let business;

      try {

        business = await createBusiness({

          name: form.name.trim(),
          industry: form.industry.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          services: form.services.trim()

        });

      } catch (err) {

        throw new Error(err.message || "Failed to create business");

      }

      try {

        await register(

          form.ownerName.trim(),
          form.ownerEmail.trim(),
          form.password,
          business.id

        );

      } catch (err) {

        // The business row was already created above. Since no account
        // exists to use it, clean it up rather than leaving it behind
        // permanently - if this fails too, that's fine, the original
        // error below is still what the user needs to see.
        deleteIncompleteBusiness(business.id).catch(() => {});

        throw new Error(err.message || "Failed to create your account");

      }

      // register() only ever returns {id, message} (see
      // authController.js) - it never issues a token itself, so this
      // still needs its own real login right after, same as before.
      let loginData;

      try {

        loginData = await login(form.ownerEmail, form.password);

      } catch (err) {

        throw new Error(err.message || "Account created, but login failed. Please log in.");

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
      mt-12
      mb-12
      rounded-2xl
      border
      border-border
      bg-surface/60
      p-8
    ">

      <AuthHeader />

      <h1 className="
        text-3xl
        font-bold
        mb-6
        flex
        items-center
        gap-2
      ">

        <Rocket size={28} />
        Set Up Your Business

      </h1>


      {error && (

        <p className="text-danger mb-4">

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


        <div key={name} className="mb-4">

          <label htmlFor={`onboarding-${name}`} className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
            {label}
          </label>

          <input

            id={`onboarding-${name}`}

            name={name}

            placeholder={label}

            value={form[name]}

            onChange={update}

            className="
              w-full
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

        </div>


      ))}


      <h2 className="text-xl font-bold mb-3 mt-6">

        Your Account

      </h2>

      {[
        ["ownerName","Your Name"],
        ["ownerEmail","Your Email"]

      ].map(([name,label])=>(

        <div key={name} className="mb-4">

          <label htmlFor={`onboarding-${name}`} className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
            {label}
          </label>

          <input

            id={`onboarding-${name}`}

            name={name}

            placeholder={label}

            value={form[name]}

            onChange={update}

            className="
              w-full
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

        </div>

      ))}

      <label htmlFor="onboarding-password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
        Password
      </label>

      <input

        id="onboarding-password"

        name="password"

        type="password"

        placeholder="Password"

        value={form.password}

        onChange={update}

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

        onClick={submit}

        disabled={submitting}

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

        {submitting ? "Creating..." : "Create Business"}

      </button>


      <p className="mt-6 text-fg-muted">

        Already have an account?{" "}

        <Link to="/login" className="text-accent-text hover:underline">

          Log in

        </Link>

      </p>


    </div>

  );


}


export default Onboarding;
