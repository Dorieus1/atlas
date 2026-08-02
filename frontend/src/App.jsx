import { useEffect, useState } from "react";
import ChatWindow from "./components/ChatWindow";
import BusinessSelector from "./components/BusinessSelector";
import "./App.css";


function App() {

  const [businesses, setBusinesses] = useState([]);

  const [customers, setCustomers] = useState([]);

  const [conversations, setConversations] = useState([]);

  const [knowledge, setKnowledge] = useState([]);

  const [knowledgeTitle, setKnowledgeTitle] = useState("");

  const [knowledgeContent, setKnowledgeContent] = useState("");

  const [selectedBusiness, setSelectedBusiness] = useState(null);



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
      .then((data) => setConversations(data));


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



        <div className="card">

          <h2>Businesses</h2>


          {businesses.map((business) => (

            <p key={business.id}>

              {business.name}

            </p>

          ))}


        </div>




        <div className="card">

          <h2>Customers</h2>


          {customers.map((customer) => (

            <p key={customer.id}>

              {customer.name}

              <br />

              {customer.email}

            </p>

          ))}


        </div>




        <div className="card">

          <h2>Conversations</h2>


          {conversations.map((conversation) => (

            <div key={conversation.id}>

              <p>
                {conversation.message}
              </p>

              <p>
                {conversation.response}
              </p>


            </div>

          ))}


        </div>




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
        />


      </main>


    </div>

  );

}


export default App;