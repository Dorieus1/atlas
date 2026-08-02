function MessageBubble({ message }) {

  const isUser = message.sender === "user";

  return (

    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "10px",
      }}
    >

      <div
        style={{
          maxWidth: "70%",
          padding: "10px",
          borderRadius: "12px",
          background: isUser ? "#007bff" : "#e5e5e5",
          color: isUser ? "white" : "black",
        }}
      >

        <strong>
          {isUser ? "You" : "Atlas"}
        </strong>

        <p style={{ margin: "5px 0 0 0" }}>
          {message.text}
        </p>

      </div>

    </div>

  );

}

export default MessageBubble;