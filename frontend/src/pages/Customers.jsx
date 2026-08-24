import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomers } from "../api/atlasApi";
import CustomerForm from "../components/CustomerForm";


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
        (customer.email || "").toLowerCase().includes(query)
      )
    : customers;




  return (

    <div className="p-8">


      <h1 className="
        text-3xl
        font-bold
      ">

        👥 Customers

      </h1>



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


          </button>


        ))


      )}


      </div>


    </div>

  );

}


export default Customers;
