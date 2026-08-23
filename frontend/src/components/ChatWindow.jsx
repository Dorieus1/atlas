import { useState, useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";

function ChatWindow({ business, customer }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!customer) {
      setMessages([]);
      return;
    }

    const token = localStorage.getItem("token");

    fetch(
      `http://localhost:5050/api/conversations/${customer.id}`,
      {
        headers: {
          ...(token
            ? {
                Authorization: `Bearer ${token}`
              }
            : {})
        }
      }
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load conversations");
        }

        return res.json();
      })
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
      })
      .catch((error) => {
        console.error(
          "CONVERSATION LOAD ERROR:",
          error
        );

        setMessages([]);
      });
  }, [customer]);



  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, isTyping]);



  const handleSend = async () => {
    if (
      !message.trim() ||
      !business ||
      !customer ||
      isTyping
    ) {
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
      const token = localStorage.getItem("token");

      const response = await fetch(
        "http://localhost:5050/api/chat",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            ...(token
              ? {
                  Authorization: `Bearer ${token}`
                }
              : {})
          },

          body: JSON.stringify({
            business_id: business.id,
            customer_id: customer.id,
            message: userMessage
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Chat request failed"
        );
      }

      setMessages((previous) => [
        ...previous,
        {
          text: data.reply,
          sender: "atlas"
        }
      ]);
    } catch (error) {
      console.error(
        "ATLAS CHAT ERROR:",
        error
      );

      setMessages((previous) => [
        ...previous,
        {
          text:
            "Atlas couldn't process that message. Check the backend terminal for the error.",
          sender: "atlas"
        }
      ]);
    } finally {
      setIsTyping(false);
    }
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

        {customer && (
          <div>
            Customer: {customer.name}
          </div>
        )}
      </h2>



      <div
        style={{
          height: "400px",
          border: "1px solid #ccc",
          padding: "10px",
          marginBottom: "10px",
          overflowY: "auto"
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
          padding: "10px"
        }}
      />



      <button
        onClick={handleSend}
        disabled={isTyping}
        style={{
          marginLeft: "10px",
          padding: "10px"
        }}
      >
        {isTyping ? "Sending..." : "Send"}
      </button>

    </div>
  );
}

export default ChatWindow;