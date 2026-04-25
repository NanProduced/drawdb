import { Router } from "express";
import { testConnection, getDatabaseStructure } from "../services/postgres.js";

const router = Router();

function validateConnectionParams(req, res, next) {
  const { host, port, database, user, password } = req.body;
  const errors = [];

  if (!host || typeof host !== "string" || host.trim() === "") {
    errors.push("Host is required and must be a non-empty string");
  }

  if (!port) {
    errors.push("Port is required");
  } else if (isNaN(parseInt(port, 10)) || parseInt(port, 10) < 1 || parseInt(port, 10) > 65535) {
    errors.push("Port must be a valid number between 1 and 65535");
  }

  if (!database || typeof database !== "string" || database.trim() === "") {
    errors.push("Database name is required and must be a non-empty string");
  }

  if (!user || typeof user !== "string" || user.trim() === "") {
    errors.push("Username is required and must be a non-empty string");
  }

  if (password === undefined || password === null) {
    errors.push("Password is required");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        type: "ValidationError",
        message: "Invalid connection parameters",
        code: 400,
        details: errors,
      },
    });
  }

  next();
}

router.post("/test", validateConnectionParams, async (req, res, next) => {
  try {
    const result = await testConnection(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/structure", validateConnectionParams, async (req, res, next) => {
  try {
    const result = await getDatabaseStructure(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
