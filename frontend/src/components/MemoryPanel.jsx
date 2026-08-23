import { useEffect, useState } from "react";


function MemoryPanel({ customer }) {


  const [memories, setMemories] = useState([]);

  const [memory, setMemory] = useState("");

  const [error, setError] = useState("");




  const loadMemories = async () => {


    if (!customer) {

      setMemories([]);

      return;

    }


    try {

      const token = localStorage.getItem("token");

      const response = await fetch(

        `http://localhost:5050/api/memories/${customer.id}`,

        {
          headers: {
            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {})
          }
        }

      );

      if (!response.ok) {

        throw new Error("Failed to load memories");

      }

      const data = await response.json();

      setMemories(data);

    } catch (err) {

      console.error(err);

      setMemories([]);

    }


  };




  useEffect(() => {

    loadMemories();

  }, [customer]);






  const addMemory = async () => {


    if (!customer) {

      return;

    }

    if (!memory.trim()) {

      setError("Memory cannot be empty.");

      return;

    }


    try {

      const token = localStorage.getItem("token");

      const res = await fetch(

        "http://localhost:5050/api/memories",

        {


          method: "POST",


          headers: {

            "Content-Type": "application/json",

            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {})

          },


          body: JSON.stringify({

            customer_id: customer.id,

            memory: memory.trim(),

          }),


        }

      );

      if (!res.ok) {

        const data = await res.json().catch(() => ({}));

        throw new Error(data.error || "Failed to save memory");

      }



      setMemory("");

      setError("");

      loadMemories();

    } catch (err) {

      setError(err.message);

    }


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

          {error && (
            <p style={{ color: "#f87171" }}>
              {error}
            </p>
          )}



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
