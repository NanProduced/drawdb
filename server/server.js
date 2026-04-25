/* eslint-env node */
import express from "express";
import cors from "cors";
import postgresRoutes from "./routes/postgres.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/postgres", postgresRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Error:", err.message);

  const errorResponse = {
    success: false,
    error: {
      type: err.type || "InternalError",
      message: err.message || "An unexpected error occurred",
      code: err.code || 500,
    },
  };

  if (process.env.NODE_ENV === "development") {
    errorResponse.error.stack = err.stack;
  }

  res.status(err.statusCode || 500).json(errorResponse);
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      type: "NotFound",
      message: "Endpoint not found",
      code: 404,
    },
  });
});

app.listen(PORT, () => {
  console.log(`DrawDB Backend Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`PostgreSQL API: http://localhost:${PORT}/api/postgres`);
});

export default app;
