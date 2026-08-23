import { useEffect, useState } from "react";


function CustomerTimeline({ customer }) {

  const [notes, setNotes] = useState([]);


  useEffect(() => {

    if (!customer) {

      setNotes([]);

      return;

    }


    fetch(
      `http://localhost:5050/api/notes/${customer.id}`
    )
      .then((res) => res.json())
      .then((data) => {

        setNotes(data);

      })
      .catch(console.error);


  }, [customer]);



  if (!customer) {

    return null;

  }



  return (

    <div className="card">


      <h2>
        Customer Timeline
      </h2>


      <h3>
        {customer.name || "Unknown Customer"}
      </h3>


      <p>
        {customer.email || "No email"}
      </p>



      <h4>
        📝 Notes
      </h4>



      {notes.length === 0 && (

        <p>
          No notes yet.
        </p>

      )}



      {notes.map((note) => (

        <div

          key={note.id}

          style={{

            borderBottom: "1px solid #ddd",

            padding: "8px 0"

          }}

        >

          <p>
            {note.note}
          </p>


          <small>
            {note.created_at}
          </small>


        </div>

      ))}



    </div>

  );

}


export default CustomerTimeline;