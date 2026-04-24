import { nanoid } from "nanoid";
import { Cardinality, Constraint } from "../data/constants";

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
  {
    name: "create_relationships",
    description:
      "Create foreign key relationships between existing tables. Use this when the user describes relationships like '订单属于用户', '评论关联文章', '表A有一个表B', '表A属于表B' etc. Fields can be existing ones or just created by create_tables.",
    parameters: {
      type: "object",
      properties: {
        relationships: {
          type: "array",
          description: "Array of relationships to create",
          items: {
            type: "object",
            properties: {
              from_table: {
                type: "string",
                description: "The table containing the foreign key (e.g. 'orders' that has user_id)",
              },
              from_field: {
                type: "string",
                description: "The foreign key field name (e.g. 'user_id')",
              },
              to_table: {
                type: "string",
                description: "The target table being referenced (e.g. 'users')",
              },
              to_field: {
                type: "string",
                description: "The primary key field being referenced (usually 'id')",
              },
              cardinality: {
                type: "string",
                description: "Relationship cardinality: 'one_to_one', 'one_to_many', 'many_to_one'. Default is 'many_to_one' which is the most common (e.g. many orders belong to one user). from_table is the table with foreign key, to_table is the referenced table.",
                enum: ["one_to_one", "one_to_many", "many_to_one"],
              },
              update_constraint: {
                type: "string",
                description: "ON UPDATE constraint action. Default is 'No action'.",
                enum: ["No action", "Restrict", "Cascade", "Set null", "Set default"],
              },
              delete_constraint: {
                type: "string",
                description: "ON DELETE constraint action. Default is 'No action'.",
                enum: ["No action", "Restrict", "Cascade", "Set null", "Set default"],
              },
            },
            required: ["from_table", "from_field", "to_table", "to_field"],
          },
        },
      },
      required: ["relationships"],
    },
  },
];

export function executeTool(toolName, args, { tables, relationships, diagram }) {
  let parsedArgs;
  try {
    parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
  } catch {
    return { success: false, error: `Failed to parse tool arguments: invalid JSON` };
  }

  switch (toolName) {
    case "create_tables":
      return executeCreateTables(parsedArgs, { tables, diagram });
    case "create_relationships":
      return executeCreateRelationships(parsedArgs, { tables, relationships, diagram });
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

function executeCreateTables(args, { tables, diagram }) {
  const { tables: tablesToCreate } = args;
  const results = [];
  const existingTableNames = tables.map((t) =>
    t.name.toLowerCase(),
  );
  const createdNames = [];

  const baseOffset = tables.length;

  tablesToCreate.forEach((tableDef) => {
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
    tables.push(newTable);
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

function executeCreateRelationships(args, { tables, relationships, diagram }) {
  const { relationships: relationshipsToCreate } = args;
  const results = [];
  const createdKeys = new Set();

  for (const relDef of relationshipsToCreate) {
    const {
      from_table: fromTable,
      from_field: fromField,
      to_table: toTable,
      to_field: toField,
      cardinality,
      update_constraint: updateConstraint,
      delete_constraint: deleteConstraint,
    } = relDef;

    const fromTableName = fromTable.toLowerCase();
    const toTableName = toTable.toLowerCase();
    const fromFieldName = fromField.toLowerCase();
    const toFieldName = toField.toLowerCase();

    const relationshipKey = `${fromTableName}:${fromFieldName}->${toTableName}:${toFieldName}`;
    const reverseKey = `${toTableName}:${toFieldName}->${fromTableName}:${fromFieldName}`;

    if (createdKeys.has(relationshipKey) || createdKeys.has(reverseKey)) {
      results.push({
        success: false,
        error: `Relationship "${fromTable}.${fromField}" -> "${toTable}.${toField}" was already created in this batch`,
      });
      continue;
    }

    const existingRelationship = relationships.find((r) => {
      const startTable = tables.find((t) => t.id === r.startTableId);
      const endTable = tables.find((t) => t.id === r.endTableId);
      const startField = startTable?.fields.find((f) => f.id === r.startFieldId);
      const endField = endTable?.fields.find((f) => f.id === r.endFieldId);

      if (!startTable || !endTable || !startField || !endField) return false;

      const currentKey = `${startTable.name.toLowerCase()}:${startField.name.toLowerCase()}->${endTable.name.toLowerCase()}:${endField.name.toLowerCase()}`;
      const currentReverse = `${endTable.name.toLowerCase()}:${endField.name.toLowerCase()}->${startTable.name.toLowerCase()}:${startField.name.toLowerCase()}`;

      return currentKey === relationshipKey || currentKey === reverseKey ||
             currentReverse === relationshipKey || currentReverse === reverseKey;
    });

    if (existingRelationship) {
      results.push({
        success: false,
        error: `Relationship "${fromTable}.${fromField}" -> "${toTable}.${toField}" already exists`,
      });
      continue;
    }

    const startTable = tables.find((t) => t.name.toLowerCase() === fromTableName);
    if (!startTable) {
      results.push({
        success: false,
        error: `Table "${fromTable}" not found`,
      });
      continue;
    }

    const endTable = tables.find((t) => t.name.toLowerCase() === toTableName);
    if (!endTable) {
      results.push({
        success: false,
        error: `Table "${toTable}" not found`,
      });
      continue;
    }

    const startField = startTable.fields.find((f) => f.name.toLowerCase() === fromFieldName);
    if (!startField) {
      results.push({
        success: false,
        error: `Field "${fromField}" not found in table "${fromTable}"`,
      });
      continue;
    }

    const endField = endTable.fields.find((f) => f.name.toLowerCase() === toFieldName);
    if (!endField) {
      results.push({
        success: false,
        error: `Field "${toField}" not found in table "${toTable}"`,
      });
      continue;
    }

    const validCardinalities = Object.values(Cardinality);
    const relCardinality = cardinality && validCardinalities.includes(cardinality)
      ? cardinality
      : Cardinality.MANY_TO_ONE;

    const validConstraints = Object.values(Constraint);
    const relUpdateConstraint = updateConstraint && validConstraints.includes(updateConstraint)
      ? updateConstraint
      : Constraint.NONE;
    const relDeleteConstraint = deleteConstraint && validConstraints.includes(deleteConstraint)
      ? deleteConstraint
      : Constraint.NONE;

    const newRelationship = {
      id: nanoid(),
      name: `fk_${startTable.name}_${startField.name}_${endTable.name}`,
      startTableId: startTable.id,
      startFieldId: startField.id,
      endTableId: endTable.id,
      endFieldId: endField.id,
      cardinality: relCardinality,
      updateConstraint: relUpdateConstraint,
      deleteConstraint: relDeleteConstraint,
    };

    diagram.addRelationship(newRelationship);
    relationships.push(newRelationship);
    createdKeys.add(relationshipKey);

    results.push({
      success: true,
      fromTable: fromTable,
      fromField: fromField,
      toTable: toTable,
      toField: toField,
      cardinality: relCardinality,
    });
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  let message = "";
  if (successCount > 0) {
    message += `Successfully created ${successCount} relationship(s): `;
    message += results
      .filter((r) => r.success)
      .map((r) => `${r.fromTable}.${r.fromField} -> ${r.toTable}.${r.toField}`)
      .join("; ");
  }
  if (failCount > 0) {
    if (message) message += " ";
    message += `${failCount} relationship(s) failed: `;
    message += results
      .filter((r) => !r.success)
      .map((r) => r.error)
      .join("; ");
  }

  return { success: successCount > 0 || failCount === 0, message, results };
}
