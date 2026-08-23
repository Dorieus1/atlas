import { useState } from "react";
import { useNavigate } from "react-router-dom";


function Login() {


  const navigate = useNavigate();


  const [email,setEmail] = useState("");

  const [password,setPassword] = useState("");

  const [error,setError] = useState("");





  const login = async()=>{


    try {


      const res = await fetch(

        "http://localhost:5050/api/auth/login",

        {

          method:"POST",

          headers:{

            "Content-Type":
            "application/json"

          },

          body:JSON.stringify({

            email,

            password

          })

        }

      );




      const data =
        await res.json();




      if(!res.ok){

        setError(data.error);

        return;

      }




      localStorage.setItem(

        "token",

        data.token

      );



      localStorage.setItem(

        "business_id",

        data.user.business_id

      );



      localStorage.setItem(

        "user",

        JSON.stringify(data.user)

      );



      navigate("/");


    } catch(error){


      setError(error.message);


    }


  };






  return (

    <div className="
      max-w-md
      mx-auto
      p-8
    ">


      <h1 className="
        text-3xl
        font-bold
        mb-6
      ">

        🔐 Login to Atlas

      </h1>




      {error && (

        <p className="
          text-red-400
          mb-4
        ">

          {error}

        </p>

      )}






      <input

        placeholder="Email"

        value={email}

        onChange={(e)=>setEmail(e.target.value)}

        className="
          w-full
          mb-4
          bg-slate-800
          rounded-lg
          p-3
        "

      />





      <input

        type="password"

        placeholder="Password"

        value={password}

        onChange={(e)=>setPassword(e.target.value)}

        className="
          w-full
          mb-4
          bg-slate-800
          rounded-lg
          p-3
        "

      />





      <button

        onClick={login}

        className="
          bg-blue-600
          px-6
          py-3
          rounded-lg
          cursor-pointer
        "

      >

        Login

      </button>



    </div>

  );


}


export default Login;