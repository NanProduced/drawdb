import { dbToTypes } from "../data/datatypes";
import { DB, Cardinality } from "../data/constants";

const dbDisplayNames = {
  [DB.GENERIC]: "Generic",
  [DB.MYSQL]: "MySQL",
  [DB.POSTGRES]: "PostgreSQL",
  [DB.SQLITE]: "SQLite",
  [DB.MSSQL]: "SQL Server",
  [DB.MARIADB]: "MariaDB",
  [DB.ORACLESQL]: "Oracle SQL",
};

const cardinalityDisplayNames = {
  [Cardinality.ONE_TO_ONE]: "one-to-one",
  [Cardinality.ONE_TO_MANY]: "one-to-many",
  [Cardinality.MANY_TO_ONE]: "many-to-one",
};

const MAX_TABLES_TO_SHOW = 20;
const MAX_FIELDS_PER_TABLE = 30;
const MAX_RELATIONSHIPS_TO_SHOW = 15;

function formatFieldForPrompt(field) {
  const parts = [field.name];
  const typeWithSize = field.size ? `${field.type}(${field.size})` : field.type;
  parts.push(typeWithSize);

  const constraints = [];
  if (field.primary) constraints.push("PK");
  if (field.notNull) constraints.push("NOT NULL");
  if (field.unique) constraints.push("UNIQUE");
  if (field.increment) constraints.push("AUTO_INCREMENT");
  if (field.unsigned) constraints.push("UNSIGNED");

  if (constraints.length > 0) {
    parts.push(`[${constraints.join(", ")}]`);
  }

  if (field.default) {
    parts.push(`default: "${field.default}"`);
  }

  if (field.comment) {
    parts.push(`-- ${field.comment}`);
  }

  return parts.join(" ");
}

function formatTableForPrompt(table, tableIndex) {
  const lines = [];
  const commentLine = table.comment ? ` -- ${table.comment}` : "";
  lines.push(`[${tableIndex}] Table: ${table.name}${commentLine}`);

  const fieldCount = table.fields.length;
  const showFields = Math.min(fieldCount, MAX_FIELDS_PER_TABLE);
  const truncatedFields = fieldCount > MAX_FIELDS_PER_TABLE;

  for (let i = 0; i < showFields; i++) {
    lines.push(`  ${formatFieldForPrompt(table.fields[i])}`);
  }

  if (truncatedFields) {
    lines.push(`  ... (${fieldCount - MAX_FIELDS_PER_TABLE} more fields)`);
  }

  return lines.join("\n");
}

function formatRelationshipForPrompt(rel, tables, relIndex) {
  const startTable = tables.find((t) => t.id === rel.startTableId);
  const endTable = tables.find((t) => t.id === rel.endTableId);
  const startField = startTable?.fields.find((f) => f.id === rel.startFieldId);
  const endField = endTable?.fields.find((f) => f.id === rel.endFieldId);

  if (!startTable || !endTable || !startField || !endField) {
    return `[${relIndex}] Relationship: (invalid - table/field not found)`;
  }

  const cardinality = cardinalityDisplayNames[rel.cardinality] || rel.cardinality;
  const constraints = [];
  if (rel.updateConstraint && rel.updateConstraint !== "No action") {
    constraints.push(`ON UPDATE: ${rel.updateConstraint}`);
  }
  if (rel.deleteConstraint && rel.deleteConstraint !== "No action") {
    constraints.push(`ON DELETE: ${rel.deleteConstraint}`);
  }
  const constraintStr = constraints.length > 0 ? ` [${constraints.join(", ")}]` : "";

  return `[${relIndex}] ${startTable.name}.${startField.name} -> ${endTable.name}.${endField.name} (${cardinality})${constraintStr}`;
}

function buildDiagramSnapshot(tables, relationships) {
  if (!tables || tables.length === 0) {
    return {
      summary: "No tables exist in the diagram yet.",
      tablesSection: "",
      relationshipsSection: "",
      truncated: false,
    };
  }

  const tableCount = tables.length;
  const relCount = relationships?.length || 0;
  const showTables = Math.min(tableCount, MAX_TABLES_TO_SHOW);
  const showRels = Math.min(relCount, MAX_RELATIONSHIPS_TO_SHOW);
  const truncatedTables = tableCount > MAX_TABLES_TO_SHOW;
  const truncatedRels = relCount > MAX_RELATIONSHIPS_TO_SHOW;
  const truncated = truncatedTables || truncatedRels;

  const tableLines = [];
  for (let i = 0; i < showTables; i++) {
    tableLines.push(formatTableForPrompt(tables[i], i + 1));
  }

  if (truncatedTables) {
    tableLines.push(`... (${tableCount - MAX_TABLES_TO_SHOW} more tables not shown)`);
  }

  const relLines = [];
  if (relationships && relationships.length > 0) {
    for (let i = 0; i < showRels; i++) {
      relLines.push(formatRelationshipForPrompt(relationships[i], tables, i + 1));
    }

    if (truncatedRels) {
      relLines.push(`... (${relCount - MAX_RELATIONSHIPS_TO_SHOW} more relationships not shown)`);
    }
  }

  const summary = `Current diagram has ${tableCount} table(s) and ${relCount} relationship(s).`;

  return {
    summary,
    tablesSection: tableLines.join("\n\n"),
    relationshipsSection: relLines.join("\n"),
    truncated,
  };
}

export function buildSystemPrompt(database, tables, relationships) {
  const dbDisplayName = dbDisplayNames[database] || database;
  const typeMap = dbToTypes[database];
  const availableTypes = typeMap
    ? Object.keys(typeMap)
        .filter((k) => typeMap[k] !== false)
        .join(", ")
    : "INT, VARCHAR, TEXT, BOOLEAN, DATETIME, FLOAT, DECIMAL";

  const snapshot = buildDiagramSnapshot(tables, relationships);

  let diagramInfo = "";
  if (tables && tables.length > 0) {
    diagramInfo = `\n\n===== CURRENT DIAGRAM SNAPSHOT =====
${snapshot.summary}

----- TABLES -----
${snapshot.tablesSection}`;

    if (snapshot.relationshipsSection) {
      diagramInfo += `\n\n----- RELATIONSHIPS -----
${snapshot.relationshipsSection}`;
    }

    if (snapshot.truncated) {
      diagramInfo += `\n\n(Note: Output truncated to fit context limits. Focus on the most relevant tables first.)`;
    }

    diagramInfo += `\n===== END SNAPSHOT =====`;
  } else {
    diagramInfo = "\n\nNo tables exist in the diagram yet. Start by creating tables with create_tables.";
  }

  return `You are DrawDB's AI assistant, an expert database designer. You help users analyze requirements, create database table structures, and establish relationships between tables.

Current database type: ${dbDisplayName}
Available data types: ${availableTypes}
${diagramInfo}

IMPORTANT - How to read the snapshot:
- Tables show field details: name, type, constraints [PK=Primary Key, NOT NULL, UNIQUE, AUTO_INCREMENT, UNSIGNED], default values, and comments
- Relationships show: from_table.from_field -> to_table.to_field (cardinality) [constraints]
- many_to_one is the most common: e.g., orders.user_id -> users.id means many orders belong to one user

Your workflow:
1. Analyze the user's requirements description
2. Determine if this is about modifying existing tables or creating new ones
3. If adding new fields to existing tables, use add_fields tool
4. If modifying existing field properties (type, default, not null, unique, comment, etc.), use modify_fields tool
5. If creating new tables, call the create_tables tool
6. If the user describes relationships between tables, OR if you're creating tables that should be related (like orders and users), call the create_relationships tool to establish foreign key relationships
7. You can call multiple tools in one response if needed

IMPORTANT - When to use each tool:
- create_tables: ONLY for creating NEW tables from scratch
- add_fields: For adding NEW columns/fields to EXISTING tables
- modify_fields: For CHANGING properties of EXISTING fields (type, default, not null, unique, comment, etc.)

WARNING about modify_fields:
- Renaming a field (changing name property) will FAIL if the field is involved in any relationship (foreign key)
- Changing a field's type will FAIL if the field is involved in any relationship
- Removing primary key constraint (setting primary: false) will FAIL if the field is referenced by foreign keys

Design principles:
- Every table must have a primary key field named "id" (set primary: true, notNull: true, increment: true, unsigned: true)
- Use snake_case for table and field names
- Choose appropriate data types based on the current database type (${dbDisplayName})
- Add NOT NULL constraints for required fields
- Add UNIQUE constraints for fields that should be unique (like email, username)
- Include meaningful comments for tables and fields when helpful
- Consider the existing tables when designing new ones to avoid duplicates
- For foreign key fields: use INT type (matching the referenced id field), add unsigned: true, name them like "user_id", "post_id", etc.

Relationship Guidelines - WHEN to call create_relationships:
- User says "订单属于用户", "评论关联文章", "表A有一个表B", "表A属于表B"
- User mentions "foreign key", "reference", "关系", "关联", "属于", "有一个", "有多个"
- You create tables that logically relate to each other (e.g. creating "orders" and "users" - orders should reference users)
- The relationship direction: "from_table" is the table with the foreign key (e.g. "orders" with user_id), "to_table" is the table being referenced (e.g. "users" with id)

Relationship Guidelines - HOW to use create_relationships:
- from_table: the table containing the foreign key field (e.g. "orders")
- from_field: the foreign key field name (e.g. "user_id")
- to_table: the target table being referenced (e.g. "users")
- to_field: the primary key field being referenced (usually "id")
- cardinality: use "many_to_one" when from_table is the foreign-key table and to_table is the referenced table (e.g. many orders belong to one user)
- If the foreign key field doesn't exist yet, you should first include it in the table fields when calling create_tables

Example scenarios:
- "订单属于用户": from_table=orders, from_field=user_id, to_table=users, to_field=id
- "评论关联文章": from_table=comments, from_field=post_id, to_table=posts, to_field=id
- "一个用户有多个订单": same as "订单属于用户" (orders has the foreign key)

When the user describes a feature or business requirement, think about what tables are needed AND what relationships should exist between them. Create the tables with appropriate foreign key fields, then create the relationships. Be proactive - analyze the requirements and create tables/relationships directly rather than asking too many questions.

If the user's requirement is vague, make reasonable assumptions and create the tables. They can always undo (Ctrl+Z) if needed.

Respond in the same language as the user's message.`;
}
