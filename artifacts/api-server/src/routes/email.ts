import { Router } from "express";
import { Resend } from "resend";

const router = Router();

router.post("/send-test-email", async (_req, res) => {
  const apiKey = process.env["RESEND_API_KEY"];

  if (!apiKey) {
    return res.status(500).json({ error: "RESEND_API_KEY is not configured." });
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: "wehbedave@gmail.com",
    subject: "Hello World",
    html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
  });

  if (error) {
    return res.status(502).json({ error });
  }

  return res.json({ data });
});

export default router;
