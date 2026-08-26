import { useState, useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import MessageBubble from "./MessageBubble";
import { API_BASE, handleSessionExpired } from "../api/atlasApi";

function ChatWindow({ business, customer }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!customer) {
      setMessages([]);
      setHistoryError("");
      return;
    }

    setHistoryError("");
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
          if (handleSessionExpired(res)) {
            throw new Error("Session expired");
          }

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
        setHistoryError("Couldn't load this conversation's history. Please refresh to try again.");
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

      if (!response.ok && handleSessionExpired(response)) {
        return;
      }

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
    <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6">

      <h2 className="text-2xl font-bold flex items-center gap-2">
        <MessageSquare size={22} />
        Atlas Chat

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



      {historyError && (
        <p className="mt-3 text-red-400">
          {historyError}
        </p>
      )}

      <div className="mt-4 h-[400px] border border-ink-700 rounded-xl p-3 overflow-y-auto">

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
          aria-label="Type a message"
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
          className="flex-1 bg-ink-800 text-white placeholder:text-slate-500 border border-ink-700 rounded-lg p-3"
        />

        <button
          onClick={handleSend}
          disabled={isTyping}
          className="bg-brand-600 hover:bg-brand-500 px-5 py-2 rounded-lg disabled:opacity-50"
        >
          {isTyping ? "Sending..." : "Send"}
        </button>

      </div>

    </div>
  );
}

export default ChatWindow;
