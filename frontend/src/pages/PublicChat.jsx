import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { MessageSquare, Send } from "lucide-react";

import {
  getPublicBusiness,
  startPublicConversation,
  sendPublicMessage,
  getPublicHistory
} from "../api/atlasApi";

import Logo from "../components/Logo";
import MessageBubble from "../components/MessageBubble";


function PublicChat() {

  const { slug } = useParams();

  const [business, setBusiness] = useState(null);
  const [loadingBusiness, setLoadingBusiness] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [customerId, setCustomerId] = useState(null);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [chatError, setChatError] = useState("");

  const messagesEndRef = useRef(null);
  const storageKey = `atlas_public_chat_${slug}`;


  useEffect(() => {

    getPublicBusiness(slug)
      .then((data) => {

        setBusiness(data);

        const saved = sessionStorage.getItem(storageKey);

        if (saved) {

          const parsed = JSON.parse(saved);

          setCustomerId(parsed.customer_id);
          setName(parsed.name || "");

        }

      })
      .catch((error) => {

        console.error("PUBLIC BUSINESS LOAD ERROR:", error);
        setNotFound(true);

      })
      .finally(() => setLoadingBusiness(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);


  useEffect(() => {

    if (!customerId) {
      return;
    }

    getPublicHistory(slug, customerId)
      .then((data) => {

        const loadedMessages = [];

        data.forEach((item) => {

          loadedMessages.push({ text: item.message, sender: "user" });

          if (item.response) {
            loadedMessages.push({ text: item.response, sender: "atlas" });
          }

        });

        setMessages(loadedMessages);

      })
      .catch((error) => {

        console.error("PUBLIC HISTORY LOAD ERROR:", error);

      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);


  useEffect(() => {

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  }, [messages, isTyping]);


  const handleStart = async () => {

    if (!name.trim()) {

      setStartError("Please tell us your name.");
      return;

    }

    if (startingRef.current) {
      return;
    }

    startingRef.current = true;
    setStarting(true);
    setStartError("");

    try {

      const isEmail = contact.includes("@");

      const data = await startPublicConversation(

        slug,

        name.trim(),

        isEmail ? contact.trim() : null,

        !isEmail && contact.trim() ? contact.trim() : null

      );

      sessionStorage.setItem(storageKey, JSON.stringify({
        customer_id: data.customer_id,
        name: name.trim()
      }));

      setCustomerId(data.customer_id);

    } catch (error) {

      console.error("START CONVERSATION ERROR:", error);
      setStartError(error.message || "Couldn't start the chat. Please try again.");

    } finally {

      startingRef.current = false;
      setStarting(false);

    }

  };


  const handleSend = async () => {

    if (!message.trim() || isTyping) {
      return;
    }

    const userMessage = message;

    setMessages((previous) => [...previous, { text: userMessage, sender: "user" }]);
    setMessage("");
    setIsTyping(true);
    setChatError("");

    try {

      const data = await sendPublicMessage(slug, customerId, userMessage);

      setMessages((previous) => [...previous, { text: data.reply, sender: "atlas" }]);

    } catch (error) {

      console.error("PUBLIC CHAT SEND ERROR:", error);

      setMessages((previous) => [
        ...previous,
        { text: "Sorry, that didn't go through. Please try sending it again.", sender: "atlas" }
      ]);

    } finally {

      setIsTyping(false);

    }

  };


  if (loadingBusiness) {

    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <p className="text-slate-500">Loading...</p>
      </div>
    );

  }

  if (notFound) {

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 p-6 text-center">
        <Logo size={40} />
        <h1 className="mt-4 text-xl font-bold">We couldn't find that business</h1>
        <p className="mt-2 text-slate-400">Double check the link and try again.</p>
      </div>
    );

  }

  return (

    <div className="flex min-h-screen items-center justify-center bg-ink-950 p-4 sm:p-6">

      <div className="w-full max-w-lg">

        <div className="mb-6 flex flex-col items-center text-center">

          <Logo size={38} />

          <h1 className="mt-3 font-display text-2xl font-bold">
            {business?.name}
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Chat with us — we usually reply right away.
          </p>

        </div>

        <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-5 sm:p-6">

          {!customerId ? (

            <div>

              <div className="mb-4 flex items-center gap-2 text-slate-300">
                <MessageSquare size={18} className="text-brand-400" />
                <span className="text-sm font-medium">Let's start with your name</span>
              </div>

              {startError && (
                <p className="mb-3 text-sm text-red-400">
                  {startError}
                </p>
              )}

              <input
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mb-3 w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
              />

              <input
                placeholder="Phone or email (optional)"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="mb-4 w-full rounded-lg border border-ink-700 bg-ink-800 p-3 text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
              />

              <button
                onClick={handleStart}
                disabled={starting}
                className="w-full rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                {starting ? "Starting..." : "Start Chat"}
              </button>

            </div>

          ) : (

            <div>

              <div className="h-[400px] overflow-y-auto rounded-xl border border-ink-700 p-3">

                {messages.length === 0 && (
                  <p className="mt-4 text-center text-sm text-slate-500">
                    Say hello — we're here to help.
                  </p>
                )}

                {messages.map((msg, index) => (
                  <MessageBubble key={index} message={msg} />
                ))}

                {isTyping && (
                  <p className="text-sm text-slate-400">Typing...</p>
                )}

                <div ref={messagesEndRef} />

              </div>

              {chatError && (
                <p className="mt-3 text-sm text-red-400">
                  {chatError}
                </p>
              )}

              <div className="mt-4 flex gap-3">

                <input
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSend();
                    }
                  }}
                  className="flex-1 rounded-lg border border-ink-700 bg-ink-800 p-3 text-white placeholder:text-slate-500 focus:border-ink-600 focus:outline-none"
                />

                <button
                  onClick={handleSend}
                  disabled={isTyping}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
                >
                  <Send size={16} />
                </button>

              </div>

            </div>

          )}

        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Powered by Atlas
        </p>

      </div>

    </div>

  );

}

export default PublicChat;
