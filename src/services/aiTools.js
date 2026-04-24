import { nanoid } from "nanoid";

export const toolDefinitions = [
  {
    name: "create_tables",
    description:
      "Create one or more database tables with their fields. Use this when the user wants to design new tables based on their requirements.",
    parameters: {
      type: "object",
      properties: {
        tables: {
          type: "array",
          description: "Array of tables to create",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Table name (use snake_case, e.g. user_orders)",
              },
              comment: {
                type: "string",
                description: "Table comment/description",
              },
              fields: {
                type: "array",
                description: "Array of fields in the table",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "Field name (use snake_case)",
                    },
                    type: {
                      type: "string",
                      description:
                        "SQL data type (e.g. INT, VARCHAR, TEXT, DATETIME, BOOLEAN)",
                    },
                    size: {
                      type: "string",
                      description:
                        "Type size/precision (e.g. '255' for VARCHAR(255), '10,2' for DECIMAL(10,2))",
                    },
                    primary: {
                      type: "boolean",
                      description: "Whether this field is a primary key",
                    },
                    notNull: {
                      type: "boolean",
                      description: "Whether this field is NOT NULL",
                    },
                    unique: {
                      type: "boolean",
                      description: "Whether this field has a UNIQUE constraint",
                    },
                    increment: {
                      type: "boolean",
                      description: "Whether this field is AUTO_INCREMENT",
                    },
                    default: {
                      type: "string",
                      description: "Default value for this field",
                    },
                    comment: {
                      type: "string",
                      description: "Field comment/description",
                    },
                    unsigned: {
                      type: "boolean",
                      description: "Whether this numeric field is UNSIGNED",
                    },
                  },
                  required: ["name", "type"],
                },
              },
            },
            required: ["name", "fields"],
          },
        },
      },
      required: ["tables"],
    },
  },
];

export function executeTool(toolName, args, diagram) {
  const parsedArgs = typeof args === "string" ? JSON.parse(args) : args;

  switch (toolName) {
    case "create_tables":
      return executeCreateTables(parsedArgs, diagram);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

function executeCreateTables(args, diagram) {
  const { tables } = args;
  const results = [];
  const existingTableNames = diagram.tables.map((t) =>
    t.name.toLowerCase(),
  );
  const createdNames = [];

  const baseOffset = diagram.tables.length;

  tables.forEach((tableDef) => {
    const tableName = tableDef.name.toLowerCase();

    if (existingTableNames.includes(tableName) || createdNames.includes(tableName)) {
      results.push({
        success: false,
        error: `Table "${tableDef.name}" already exists`,
      });
      return;
    }

    createdNames.push(tableName);

    const fields = tableDef.fields.map((fieldDef) => ({
      id: nanoid(),
      name: fieldDef.name,
      type: fieldDef.type || "INT",
      default: fieldDef.default || "",
      check: "",
      primary: fieldDef.primary || false,
      unique: fieldDef.unique || false,
      unsigned: fieldDef.unsigned || false,
      notNull: fieldDef.notNull || false,
      increment: fieldDef.increment || false,
      comment: fieldDef.comment || "",
      size: fieldDef.size || "",
      values: [],
      isArray: false,
    }));

    const hasPrimary = fields.some((f) => f.primary);
    if (!hasPrimary) {
      fields.unshift({
        id: nanoid(),
        name: "id",
        type: "INT",
        default: "",
        check: "",
        primary: true,
        unique: false,
        unsigned: true,
        notNull: true,
        increment: true,
        comment: "",
        size: "",
        values: [],
        isArray: false,
      });
    }

    const tableColors = [
      "#175e7a",
      "#2d6e4e",
      "#7a3e17",
      "#6e2d5e",
      "#3e176e",
      "#176e5e",
    ];

    const successIndex = results.filter((r) => r.success).length;

    const newTable = {
      id: nanoid(),
      name: tableDef.name,
      x: (baseOffset + successIndex) % 4 * 260,
      y: Math.floor((baseOffset + successIndex) / 4) * 300,
      locked: false,
      fields,
      comment: tableDef.comment || "",
      indices: [],
      color: tableColors[successIndex % tableColors.length],
    };

    diagram.addTable({ table: newTable, index: baseOffset + successIndex });
    results.push({
      success: true,
      tableName: tableDef.name,
      fieldCount: fields.length,
    });
  });

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  let message = `Successfully created ${successCount} table(s).`;
  if (failCount > 0) {
    message += ` ${failCount} table(s) skipped (already exist).`;
  }
  message += ` Tables: ${results
    .filter((r) => r.success)
    .map((r) => r.tableName)
    .join(", ")}`;

  return { success: true, message, results };
}
