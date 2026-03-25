import nodemailer from "nodemailer";

// ─── Lazy transporter — created on first use, not at import time ──────────────
// This ensures dotenv has already loaded before we read process.env values.
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  console.log("[sendEmail] Config check:", {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS ? "SET ✅" : "MISSING ❌",
    clientUrl: process.env.CLIENT_URL,
  });

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
};

export const sendPasswordResetEmail = async (toEmail, resetToken) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  console.log("[sendEmail] Sending to:", toEmail);

  try {
    const info = await getTransporter().sendMail({
      from: `"Your App" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: "Password Reset Request",
      html: `
        <p>You requested a password reset.</p>
        <p>Click the link below to reset your password. It expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>If you didn't request this, ignore this email.</p>
      `,
    });
    console.log("[sendEmail] Sent ✅ messageId:", info.messageId);
  } catch (err) {
    console.error("[sendEmail] Failed ❌:", err.message);
    throw err;
  }
};
