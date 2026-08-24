import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomers } from "../api/atlasApi";
import CustomerForm from "../components/CustomerForm";
import { downloadCSV } from "../utils/csv";


function Customers() {


  const [customers, setCustomers] = useState([]);

  const [search, setSearch] = useState("");

  const navigate = useNavigate();



  const loadCustomers = async () => {


    try {


      const data = await getCustomers();


      setCustomers(data);


    } catch(error) {


      console.error(
        "CUSTOMER ERROR:",
        error
      );


      setCustomers([]);


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

        <h1 className="
          text-3xl
          font-bold
        ">

          👥 Customers

        </h1>

        {customers.length > 0 && (

          <button

            onClick={exportCSV}

            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 rounded-lg text-sm"

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
            bg-slate-800
            text-white
            placeholder:text-slate-500
            border
            border-slate-700
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


      {customers.length === 0 ? (

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
              bg-slate-800
              hover:bg-slate-700
              rounded-xl
              p-5
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
