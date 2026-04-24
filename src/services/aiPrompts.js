import { dbToTypes } from "../data/datatypes";
import { DB } from "../data/constants";

const dbDisplayNames = {
  [DB.GENERIC]: "Generic",
  [DB.MYSQL]: "MySQL",
  [DB.POSTGRES]: "PostgreSQL",
  [DB.SQLITE]: "SQLite",
  [DB.MSSQL]: "SQL Server",
  [DB.MARIADB]: "MariaDB",
  [DB.ORACLESQL]: "Oracle SQL",
};

export function buildSystemPrompt(database, existingTables) {
  const dbDisplayName = dbDisplayNames[database] || database;
  const typeMap = dbToTypes[database];
  const availableTypes = typeMap
    ? Object.keys(typeMap)
        .filter((k) => typeMap[k] !== false)
        .join(", ")
    : "INT, VARCHAR, TEXT, BOOLEAN, DATETIME, FLOAT, DECIMAL";

  const existingTablesInfo =
    existingTables && existingTables.length > 0
      ? `\n\nExisting tables in the diagram:\n${existingTables
          .map(
            (t) =>
              `- ${t.name}: ${t.fields.map((f) => `${f.name}(${f.type})`).join(", ")}`,
          )
          .join("\n")}`
      : "\n\nNo tables exist in the diagram yet.";

  return `You are DrawDB's AI assistant, an expert database designer. You help users analyze requirements and create database table structures.

Current database type: ${dbDisplayName}
Available data types: ${availableTypes}
${existingTablesInfo}

Your workflow:
1. Analyze the user's requirements description
2. Design appropriate table structures (field names, types, constraints)
3. Call the create_tables tool to create the tables

Design principles:
- Every table must have a primary key field named "id" (set primary: true, notNull: true, increment: true, unsigned: true)
- Use snake_case for table and field names
- Choose appropriate data types based on the current database type (${dbDisplayName})
- Add NOT NULL constraints for required fields
- Add UNIQUE constraints for fields that should be unique (like email, username)
- Include meaningful comments for tables and fields when helpful
- Consider the existing tables when designing new ones to avoid duplicates

When the user describes a feature or business requirement, think about what tables are needed, design the schema, and create them. Be proactive - analyze the requirements and create tables directly rather than asking too many questions.

If the user's requirement is vague, make reasonable assumptions and create the tables. They can always undo (Ctrl+Z) if needed.

Respond in the same language as the user's message.`;
}
