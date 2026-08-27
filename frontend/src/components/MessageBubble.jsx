function MessageBubble({ message }) {

  const isUser = message.sender === "user";

  return (

    <div className={`flex mb-3 ${isUser ? "justify-end" : "justify-start"}`}>

      <div className={`
        max-w-[80%]
        p-3
        rounded-xl
        ${isUser ? "bg-brand-600 text-white" : "bg-surface-muted text-fg"}
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
