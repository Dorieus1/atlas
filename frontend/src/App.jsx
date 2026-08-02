import { useEffect, useState } from "react";
import ChatWindow from "./components/ChatWindow";
import BusinessSelector from "./components/BusinessSelector";
import CustomerSelector from "./components/CustomerSelector";
import "./App.css";


function App() {

  const [businesses, setBusinesses] = useState([]);

  const [customers, setCustomers] = useState([]);

  const [conversations, setConversations] = useState([]);

  const [knowledge, setKnowledge] = useState([]);

  const [knowledgeTitle, setKnowledgeTitle] = useState("");

  const [knowledgeContent, setKnowledgeContent] = useState("");

  const [selectedBusiness, setSelectedBusiness] = useState(null);

  const [selectedCustomer, setSelectedCustomer] = useState(null);



  useEffect(() => {

    fetch("http://localhost:5050/api/business")
      .then((res) => res.json())
      .then((data) => {

        setBusinesses(data);

        if (data.length > 0) {

          setSelectedBusiness(data[0]);

        }

      });



    fetch("http://localhost:5050/api/customers")
      .then((res) => res.json())
      .then((data) => setCustomers(data));



    fetch("http://localhost:5050/api/conversations")
      .then((res) => res.json())
      .then((data) => setConversations());


  }, []);




  useEffect(() => {

    if (!selectedBusiness) {
      return;
    }


    fetch(
      `http://localhost:5050/api/knowledge/${selectedBusiness.id}`
    )
      .then((res) => res.json())
      .then((data) => setKnowledge(data));


  }, [selectedBusiness]);





  const addKnowledge = async () => {


    await fetch(
      "http://localhost:5050/api/knowledge",
      {

        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({

          business_id: selectedBusiness.id,

          title: knowledgeTitle,

          content: knowledgeContent,

        }),

      }
    );


    setKnowledgeTitle("");

    setKnowledgeContent("");



    fetch(
      `http://localhost:5050/api/knowledge/${selectedBusiness.id}`
    )
      .then((res) => res.json())
      .then((data) => setKnowledge(data));


  };




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

          setCustomer={setSelectedCustomer}

        />



        <div className="card">

          <h2>Knowledge Base</h2>


          <input

            placeholder="Title"

            value={knowledgeTitle}

            onChange={(e) =>
              setKnowledgeTitle(e.target.value)
            }

          />


          <textarea

            placeholder="Information"

            value={knowledgeContent}

            onChange={(e) =>
              setKnowledgeContent(e.target.value)
            }

          />


          <button onClick={addKnowledge}>

            Add Knowledge

          </button>


          {knowledge.map((item) => (

            <div key={item.id}>

              <strong>
                {item.title}
              </strong>

              <p>
                {item.content}
              </p>

            </div>

          ))}


        </div>




        <ChatWindow

          business={selectedBusiness}

          customer={selectedCustomer}

        />



      </main>


    </div>

  );


}


export default App;