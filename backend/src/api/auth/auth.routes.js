import { Router } from "express";

import { authenticate } from "../../middleware/auth.js";
import { authService } from "../../services/auth.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body ?? {});
    res.status(201).json(result);
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body ?? {});
    res.json(result);
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const header = req.get("authorization");
    const token = header && header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
    await authService.logout(token);
    res.status(204).send();
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ id: req.user.id, name: req.user.name, email: req.user.email });
  }),
);
