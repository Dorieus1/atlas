import Logo from "./Logo";

function AuthHeader() {

  return (

    <div className="mb-8 flex flex-col items-center text-center">

      <Logo size={40} />

      <h1 className="font-display text-2xl font-bold mt-3">
        Atlas
      </h1>

      <p className="text-fg-muted mt-1">
        The AI receptionist and CRM built for small businesses.
      </p>

    </div>

  );

}

export default AuthHeader;
