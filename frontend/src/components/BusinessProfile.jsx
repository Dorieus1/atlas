import { useEffect, useState } from "react";

function BusinessProfile({ business }) {

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    industry: "",
    services: "",
  });


  useEffect(() => {

    if (business) {

      setForm({

        name: business.name || "",
        phone: business.phone || "",
        email: business.email || "",
        address: business.address || "",
        industry: business.industry || "",
        services: business.services || "",

      });

    }

  }, [business]);



  const updateBusiness = async () => {

    await fetch(
      "http://localhost:5050/api/business",
      {

        method: "PUT",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({

          id: business.id,

          ...form

        }),

      }
    );


    alert("Business updated");

  };



  if (!business) {

    return null;

  }



  return (

    <div className="card">

      <h2>
        Business Profile
      </h2>


      <input

        value={form.name}

        placeholder="Business name"

        onChange={(e) =>
          setForm({
            ...form,
            name: e.target.value
          })
        }

      />


      <input

        value={form.phone}

        placeholder="Phone"

        onChange={(e) =>
          setForm({
            ...form,
            phone: e.target.value
          })
        }

      />


      <input

        value={form.email}

        placeholder="Email"

        onChange={(e) =>
          setForm({
            ...form,
            email: e.target.value
          })
        }

      />


      <input

        value={form.address}

        placeholder="Address"

        onChange={(e) =>
          setForm({
            ...form,
            address: e.target.value
          })
        }

      />


      <input

        value={form.industry}

        placeholder="Industry"

        onChange={(e) =>
          setForm({
            ...form,
            industry: e.target.value
          })
        }

      />


      <textarea

        value={form.services}

        placeholder="Services"

        onChange={(e) =>
          setForm({
            ...form,
            services: e.target.value
          })
        }

      />


      <button onClick={updateBusiness}>
        Save Business
      </button>


    </div>

  );

}


export default BusinessProfile;