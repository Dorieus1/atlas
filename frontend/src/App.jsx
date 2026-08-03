import { useEffect, useState } from "react";
import ChatWindow from "./components/ChatWindow";
import BusinessSelector from "./components/BusinessSelector";
import CustomerSelector from "./components/CustomerSelector";
import CustomerForm from "./components/CustomerForm";
import "./App.css";


function App() {

  const [businesses, setBusinesses] = useState([]);

  const [customers, setCustomers] = useState([]);

  const [selectedBusiness, setSelectedBusiness] = useState(null);

  const [selectedCustomer, setSelectedCustomer] = useState(null);



  const loadCustomers = async () => {

    const response = await fetch(
      "http://localhost:5050/api/customers"
    );


    const data = await response.json();


    setCustomers(data);


  };



  useEffect(() => {


    fetch("http://localhost:5050/api/business")

      .then((res) => res.json())

      .then((data) => {

        setBusinesses(data);


        if (data.length > 0) {

          setSelectedBusiness(data[0]);

        }

      });



    loadCustomers();



  }, []);





  return (

    <div className="dashboard">


      <header className="header">

        <h1>Atlas AI</h1>

        <p>
          Business Intelligence Dashboard
        </p>

      </header>




      <main className="cards">



        <BusinessSelector

          setBusiness={setSelectedBusiness}

        />




        <CustomerSelector

          business={selectedBusiness}

          customers={customers}

          setCustomer={setSelectedCustomer}

        />




        <CustomerForm

          business={selectedBusiness}

          onCustomerCreated={() => {

            loadCustomers();

          }}

        />




        <ChatWindow

          business={selectedBusiness}

          customer={selectedCustomer}

        />



      </main>


    </div>

  );


}


export default App;