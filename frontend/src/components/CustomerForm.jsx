import { useState, useRef } from "react";
import { createCustomer } from "../api/atlasApi";


function CustomerForm({ onCustomerCreated }) {


  const [name, setName] = useState("");

  const [email, setEmail] = useState("");

  const [phone, setPhone] = useState("");

  const [address, setAddress] = useState("");

  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);

  const savingRef = useRef(false);



  const submit = async () => {


    if (!name.trim()) {

      setError("Customer name is required.");

      return;

    }

    if (savingRef.current) {

      return;

    }

    savingRef.current = true;

    setError("");

    setSaving(true);


    try {


      const data = await createCustomer(

        name.trim(),

        email.trim(),

        phone.trim(),

        address.trim()

      );


      setName("");

      setEmail("");

      setPhone("");

      setAddress("");


      if(onCustomerCreated){

        onCustomerCreated(data);

      }


    } catch(err) {


      console.error(err);

      setError("Failed to create customer. Please try again.");


    } finally {

      savingRef.current = false;

      setSaving(false);

    }


  };




  return (

    <div className="
      bg-surface/60
      border
      border-border
      rounded-2xl
      p-6
      mt-6
    ">


      <h2 className="text-xl font-bold mb-3">

        Add Customer

      </h2>


      {error && (

        <p className="text-danger mb-3">

          {error}

        </p>

      )}


     <label htmlFor="customer-name" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
  Customer Name
</label>

<input
  id="customer-name"
  placeholder="Customer name"
  value={name}
  onChange={(e) => setName(e.target.value)}
  className="w-full bg-surface-muted text-fg placeholder:text-fg-faint border border-border rounded-lg p-3 mb-3 focus:outline-none focus:border-border-strong"
/>

<label htmlFor="customer-email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
  Customer Email
</label>

<input
  id="customer-email"
  placeholder="Customer email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  className="w-full bg-surface-muted text-fg placeholder:text-fg-faint border border-border rounded-lg p-3 mb-3 focus:outline-none focus:border-border-strong"
/>

<label htmlFor="customer-phone" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
  Customer Phone
</label>

<input
  id="customer-phone"
  placeholder="Customer phone"
  value={phone}
  onChange={(e) => setPhone(e.target.value)}
  className="w-full bg-surface-muted text-fg placeholder:text-fg-faint border border-border rounded-lg p-3 mb-3 focus:outline-none focus:border-border-strong"
/>

<label htmlFor="customer-address" className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
  Service Address
</label>

<input
  id="customer-address"
  placeholder="Service address (optional)"
  value={address}
  onChange={(e) => setAddress(e.target.value)}
  className="w-full bg-surface-muted text-fg placeholder:text-fg-faint border border-border rounded-lg p-3 focus:outline-none focus:border-border-strong"
/>

      <button

        className="
          mt-4
          bg-brand-600
          hover:bg-brand-500
          px-5
          py-2
          rounded-lg
          font-semibold
          text-white
          transition
          disabled:opacity-50
        "

        onClick={submit}

        disabled={saving}

      >

        {saving ? "Creating..." : "Create Customer"}

      </button>



    </div>

  );

}


export default CustomerForm;