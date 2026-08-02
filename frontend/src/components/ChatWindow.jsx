import { useState, useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";


function ChatWindow({ business }) {

  const [message, setMessage] = useState("");

  const [messages, setMessages] = useState([]);

  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef(null);



  useEffect(() => {

    if (!business) {
      return;
    }


    fetch(
      "http://localhost:5050/api/conversations/e8eb16b3-90ae-4ffa-a7c1-b826c8b57ba0"
    )
      .then((res) => res.json())
      .then((data) => {

        const loadedMessages = [];


        data.forEach((item) => {

          loadedMessages.push({

            text: item.message,

            sender: "user"

          });



          if (item.response) {

            loadedMessages.push({

              text: item.response,

              sender: "atlas"

            });

          }


        });


        setMessages(loadedMessages);


      });


  }, [business]);




  useEffect(() => {

    messagesEndRef.current?.scrollIntoView({

      behavior: "smooth",

    });


  }, [messages, isTyping]);





  const handleSend = async () => {


    if (!message.trim() || !business) {

      return;

    }



    const userMessage = message;



    setMessages((previous) => [

      ...previous,

      {

        text: userMessage,

        sender: "user"

      }

    ]);



    setMessage("");

    setIsTyping(true);




    try {


      const response = await fetch(

        "http://localhost:5050/api/chat",

        {

          method: "POST",


          headers: {

            "Content-Type": "application/json",

          },


          body: JSON.stringify({

            business_id: business.id,


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



    } catch (error) {


      setMessages((previous) => [

        ...previous,


        {

          text: "I couldn't connect right now.",

          sender: "atlas"

        }


      ]);



    }



    setIsTyping(false);


  };





  return (

    <div className="card">


      <h2>

        Atlas Chat

        {business && (

          <span>

            {" "} - {business.name}

          </span>

        )}

      </h2>




      <div

        style={{

          height: "400px",

          border: "1px solid #ccc",

          padding: "10px",

          marginBottom: "10px",

          overflowY: "auto",

        }}

      >



        {messages.map((msg, index) => (

          <MessageBubble

            key={index}

            message={msg}

          />


        ))}




        {isTyping && (

          <div>

            Atlas is typing...

          </div>

        )}




        <div ref={messagesEndRef} />



      </div>





      <input


        type="text"


        placeholder="Type a message..."


        value={message}


        onChange={(e) =>

          setMessage(e.target.value)

        }



        onKeyDown={(e) => {


          if (e.key === "Enter") {

            handleSend();

          }


        }}



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


}


export default ChatWindow;