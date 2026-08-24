const sendEmail = async ({ to, subject, html }) => {

  const response = await fetch("https://api.resend.com/emails", {

    method: "POST",

    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`
    },

    body: JSON.stringify({
      from: "Atlas <onboarding@resend.dev>",
      to: [to],
      subject,
      html
    })

  });

  if (!response.ok) {

    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Failed to send email");

  }

  return response.json();

};



const sendPasswordResetEmail = async (to, resetUrl) => {

  return sendEmail({

    to,

    subject: "Reset your Atlas password",

    html: `
      <p>Someone requested a password reset for your Atlas account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `

  });

};



module.exports = {
  sendEmail,
  sendPasswordResetEmail
};
