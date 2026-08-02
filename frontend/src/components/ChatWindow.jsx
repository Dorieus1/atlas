import { useState } from "react";

function ChatWindow() {

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);


  const handleSend = async () => {

  if (message.trim() === "") {
    return;
  }


  const userMessage = message;


  setMessages([
    ...messages,
    {
      text: userMessage,
      sender: "user"
    }
  ]);


  setMessage("");


  const response = await fetch(
    "http://localhost:5050/api/chat",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({

        business_id:
          "ec5380e6-2f6e-4e33-a5be-5db735a89e83",

        customer_id:
          "e8eb16b3-90ae-4ffa-a7c1-b826c8b57ba0",

        message: userMessage,

      }),

    }
  );


  const data = await response.json();


  setMessages((previous) => [

    ...previous,

    {
      text: data.reply,
      sender: "atlas"
    }

  ]);

};

    if (message.trim() === "") {
      return;
    }


    setMessages([
      ...messages,
      {
        text: message,
        sender: "user"
      }
    ]);


    console.log(message);

    setMessage("");

  };


  return (

    <div className="card">

      <h2>Atlas Chat</h2>


      <div
        style={{
          minHeight: "300px",
          border: "1px solid #ccc",
          padding: "10px",
          marginBottom: "10px",
          overflowY: "auto",
        }}
      >

        <p>
          <strong>Atlas:</strong> Hello! How can I help you today?
        </p>


        {messages.map((msg, index) => (

          <p key={index}>

            <strong>
  {msg.sender === "user" ? "You" : "Atlas"}:
</strong>

{" "}

{msg.text}

          </p>

        ))}


      </div>


      <input

        type="text"

        placeholder="Type a message..."

        value={message}

        onChange={(e) => setMessage(e.target.value)}

        style={{
          width: "80%",
          padding: "10px",
        }}

      />


      <button

        onClick={handleSend}

        style={{
          marginLeft: "10px",
          padding: "10px",
        }}

      >

        Send

      </button>


    </div>

  );




export default ChatWindow;