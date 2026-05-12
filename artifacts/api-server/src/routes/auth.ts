import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.get("/login", (_req: Request, res: Response) => {
  res.redirect("/login");
});

router.get("/callback", (_req: Request, res: Response) => {
  res.redirect("/dashboard");
});

router.get("/logout", (_req: Request, res: Response) => {
  res.redirect("/");
});

router.post("/mobile-auth/token-exchange", (_req: Request, res: Response) => {
  res
    .status(501)
    .json({ error: "Mobile token exchange is not enabled in this deployment." });
});

router.post("/mobile-auth/logout", (_req: Request, res: Response) => {
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
