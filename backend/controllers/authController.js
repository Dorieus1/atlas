const {
  createUser,
  findUserByEmail,
  setResetToken,
  findUserByResetToken,
  resetPasswordByUserId
} = require("../services/authService");

const {
  sendPasswordResetEmail
} = require("../services/emailService");


const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");



const register = async (req,res)=>{


  try {


    const {

      business_id,

      name,

      email,

      password

    } = req.body;




    if(
      !business_id ||
      !email ||
      !password
    ){

      return res.status(400).json({

        error:
        "business_id, email, and password required"

      });

    }





    const userId =
      await createUser(

        business_id,

        name,

        email,

        password

      );





    res.json({

      id:userId,

      message:
      "User created"

    });





  } catch(error){


    console.error(error);


    if (error.message && error.message.includes("UNIQUE constraint failed: users.email")) {

      return res.status(409).json({

        error: "That email is already registered"

      });

    }


    res.status(500).json({

      error:error.message

    });


  }


};







const login = async (req,res)=>{


  try {


    const {

      email,

      password

    } = req.body;





    const user =
      await findUserByEmail(email);





    if(!user){

      return res.status(404).json({

        error:
        "User not found"

      });

    }






    const valid =
      await bcrypt.compare(

        password,

        user.password

      );





    if(!valid){

      return res.status(401).json({

        error:
        "Invalid password"

      });

    }





    const token =
      jwt.sign(

        {

          id:user.id,

          business_id:user.business_id

        },

        process.env.JWT_SECRET,

        {

          expiresIn:"7d"

        }

      );





    res.json({

      token,

      user:{

        id:user.id,

        name:user.name,

        email:user.email,

        business_id:user.business_id

      }

    });






  } catch(error){


    console.error(error);


    res.status(500).json({

      error:error.message

    });


  }


};





const forgotPassword = async (req, res) => {


  try {


    const {

      email

    } = req.body;


    if (!email || !email.trim()) {

      return res.status(400).json({

        error:
        "Email is required"

      });

    }


    const token = await setResetToken(email);


    if (token) {

      const resetUrl =
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${token}`;

      try {

        await sendPasswordResetEmail(email.trim(), resetUrl);

      } catch (emailError) {

        console.error(
          "PASSWORD RESET EMAIL ERROR:",
          emailError
        );

      }

    }


    res.json({

      message:
      "If that email exists, a reset link has been sent."

    });


  } catch (error) {


    console.error(error);


    res.status(500).json({

      error:error.message

    });


  }


};



const resetPassword = async (req, res) => {


  try {


    const {

      token,

      password

    } = req.body;


    if (!token || !password || password.length < 6) {

      return res.status(400).json({

        error:
        "A valid token and a password of at least 6 characters are required"

      });

    }


    const user = await findUserByResetToken(token);


    if (!user) {

      return res.status(400).json({

        error:
        "Invalid or expired reset link"

      });

    }


    await resetPasswordByUserId(user.id, password);


    res.json({

      message:
      "Password updated. You can now log in with your new password."

    });


  } catch (error) {


    console.error(error);


    res.status(500).json({

      error:error.message

    });


  }


};



module.exports = {

  register,

  login,

  forgotPassword,

  resetPassword

};