import { nanoid } from "nanoid";
import { Cardinality, Constraint, Action, ObjectType } from "../data/constants";

function findTableIgnoreCase(tables, tableName) {
  const lowerName = tableName.toLowerCase();
  return tables.find((t) => t.name.toLowerCase() === lowerName);
}

function findFieldIgnoreCase(table, fieldName) {
  const lowerName = fieldName.toLowerCase();
  return table?.fields.find((f) => f.name.toLowerCase() === lowerName);
}

function getAffectedRelationships(relationships, tables, tableId, fieldId) {
  return relationships.filter((r) => {
    return (
      (r.startTableId === tableId && r.startFieldId === fieldId) ||
      (r.endTableId === tableId && r.endFieldId === fieldId)
    );
  });
}

function getRelationshipInfo(relationships, tables, rel) {
  const startTable = tables.find((t) => t.id === rel.startTableId);
  const endTable = tables.find((t) => t.id === rel.endTableId);
  const startField = startTable?.fields.find((f) => f.id === rel.startFieldId);
  const endField = endTable?.fields.find((f) => f.id === rel.endFieldId);

  return {
    fromTable: startTable?.name,
    fromField: startField?.name,
    toTable: endTable?.name,
    toField: endField?.name,
    cardinality: rel.cardinality,
  };
}

function checkModifyFieldConstraints(table, field, updates, relationships, allTables) {
  const issues = [];
  const affectedRels = getAffectedRelationships(relationships, allTables, table.id, field.id);

  if (updates.name !== undefined && updates.name !== field.name) {
    if (affectedRels.length > 0) {
      const relInfos = affectedRels.map((r) => {
        const info = getRelationshipInfo(relationships, allTables, r);
        if (r.startFieldId === field.id) {
          return `${info.fromTable}.${info.fromField} -> ${info.toTable}.${info.toField}`;
        }
        return `${info.toTable}.${info.toField} -> ${info.fromTable}.${info.fromField}`;
      });
      issues.push({
        type: "field_name",
        message: `Cannot rename field "${field.name}" because it is involved in ${affectedRels.length} relationship(s): ${relInfos.join("; ")}`,
      });
    }
  }

  if (updates.type !== undefined && updates.type !== field.type) {
    if (affectedRels.length > 0) {
      const relInfos = affectedRels.map((r) => {
        const info = getRelationshipInfo(relationships, allTables, r);
        if (r.startFieldId === field.id) {
          return `${info.fromTable}.${info.fromField} -> ${info.toTable}.${info.toField}`;
        }
        return `${info.toTable}.${info.toField} -> ${info.fromTable}.${info.fromField}`;
      });
      issues.push({
        type: "field_type",
        message: `Cannot change type of field "${field.name}" from "${field.type}" to "${updates.type}" because it is involved in ${affectedRels.length} relationship(s): ${relInfos.join("; ")}`,
      });
    }
  }

  if (updates.primary === false && field.primary === true) {
    if (affectedRels.length > 0) {
      const relInfos = affectedRels.map((r) => {
        const info = getRelationshipInfo(relationships, allTables, r);
        return `${info.toTable}.${info.toField} -> ${info.fromTable}.${info.fromField}`;
      });
      issues.push({
        type: "primary_key",
        message: `Cannot remove primary key constraint from "${field.name}" because it is referenced by ${affectedRels.length} foreign key(s): ${relInfos.join("; ")}`,
      });
    }
  }

  return issues;
}

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
  {
    name: "add_fields",
    description:
      "Add new fields to existing tables. Use this when the user wants to add columns to an already existing table. Table name and field name matching is case-insensitive.",
    parameters: {
      type: "object",
      properties: {
        additions: {
          type: "array",
          description: "Array of field additions to perform",
          items: {
            type: "object",
            properties: {
              table: {
                type: "string",
                description: "Table name to add field to (case-insensitive)",
              },
              field: {
                type: "object",
                description: "Field definition to add",
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
            required: ["table", "field"],
          },
        },
      },
      required: ["additions"],
    },
  },
  {
    name: "modify_fields",
    description:
      "Modify existing fields in tables. Use this when the user wants to change field properties like type, default value, not null, unique, comment, etc. WARNING: Renaming fields, changing field types, or removing primary key constraints will FAIL if the field is involved in any relationships (foreign keys). Table name and field name matching is case-insensitive.",
    parameters: {
      type: "object",
      properties: {
        modifications: {
          type: "array",
          description: "Array of field modifications to perform",
          items: {
            type: "object",
            properties: {
              table: {
                type: "string",
                description: "Table name containing the field (case-insensitive)",
              },
              field: {
                type: "string",
                description: "Name of the field to modify (case-insensitive, matches by current name)",
              },
              changes: {
                type: "object",
                description: "Changes to apply to the field. Any omitted properties will remain unchanged.",
                properties: {
                  name: {
                    type: "string",
                    description: "New field name (WARNING: will fail if field is in any relationship)",
                  },
                  type: {
                    type: "string",
                    description: "New SQL data type (WARNING: will fail if field is in any relationship)",
                  },
                  size: {
                    type: "string",
                    description: "New type size/precision",
                  },
                  primary: {
                    type: "boolean",
                    description: "Whether this field is a primary key (WARNING: setting to false will fail if field is referenced by foreign keys)",
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
              },
            },
            required: ["table", "field", "changes"],
          },
        },
      },
      required: ["modifications"],
    },
  },
];

export function executeTool(
  toolName,
  args,
  { tables, relationships, diagram, setUndoStack, setRedoStack },
) {
  let parsedArgs;
  try {
    parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
  } catch {
    return { success: false, error: `Failed to parse tool arguments: invalid JSON` };
  }

  const context = {
    tables,
    relationships,
    diagram,
    setUndoStack,
    setRedoStack,
  };

  switch (toolName) {
    case "create_tables":
      return executeCreateTables(parsedArgs, { tables, diagram });
    case "create_relationships":
      return executeCreateRelationships(parsedArgs, { tables, relationships, diagram });
    case "add_fields":
      return executeAddFields(parsedArgs, context);
    case "modify_fields":
      return executeModifyFields(parsedArgs, context);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

function executeAddFields(args, { tables, diagram, setUndoStack, setRedoStack }) {
  const { additions } = args;
  const results = [];
  const addedKeys = new Set();
  const successfulAdditions = [];

  for (const addDef of additions) {
    const { table: tableName, field: fieldDef } = addDef;

    if (!tableName || !fieldDef) {
      results.push({
        success: false,
        error: `Invalid addition: must specify "table" and "field"`,
      });
      continue;
    }

    if (!fieldDef.name || !fieldDef.type) {
      results.push({
        success: false,
        error: `Field definition must include "name" and "type"`,
        table: tableName,
      });
      continue;
    }

    const table = findTableIgnoreCase(tables, tableName);
    if (!table) {
      results.push({
        success: false,
        error: `Table "${tableName}" not found`,
        table: tableName,
        field: fieldDef.name,
      });
      continue;
    }

    const fieldNameLower = fieldDef.name.toLowerCase();
    const addKey = `${table.id}:${fieldNameLower}`;

    if (addedKeys.has(addKey)) {
      results.push({
        success: false,
        error: `Field "${fieldDef.name}" was already added to table "${tableName}" in this batch`,
        table: tableName,
        field: fieldDef.name,
      });
      continue;
    }

    const existingField = findFieldIgnoreCase(table, fieldDef.name);
    if (existingField) {
      results.push({
        success: false,
        error: `Field "${fieldDef.name}" already exists in table "${tableName}"`,
        table: tableName,
        field: fieldDef.name,
      });
      continue;
    }

    addedKeys.add(addKey);

    const newField = {
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
    };

    const fieldIndex = table.fields.length;
    table.fields.push(newField);
    diagram.updateTable(table.id, { fields: [...table.fields] });

    successfulAdditions.push({
      tableId: table.id,
      tableName: table.name,
      field: { ...newField },
      fieldIndex,
    });

    results.push({
      success: true,
      table: tableName,
      tableActualName: table.name,
      field: fieldDef.name,
      fieldId: newField.id,
    });
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  if (successCount > 0 && setUndoStack && setRedoStack) {
    for (const addition of successfulAdditions) {
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.EDIT,
          element: ObjectType.TABLE,
          component: "field_add",
          tid: addition.tableId,
          fid: addition.field.id,
          data: {
            field: { ...addition.field },
            index: addition.fieldIndex,
          },
          message: `[AI] Add field "${addition.field.name}" to table "${addition.tableName}"`,
        },
      ]);
    }
    setRedoStack([]);
  }

  let message = "";
  if (successCount > 0) {
    message += `Successfully added ${successCount} field(s): `;
    message += results
      .filter((r) => r.success)
      .map((r) => `${r.tableActualName}.${r.field}`)
      .join("; ");
  }
  if (failCount > 0) {
    if (message) message += " ";
    message += `${failCount} field(s) failed: `;
    message += results
      .filter((r) => !r.success)
      .map((r) => r.error)
      .join("; ");
  }

  return { success: successCount > 0 || failCount === 0, message, results };
}

function executeModifyFields(args, { tables, relationships, diagram, setUndoStack, setRedoStack }) {
  const { modifications } = args;
  const results = [];
  const modifiedKeys = new Set();
  const successfulModifications = [];

  for (const modDef of modifications) {
    const { table: tableName, field: fieldName, changes } = modDef;

    if (!tableName || !fieldName || !changes) {
      results.push({
        success: false,
        error: `Invalid modification: must specify "table", "field", and "changes"`,
      });
      continue;
    }

    const table = findTableIgnoreCase(tables, tableName);
    if (!table) {
      results.push({
        success: false,
        error: `Table "${tableName}" not found`,
        table: tableName,
        field: fieldName,
      });
      continue;
    }

    const field = findFieldIgnoreCase(table, fieldName);
    if (!field) {
      results.push({
        success: false,
        error: `Field "${fieldName}" not found in table "${tableName}"`,
        table: tableName,
        field: fieldName,
      });
      continue;
    }

    const modifyKey = `${table.id}:${field.id}`;
    if (modifiedKeys.has(modifyKey)) {
      results.push({
        success: false,
        error: `Field "${field.name}" in table "${table.name}" was already modified in this batch`,
        table: tableName,
        field: fieldName,
      });
      continue;
    }

    const constraintIssues = checkModifyFieldConstraints(
      table,
      field,
      changes,
      relationships,
      tables,
    );

    if (constraintIssues.length > 0) {
      results.push({
        success: false,
        error: constraintIssues.map((i) => i.message).join("; "),
        table: tableName,
        field: fieldName,
        constraintIssues: constraintIssues,
      });
      continue;
    }

    if (changes.name !== undefined && changes.name !== field.name) {
      const newNameLower = changes.name.toLowerCase();
      const nameConflict = table.fields.find(
        (f) => f.id !== field.id && f.name.toLowerCase() === newNameLower,
      );
      if (nameConflict) {
        results.push({
          success: false,
          error: `Cannot rename "${field.name}" to "${changes.name}": field with this name already exists in table "${table.name}"`,
          table: tableName,
          field: fieldName,
        });
        continue;
      }
    }

    modifiedKeys.add(modifyKey);

    const allowedUpdates = [
      "name",
      "type",
      "size",
      "primary",
      "notNull",
      "unique",
      "increment",
      "default",
      "comment",
      "unsigned",
    ];

    const undoValues = {};
    const redoValues = {};
    for (const key of allowedUpdates) {
      if (changes[key] !== undefined) {
        undoValues[key] = field[key];
        redoValues[key] = changes[key];
      }
    }

    const fieldIndex = table.fields.findIndex((f) => f.id === field.id);
    if (fieldIndex !== -1) {
      table.fields[fieldIndex] = { ...table.fields[fieldIndex], ...redoValues };
      diagram.updateTable(table.id, { fields: [...table.fields] });
    }

    const appliedChanges = Object.keys(redoValues);
    const newFieldName = redoValues.name || field.name;

    successfulModifications.push({
      tableId: table.id,
      tableName: table.name,
      fieldId: field.id,
      fieldOldName: field.name,
      fieldNewName: newFieldName,
      undo: { ...undoValues },
      redo: { ...redoValues },
      appliedChanges,
    });

    results.push({
      success: true,
      table: tableName,
      tableActualName: table.name,
      field: fieldName,
      fieldActualName: newFieldName,
      fieldId: field.id,
      appliedChanges: appliedChanges,
      oldValues: {
        name: field.name,
        type: field.type,
      },
      newValues: {
        name: redoValues.name || field.name,
        type: redoValues.type || field.type,
      },
    });
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  if (successCount > 0 && setUndoStack && setRedoStack) {
    for (const mod of successfulModifications) {
      const changeDesc = mod.appliedChanges.join(", ");
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.EDIT,
          element: ObjectType.TABLE,
          component: "field",
          tid: mod.tableId,
          fid: mod.fieldId,
          undo: { ...mod.undo },
          redo: { ...mod.redo },
          message: `[AI] Modify field "${mod.fieldOldName}" (${changeDesc}) in table "${mod.tableName}"`,
        },
      ]);
    }
    setRedoStack([]);
  }

  let message = "";
  if (successCount > 0) {
    message += `Successfully modified ${successCount} field(s): `;
    message += results
      .filter((r) => r.success)
      .map((r) => {
        const changes = r.appliedChanges.join(", ");
        return `${r.tableActualName}.${r.fieldActualName} (${changes})`;
      })
      .join("; ");
  }
  if (failCount > 0) {
    if (message) message += " ";
    message += `${failCount} modification(s) failed: `;
    message += results
      .filter((r) => !r.success)
      .map((r) => r.error)
      .join("; ");
  }

  return { success: successCount > 0 || failCount === 0, message, results };
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
