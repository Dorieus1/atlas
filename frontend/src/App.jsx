import { useEffect, useState } from "react";
import "./App.css";

import BusinessSelector from "./components/BusinessSelector";
import CustomerSelector from "./components/CustomerSelector";
import ChatWindow from "./components/ChatWindow";

function App() {

  const [business, setBusiness] = useState(null);

  const [customers, setCustomers] = useState([]);

  const [customer, setCustomer] = useState(null);


  useEffect(() => {

    fetch("http://localhost:5050/api/customers")
      .then((res) => res.json())
      .then((data) => {

        setCustomers(data);

      });


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
          setBusiness={setBusiness}
        />



        <CustomerSelector

          business={business}

          customers={customers}

          setCustomer={setCustomer}

        />



        <ChatWindow

          business={business}

          customer={customer}

        />


      </main>


    </div>

  );

}


export default App;