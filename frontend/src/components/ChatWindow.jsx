import { useState, useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import { API_BASE } from "../api/atlasApi";

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
      `${API_BASE}/api/conversations/${customer.id}`,
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
        `${API_BASE}/api/chat`,
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
            "Atlas couldn't send that message right now. Please try again in a moment.",
          sender: "atlas"
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };



  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-2xl font-bold">
        💬 Atlas Chat

        {business && (
          <span className="font-normal text-slate-400">
            {" "} - {business.name}
          </span>
        )}
      </h2>

      {customer && (
        <p className="text-slate-400 mt-1">
          Customer: {customer.name}
        </p>
      )}



      <div className="mt-4 h-[400px] border border-slate-800 rounded-xl p-3 overflow-y-auto">

        {messages.map((msg, index) => (
          <MessageBubble
            key={index}
            message={msg}
          />
        ))}



        {isTyping && (
          <p className="text-slate-400 text-sm">
            Atlas is typing...
          </p>
        )}



        <div ref={messagesEndRef} />

      </div>



      <div className="flex gap-3 mt-4">

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
          className="flex-1 bg-slate-800 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg p-3"
        />

        <button
          onClick={handleSend}
          disabled={isTyping}
          className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg disabled:opacity-50"
        >
          {isTyping ? "Sending..." : "Send"}
        </button>

      </div>

    </div>
  );
}

export default ChatWindow;
