const {
  createUser,
  findUserByEmail,
  setResetToken,
  findUserByResetToken,
  resetPasswordByUserId,
  countUsersByBusiness,
  getUsersByBusiness,
  getUserById,
  getUserByIdWithPassword,
  deleteUser
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


    const existingUsers = await countUsersByBusiness(business_id);

    if (existingUsers > 0) {

      return res.status(403).json({

        error:
        "This business already has an account. Ask a teammate to add you from Settings instead."

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

      error: "Something went wrong. Please try again."

    });


  }


};







const login = async (req,res)=>{


  try {


    const {

      email,

      password

    } = req.body;



    if (!email || !password) {

      return res.status(400).json({

        error:
        "Email and password are required"

      });

    }



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

      error: "Something went wrong. Please try again."

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

      error: "Something went wrong. Please try again."

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

      error: "Something went wrong. Please try again."

    });


  }


};



const listTeammates = async (req, res) => {


  try {


    const users = await getUsersByBusiness(req.user.business_id);

    res.json(users);


  } catch (error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



const inviteTeammate = async (req, res) => {


  try {


    const {

      name,

      email,

      password

    } = req.body;


    if (!name || !name.trim() || !email || !email.trim() || !password) {

      return res.status(400).json({

        error: "Name, email, and password are required"

      });

    }


    if (password.length < 6) {

      return res.status(400).json({

        error: "Password must be at least 6 characters"

      });

    }


    const userId = await createUser(

      req.user.business_id,

      name.trim(),

      email,

      password

    );


    res.status(201).json({

      id: userId,

      message: "Teammate added"

    });


  } catch (error) {


    console.error(error);


    if (error.message && error.message.includes("UNIQUE constraint failed: users.email")) {

      return res.status(409).json({

        error: "That email is already registered"

      });

    }


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



const removeTeammate = async (req, res) => {


  try {


    const { id } = req.params;


    const target = await getUserById(id, req.user.business_id);

    if (!target) {

      return res.status(404).json({

        error: "Teammate not found"

      });

    }


    if (id === req.user.id) {

      return res.status(400).json({

        error: "You can't remove your own login"

      });

    }


    const remaining = await countUsersByBusiness(req.user.business_id);

    if (remaining <= 1) {

      return res.status(400).json({

        error: "A business must have at least one login"

      });

    }


    await deleteUser(id, req.user.business_id);


    res.json({

      message: "Teammate removed"

    });


  } catch (error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



const changePassword = async (req, res) => {


  try {


    const {

      currentPassword,

      newPassword

    } = req.body;


    if (!currentPassword || !newPassword) {

      return res.status(400).json({

        error: "Current password and new password are required"

      });

    }


    if (newPassword.length < 6) {

      return res.status(400).json({

        error: "New password must be at least 6 characters"

      });

    }


    const user = await getUserByIdWithPassword(req.user.id);

    if (!user) {

      return res.status(404).json({

        error: "User not found"

      });

    }


    const valid = await bcrypt.compare(currentPassword, user.password);

    if (!valid) {

      return res.status(401).json({

        error: "Current password is incorrect"

      });

    }


    await resetPasswordByUserId(req.user.id, newPassword);


    res.json({

      message: "Password updated"

    });


  } catch (error) {


    console.error(error);


    res.status(500).json({

      error: "Something went wrong. Please try again."

    });


  }


};



module.exports = {

  register,

  login,

  forgotPassword,

  resetPassword,

  listTeammates,

  inviteTeammate,

  removeTeammate,

  changePassword

};