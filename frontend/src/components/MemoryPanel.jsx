import { useEffect, useState } from "react";


function MemoryPanel({ customer }) {


  const [memories, setMemories] = useState([]);

  const [memory, setMemory] = useState("");




  const loadMemories = async () => {


    if (!customer) {

      setMemories([]);

      return;

    }



    const response = await fetch(

      `http://localhost:5050/api/memories/${customer.id}`

    );


    const data = await response.json();


    setMemories(data);


  };




  useEffect(() => {

    loadMemories();

  }, [customer]);






  const addMemory = async () => {


    if (!customer || !memory.trim()) {

      return;

    }



    await fetch(

      "http://localhost:5050/api/memories",

      {


        method: "POST",


        headers: {

          "Content-Type": "application/json",

        },


        body: JSON.stringify({

          customer_id: customer.id,

          memory,

        }),


      }

    );



    setMemory("");

    loadMemories();


  };






  return (

    <div className="card">


      <h2>

        Customer Memories

      </h2>



      {customer ? (

        <>

          <p>

            Customer: {customer.name}

          </p>



          <input

            placeholder="Add memory..."

            value={memory}

            onChange={(e) =>

              setMemory(e.target.value)

            }

          />



          <button onClick={addMemory}>

            Save Memory

          </button>




          {memories.map((item) => (

            <p key={item.id}>

              🧠 {item.memory}

            </p>

          ))}



        </>


      ) : (

        <p>Select a customer</p>

      )}



    </div>

  );


}


export default MemoryPanel;