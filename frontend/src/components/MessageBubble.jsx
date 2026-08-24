function MessageBubble({ message }) {

  const isUser = message.sender === "user";

  return (

    <div className={`flex mb-3 ${isUser ? "justify-end" : "justify-start"}`}>

      <div className={`
        max-w-[80%]
        p-3
        rounded-xl
        ${isUser ? "bg-blue-600 text-white" : "bg-slate-800 text-white"}
      `}>

        <strong className="text-sm opacity-80">
          {isUser ? "You" : "Atlas"}
        </strong>

        <p className="mt-1 whitespace-pre-wrap">
          {message.text}
        </p>

      </div>

    </div>

  );

}

export default MessageBubble;
