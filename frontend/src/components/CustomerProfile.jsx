import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  getCustomer,
  getCustomerSummary,
  getConversations,
  getCustomerLead,
  getNotes,
  createNote,
  updateLeadStatus
} from "../api/atlasApi";


function CustomerProfile() {


  const { id } = useParams();


  const [customer, setCustomer] = useState(null);

  const [summary, setSummary] = useState("");

  const [conversations, setConversations] = useState([]);

  const [lead, setLead] = useState(null);

  const [notes, setNotes] = useState([]);

  const [newNote, setNewNote] = useState("");




  useEffect(() => {

    loadCustomer();

    loadSummary();

    loadConversations();

    loadLead();

    loadNotes();

  }, [id]);






  const loadCustomer = async () => {

    try {

      const data = await getCustomer(id);

      setCustomer(data);


    } catch(error) {

      console.error(
        "CUSTOMER ERROR:",
        error
      );

    }

  };







  const loadSummary = async () => {

    try {

      const data =
        await getCustomerSummary(id);


      setSummary(
        data.summary || ""
      );


    } catch(error) {

      console.error(
        "SUMMARY ERROR:",
        error
      );

    }

  };







  const loadConversations = async () => {

    try {

      const data =
        await getConversations(id);


      setConversations(data);


    } catch(error) {

      console.error(
        "CONVERSATION ERROR:",
        error
      );

    }

  };







  const loadLead = async () => {

    try {

      const data =
        await getCustomerLead(id);


      setLead(data);


    } catch(error) {

      console.error(
        "LEAD ERROR:",
        error
      );

    }

  };







  const loadNotes = async () => {

    try {

      const data =
        await getNotes(id);


      setNotes(data);


    } catch(error) {

      console.error(
        "NOTES ERROR:",
        error
      );

    }

  };








  const addNote = async () => {


    if (!newNote.trim()) {

      return;

    }



    await createNote(

      id,

      newNote

    );



    setNewNote("");

    loadNotes();


  };







  const updateStatus = async (status) => {


    if (!lead) {

      return;

    }



    await updateLeadStatus(

      lead.id,

      status

    );



    setLead({

      ...lead,

      status

    });


  };







  if (!customer) {


    return (

      <div className="p-8">

        Loading...

      </div>

    );


  }






  return (

    <div className="p-8 space-y-8">


      <div>

        <h1 className="text-3xl font-bold">

          👤 {customer.name}

        </h1>


        <p className="text-slate-400">

          {customer.email}

        </p>


      </div>






      <div className="bg-slate-800 rounded-xl p-6">


        <h2 className="text-xl font-bold">

          🧠 AI Customer Summary

        </h2>



        <p className="mt-4 whitespace-pre-wrap">

          {summary || "Generating summary..."}

        </p>


      </div>








      <div className="bg-slate-800 rounded-xl p-6">


        <h2 className="text-xl font-bold">

          🔥 Lead Information

        </h2>




        {lead ? (

          <div className="mt-4 space-y-3">


            <p>

              <strong>Status:</strong> {lead.status}

            </p>



            <p>

              <strong>Priority:</strong> {lead.priority}

            </p>



            <p>

              <strong>Interest:</strong> {lead.interest}

            </p>




            <select

              value={lead.status}

              onChange={(e)=>
                updateStatus(e.target.value)
              }

              className="bg-slate-900 rounded-lg p-3"

            >

              <option value="new">
                New
              </option>

              <option value="contacted">
                Contacted
              </option>

              <option value="qualified">
                Qualified
              </option>

              <option value="closed">
                Closed
              </option>


            </select>



          </div>


        ) : (


          <p className="mt-4 text-slate-400">

            No lead found.

          </p>


        )}


      </div>








      <div className="bg-slate-800 rounded-xl p-6">


        <h2 className="text-xl font-bold">

          📝 Notes

        </h2>




        <div className="flex gap-3 mt-4">


          <input

            value={newNote}

            onChange={(e)=>
              setNewNote(e.target.value)
            }

            placeholder="Add a note..."

            className="flex-1 bg-slate-900 rounded-lg p-3"

          />



          <button

            onClick={addNote}

            className="bg-blue-600 px-5 rounded-lg"

          >

            Add

          </button>



        </div>





        {notes.map((note)=>(


          <div

            key={note.id}

            className="bg-slate-900 rounded-lg p-4 mt-4"

          >

            {note.note}

          </div>


        ))}


      </div>








      <div className="bg-slate-800 rounded-xl p-6">


        <h2 className="text-xl font-bold">

          💬 Conversation History

        </h2>





        {conversations.map((conversation)=>(


          <div

            key={conversation.id}

            className="mt-5 space-y-2"

          >


            <div className="bg-slate-900 rounded-lg p-4">

              <strong>
                Customer
              </strong>

              <p>
                {conversation.message}
              </p>

            </div>





            <div className="bg-blue-900 rounded-lg p-4">

              <strong>
                Atlas
              </strong>

              <p>
                {conversation.response}
              </p>

            </div>


          </div>


        ))}


      </div>




    </div>

  );


}


export default CustomerProfile;