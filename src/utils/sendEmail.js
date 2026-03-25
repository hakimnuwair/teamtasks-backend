import nodemailer from "nodemailer";

// ─── Lazy transporter — created on first use, not at import time ──────────────
// This ensures dotenv has already loaded before we read process.env values.
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

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

        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;" />
        <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">
          Can't click the link? Copy and paste this token into the reset form:
        </p>
        <code style="
          display: inline-block;
          padding: 10px 16px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 13px;
          letter-spacing: 0.5px;
          color: #0f172a;
          word-break: break-all;
        ">${resetToken}</code>

        <p style="margin-top: 20px; font-size: 12px; color: #94a3b8;">
          If you didn't request this, ignore this email.
        </p>
      `,
    });
    console.log("[sendEmail] Sent messageId:", info.messageId);
  } catch (err) {
    console.error("[sendEmail] Failed :", err.message);
    throw err;
  }
};
