import axios from "axios";

const baseUrl = import.meta.env.VITE_POSTGRES_BACKEND_URL || "/api/postgres";

export class PostgresConnectionError extends Error {
  constructor(message, type, code, details) {
    super(message);
    this.type = type;
    this.code = code;
    this.details = details;
    this.name = "PostgresConnectionError";
  }
}

function handleError(error) {
  if (error.response) {
    const { data } = error.response;
    if (data.error) {
      throw new PostgresConnectionError(
        data.error.message || "Connection error",
        data.error.type || "UnknownError",
        data.error.code || error.response.status,
        data.error.details
      );
    }
    throw new PostgresConnectionError(
      error.message || "Connection error",
      "HTTPError",
      error.response.status
    );
  } else if (error.request) {
    throw new PostgresConnectionError(
      "No response received from server. Please ensure the backend is running.",
      "NetworkError",
      "NETWORK_ERROR"
    );
  } else {
    throw new PostgresConnectionError(
      error.message || "Unknown error",
      "UnknownError",
      "UNKNOWN"
    );
  }
}

export async function testConnection(connectionParams) {
  try {
    const response = await axios.post(`${baseUrl}/test`, connectionParams);
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getDatabaseStructure(connectionParams) {
  try {
    const response = await axios.post(`${baseUrl}/structure`, connectionParams);
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

export function formatPostgresTypeToDiagram(dataType, udtName, diagramDb) {
  const typeMappings = {
    postgresql: {
      "integer": "INTEGER",
      "bigint": "BIGINT",
      "smallint": "SMALLINT",
      "boolean": "BOOLEAN",
      "text": "TEXT",
      "varchar": "VARCHAR",
      "character varying": "VARCHAR",
      "bpchar": "CHAR",
      "timestamp without time zone": "TIMESTAMP",
      "timestamp": "TIMESTAMP",
      "timestamp with time zone": "TIMESTAMPTZ",
      "date": "DATE",
      "time without time zone": "TIME",
      "time with time zone": "TIMETZ",
      "real": "REAL",
      "double precision": "DOUBLE PRECISION",
      "numeric": "NUMERIC",
      "decimal": "DECIMAL",
      "json": "JSON",
      "jsonb": "JSONB",
      "uuid": "UUID",
      "bytea": "BYTEA",
      "int4": "INTEGER",
      "int8": "BIGINT",
      "int2": "SMALLINT",
      "float4": "REAL",
      "float8": "DOUBLE PRECISION",
      "timestamptz": "TIMESTAMPTZ",
      "timetz": "TIMETZ",
      "bool": "BOOLEAN",
    },
    mysql: {
      "integer": "INT",
      "bigint": "BIGINT",
      "smallint": "SMALLINT",
      "boolean": "BOOLEAN",
      "text": "TEXT",
      "varchar": "VARCHAR",
      "character varying": "VARCHAR",
      "timestamp": "TIMESTAMP",
      "date": "DATE",
      "time": "TIME",
      "real": "FLOAT",
      "double precision": "DOUBLE",
      "numeric": "DECIMAL",
      "decimal": "DECIMAL",
      "json": "JSON",
      "uuid": "VARCHAR",
      "int4": "INT",
      "int8": "BIGINT",
      "float4": "FLOAT",
      "float8": "DOUBLE",
      "bool": "BOOLEAN",
    },
    generic: {
      "integer": "INTEGER",
      "bigint": "BIGINT",
      "smallint": "SMALLINT",
      "boolean": "BOOLEAN",
      "text": "TEXT",
      "varchar": "VARCHAR",
      "timestamp": "TIMESTAMP",
      "date": "DATE",
      "time": "TIME",
      "real": "REAL",
      "double precision": "DOUBLE",
      "numeric": "NUMERIC",
      "json": "JSON",
      "uuid": "UUID",
    },
  };

  const mappings = typeMappings[diagramDb] || typeMappings.generic;
  
  const udtLower = (udtName || "").toLowerCase();
  const typeLower = (dataType || "").toLowerCase();

  if (mappings[udtLower]) {
    return mappings[udtLower];
  }
  if (mappings[typeLower]) {
    return mappings[typeLower];
  }

  return dataType || udtName || "BLOB";
}
