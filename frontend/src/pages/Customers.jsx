import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomers } from "../api/atlasApi";
import CustomerForm from "../components/CustomerForm";
import { downloadCSV } from "../utils/csv";


function Customers() {


  const [customers, setCustomers] = useState([]);

  const [search, setSearch] = useState("");

  const [loadError, setLoadError] = useState("");

  const navigate = useNavigate();



  const loadCustomers = async () => {


    try {


      const data = await getCustomers();


      setCustomers(data);

      setLoadError("");


    } catch(error) {


      console.error(
        "CUSTOMER ERROR:",
        error
      );


      setLoadError("Couldn't load your customers. Please refresh to try again.");


    }


  };




  useEffect(() => {


    loadCustomers();


  }, []);



  const query = search.trim().toLowerCase();

  const filteredCustomers = query
    ? customers.filter((customer) =>
        (customer.name || "").toLowerCase().includes(query) ||
        (customer.email || "").toLowerCase().includes(query) ||
        (customer.phone || "").toLowerCase().includes(query)
      )
    : customers;


  const exportCSV = () => {

    downloadCSV(

      "customers.csv",

      [
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "created_at", label: "Created At" }
      ],

      filteredCustomers

    );

  };


  return (

    <div className="p-8">


      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>

          <h1 className="
            text-3xl
            font-bold
          ">

            👥 Customers

          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Every customer in one place.
          </p>

        </div>

        {customers.length > 0 && (

          <button

            onClick={exportCSV}

            className="bg-ink-800 hover:bg-ink-700 border border-ink-700 px-4 py-2 rounded-lg text-sm"

          >

            ⬇️ Export CSV

          </button>

        )}

      </div>



      <CustomerForm

        onCustomerCreated={loadCustomers}

      />


      {customers.length > 0 && (

        <input

          value={search}

          onChange={(e) => setSearch(e.target.value)}

          placeholder="Search by name or email"

          className="
            w-full
            mt-8
            bg-ink-900/60
            text-white
            placeholder:text-slate-500
            border
            border-ink-700
            rounded-lg
            p-3
          "

        />

      )}




      <div className="
        mt-8
        grid
        gap-4
      ">


      {loadError ? (

        <p className="text-red-400">

          {loadError}

        </p>


      ) : customers.length === 0 ? (

        <p className="text-slate-400">

          No customers yet.

        </p>


      ) : filteredCustomers.length === 0 ? (

        <p className="text-slate-400">

          No customers match "{search.trim()}".

        </p>


      ) : (


        filteredCustomers.map((customer)=>(


          <button

            key={customer.id}

            onClick={()=>navigate(`/customers/${customer.id}`)}

            className="
              text-left
              border
              border-ink-700
              bg-ink-900/60
              hover:border-ink-600
              hover:bg-ink-900
              rounded-xl
              p-5
              transition
            "

          >

            <h2 className="
              text-xl
              font-bold
            ">

              {customer.name}

            </h2>



            <p className="text-slate-300">

              {customer.email}

            </p>

            {customer.phone && (

              <p className="text-slate-400">

                {customer.phone}

              </p>

            )}


          </button>


        ))


      )}


      </div>


    </div>

  );

}


export default Customers;
