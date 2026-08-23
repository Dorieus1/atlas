import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomers } from "../api/atlasApi";
import CustomerForm from "../components/CustomerForm";


function Customers() {


  const [customers, setCustomers] = useState([]);

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




      <div className="
        mt-8
        grid
        gap-4
      ">


      {customers.length === 0 ? (

        <p className="text-slate-400">

          No customers yet.

        </p>


      ) : (


        customers.map((customer)=>(


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