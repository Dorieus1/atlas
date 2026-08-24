import { Link } from "react-router-dom";

function NotFound() {

  const isLoggedIn = !!localStorage.getItem("token");

  return (

    <div className="min-h-screen flex items-center justify-center p-8 text-center">

      <div>

        <p className="text-6xl font-bold text-slate-700">
          404
        </p>

        <h1 className="text-2xl font-bold mt-4">
          Page not found
        </h1>

        <p className="text-slate-400 mt-2">
          That page doesn't exist, or may have moved.
        </p>

        <Link

          to={isLoggedIn ? "/dashboard" : "/"}

          className="inline-block mt-6 bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg"

        >
          {isLoggedIn ? "Back to Dashboard" : "Back Home"}
        </Link>

      </div>

    </div>

  );

}

export default NotFound;
