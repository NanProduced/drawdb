import axios from "axios";
import { Cardinality, Constraint, defaultBlue } from "../data/constants";

const baseUrl = import.meta.env.VITE_POSTGRES_BACKEND_URL || "/api/postgres";

function generateStableId(...parts) {
  const str = parts.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return "pg_" + Math.abs(hash).toString(36);
}

function parseDefaultValue(defaultValue) {
  if (!defaultValue) return "";
  
  let val = defaultValue;
  
  if (val.startsWith("nextval(")) {
    return "";
  }
  
  if (val.startsWith("'") && val.endsWith("'::")) {
    const match = val.match(/^'([^']*)'::/);
    if (match) return match[1];
  }
  
  if (val.startsWith("'") && val.endsWith("'")) {
    return val.slice(1, -1);
  }
  
  if (val === "true") return "true";
  if (val === "false") return "false";
  if (val === "null") return "";
  
  if (val.includes("::")) {
    val = val.split("::")[0];
  }
  
  return val;
}

function mapConstraintRule(rule) {
  if (!rule) return Constraint.NONE;
  const upperRule = rule.toUpperCase();
  switch (upperRule) {
    case "CASCADE":
      return Constraint.CASCADE;
    case "RESTRICT":
      return Constraint.RESTRICT;
    case "SET NULL":
      return Constraint.SET_NULL;
    case "SET DEFAULT":
      return Constraint.SET_DEFAULT;
    case "NO ACTION":
    default:
      return Constraint.NONE;
  }
}

export function convertPostgresStructureToDiagram(structure, diagramDb) {
  const tables = [];
  const relationships = [];
  const tableIdMap = new Map();
  const fieldIdMap = new Map();
  
  const dbType = diagramDb || "postgresql";
  
  structure.tables.forEach((table, tableIndex) => {
    const tableId = generateStableId("table", table.name);
    tableIdMap.set(table.name, tableId);
    
    const fields = [];
    table.fields.forEach((field, fieldIndex) => {
      const fieldId = generateStableId("field", table.name, field.name);
      fieldIdMap.set(`${table.name}.${field.name}`, fieldId);
      
      const diagramType = formatPostgresTypeToDiagram(
        field.dataType,
        field.udtName,
        dbType
      );
      
      const isAutoIncrement = 
        field.defaultValue && 
        (field.defaultValue.includes("nextval(") || 
         field.udtName === "serial" || 
         field.udtName === "int4" && field.defaultValue?.includes("nextval"));
      
      fields.push({
        id: fieldId,
        name: field.name,
        type: diagramType,
        default: parseDefaultValue(field.defaultValue),
        check: "",
        primary: field.isPrimaryKey || false,
        unique: field.isUnique || false,
        notNull: !field.isNullable,
        increment: isAutoIncrement,
        comment: field.comment || "",
        size: field.size || "",
      });
    });
    
    tables.push({
      id: tableId,
      name: table.name,
      x: 100 + (tableIndex % 5) * 260,
      y: 100 + Math.floor(tableIndex / 5) * 300,
      fields: fields,
      comment: table.comment || "",
      locked: false,
      hidden: false,
      indices: [],
      color: defaultBlue,
    });
  });
  
  structure.tables.forEach((table) => {
    if (!table.foreignKeys || table.foreignKeys.length === 0) return;
    
    const startTableId = tableIdMap.get(table.name);
    if (!startTableId) return;
    
    table.foreignKeys.forEach((fk) => {
      const endTableId = tableIdMap.get(fk.foreignTableName);
      if (!endTableId) return;
      
      const startFieldId = fieldIdMap.get(`${table.name}.${fk.columnName}`);
      if (!startFieldId) return;
      
      const endFieldId = fieldIdMap.get(`${fk.foreignTableName}.${fk.foreignColumnName}`);
      if (!endFieldId) return;
      
      const startTable = tables.find((t) => t.id === startTableId);
      const startField = startTable?.fields.find((f) => f.id === startFieldId);
      
      const cardinality = startField?.unique 
        ? Cardinality.ONE_TO_ONE 
        : Cardinality.MANY_TO_ONE;
      
      relationships.push({
        id: generateStableId("rel", fk.constraintName),
        name: fk.constraintName,
        startTableId: startTableId,
        startFieldId: startFieldId,
        endTableId: endTableId,
        endFieldId: endFieldId,
        cardinality: cardinality,
        updateConstraint: mapConstraintRule(fk.updateRule),
        deleteConstraint: mapConstraintRule(fk.deleteRule),
      });
    });
  });
  
  return {
    tables,
    relationships,
    notes: [],
    subjectAreas: [],
    types: [],
    enums: [],
  };
}

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
