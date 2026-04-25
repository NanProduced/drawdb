import { nanoid } from "nanoid";
import { Cardinality, Constraint, Action, ObjectType } from "../data/constants";
import { arrangeTablesSmart, buildUndoRedoForArrange } from "../utils/arrangeTables";

function findTableIgnoreCase(tables, tableName) {
  const lowerName = tableName.toLowerCase();
  return tables.find((t) => t.name.toLowerCase() === lowerName);
}

function findFieldIgnoreCase(table, fieldName) {
  const lowerName = fieldName.toLowerCase();
  return table?.fields.find((f) => f.name.toLowerCase() === lowerName);
}

function formatFieldForSummary(field) {
  const constraints = [];
  if (field.primary) constraints.push("PK");
  if (field.notNull) constraints.push("NOT NULL");
  if (field.unique) constraints.push("UNIQUE");
  if (field.increment) constraints.push("AUTO_INCREMENT");
  if (field.unsigned) constraints.push("UNSIGNED");

  const typeWithSize = field.size ? `${field.type}(${field.size})` : field.type;
  let result = `${field.name} ${typeWithSize}`;

  if (constraints.length > 0) {
    result += ` [${constraints.join(", ")}]`;
  }

  if (field.default) {
    result += ` default: "${field.default}"`;
  }

  if (field.comment) {
    result += ` -- ${field.comment}`;
  }

  return result;
}

const cardinalityDisplayNames = {
  [Cardinality.ONE_TO_ONE]: "one-to-one",
  [Cardinality.ONE_TO_MANY]: "one-to-many",
  [Cardinality.MANY_TO_ONE]: "many-to-one",
};

function buildToolResultSummary(toolName, successCount, failCount, details, affectedTables, affectedRelationships) {
  const summary = {
    tool: toolName,
    success: successCount > 0 || failCount === 0,
    successCount,
    failCount,
    message: "",
    details,
    affected_tables: affectedTables || [],
    affected_relationships: affectedRelationships || [],
  };

  let message = "";
  if (successCount > 0) {
    message += `Successfully executed ${toolName}: ${successCount} operation(s) succeeded.`;
  }
  if (failCount > 0) {
    if (message) message += " ";
    message += `${failCount} operation(s) failed.`;
  }

  summary.message = message;
  return summary;
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

function executeInspectTables(args, { tables, relationships }) {
  const requestedTables = args.tables || [];
  const results = [];
  const inspectedTableIds = new Set();

  for (const tableName of requestedTables) {
    const table = findTableIgnoreCase(tables, tableName);
    if (!table) {
      results.push({
        success: false,
        error: `Table "${tableName}" not found`,
        requested_table: tableName,
      });
      continue;
    }

    inspectedTableIds.add(table.id);
    const tableRelationships = relationships
      .filter((rel) => rel.startTableId === table.id || rel.endTableId === table.id)
      .map((rel) => {
        const info = getRelationshipInfo(relationships, tables, rel);
        return {
          id: rel.id,
          name: rel.name,
          from_table: info.fromTable,
          from_field: info.fromField,
          to_table: info.toTable,
          to_field: info.toField,
          cardinality: rel.cardinality,
          cardinality_display: cardinalityDisplayNames[rel.cardinality] || rel.cardinality,
        };
      });

    results.push({
      success: true,
      tableName: table.name,
      table_name: table.name,
      table_id: table.id,
      fieldCount: table.fields.length,
      field_count: table.fields.length,
      comment: table.comment || "",
      fields: table.fields.map(formatFieldForSummary),
      relationships: tableRelationships,
    });
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const affectedTables = Array.from(inspectedTableIds).map((tableId) => {
    const table = tables.find((t) => t.id === tableId);
    return {
      name: table?.name,
      id: tableId,
      field_count: table?.fields.length,
      fields: table?.fields.map(formatFieldForSummary) || [],
    };
  });

  const affectedRelationships = relationships
    .filter(
      (rel) =>
        inspectedTableIds.has(rel.startTableId) ||
        inspectedTableIds.has(rel.endTableId),
    )
    .map((rel) => {
      const info = getRelationshipInfo(relationships, tables, rel);
      return {
        id: rel.id,
        name: rel.name,
        from_table: info.fromTable,
        from_field: info.fromField,
        to_table: info.toTable,
        to_field: info.toField,
        cardinality: rel.cardinality,
        cardinality_display: cardinalityDisplayNames[rel.cardinality] || rel.cardinality,
      };
    });

  const summary = buildToolResultSummary(
    "inspect_tables",
    successCount,
    failCount,
    results,
    affectedTables,
    affectedRelationships,
  );

  if (successCount > 0) {
    summary.message = `Inspected ${successCount} table(s): ${results
      .filter((r) => r.success)
      .map((r) => r.table_name)
      .join(", ")}`;
  }
  if (failCount > 0) {
    summary.message += `${summary.message ? " " : ""}${failCount} table(s) not found: ${results
      .filter((r) => !r.success)
      .map((r) => r.requested_table)
      .join(", ")}`;
  }

  return summary;
}

function executeCreateTables(args, { tables, diagram }) {
  const { tables: tablesToCreate } = args;
  const results = [];
  const existingTableNames = tables.map((t) =>
    t.name.toLowerCase(),
  );
  const createdNames = [];
  const createdTables = [];

  const baseOffset = tables.length;

  tablesToCreate.forEach((tableDef) => {
    const tableName = tableDef.name.toLowerCase();

    if (existingTableNames.includes(tableName) || createdNames.includes(tableName)) {
      results.push({
        success: false,
        error: `Table "${tableDef.name}" already exists`,
        requested_table: tableDef.name,
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
    let autoAddedId = false;
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
      autoAddedId = true;
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
    createdTables.push(newTable);

    const fieldSummaries = fields.map(formatFieldForSummary);
    results.push({
      success: true,
      tableName: tableDef.name,
      table_name: tableDef.name,
      table_id: newTable.id,
      fieldCount: fields.length,
      field_count: fields.length,
      auto_added_id: autoAddedId,
      fields: fieldSummaries,
      comment: tableDef.comment || "",
    });
  });

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  const affectedTables = createdTables.map((t) => ({
    name: t.name,
    id: t.id,
    field_count: t.fields.length,
    fields: t.fields.map(formatFieldForSummary),
  }));

  let message = "";
  if (successCount > 0) {
    message += `Successfully created ${successCount} table(s): `;
    message += results
      .filter((r) => r.success)
      .map((r) => r.table_name)
      .join(", ");
  }
  if (failCount > 0) {
    if (message) message += " ";
    message += `${failCount} table(s) skipped (already exist): `;
    message += results
      .filter((r) => !r.success)
      .map((r) => r.requested_table)
      .join(", ");
  }

  const summary = buildToolResultSummary(
    "create_tables",
    successCount,
    failCount,
    results,
    affectedTables,
    []
  );
  summary.message = message;
  return summary;
}

function executeCreateRelationships(args, { tables, relationships, diagram }) {
  const { relationships: relationshipsToCreate } = args;
  const results = [];
  const createdKeys = new Set();
  const createdRelationships = [];

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
        requested: { from_table: fromTable, from_field: fromField, to_table: toTable, to_field: toField },
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
        requested: { from_table: fromTable, from_field: fromField, to_table: toTable, to_field: toField },
      });
      continue;
    }

    const startTable = tables.find((t) => t.name.toLowerCase() === fromTableName);
    if (!startTable) {
      results.push({
        success: false,
        error: `Table "${fromTable}" not found`,
        requested: { from_table: fromTable, from_field: fromField, to_table: toTable, to_field: toField },
      });
      continue;
    }

    const endTable = tables.find((t) => t.name.toLowerCase() === toTableName);
    if (!endTable) {
      results.push({
        success: false,
        error: `Table "${toTable}" not found`,
        requested: { from_table: fromTable, from_field: fromField, to_table: toTable, to_field: toField },
      });
      continue;
    }

    const startField = startTable.fields.find((f) => f.name.toLowerCase() === fromFieldName);
    if (!startField) {
      results.push({
        success: false,
        error: `Field "${fromField}" not found in table "${fromTable}"`,
        requested: { from_table: fromTable, from_field: fromField, to_table: toTable, to_field: toField },
      });
      continue;
    }

    const endField = endTable.fields.find((f) => f.name.toLowerCase() === toFieldName);
    if (!endField) {
      results.push({
        success: false,
        error: `Field "${toField}" not found in table "${toTable}"`,
        requested: { from_table: fromTable, from_field: fromField, to_table: toTable, to_field: toField },
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

    const cardinalityDisplay = cardinalityDisplayNames[relCardinality] || relCardinality;

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
    createdRelationships.push(newRelationship);

    const constraints = [];
    if (relUpdateConstraint !== Constraint.NONE) {
      constraints.push(`ON UPDATE: ${relUpdateConstraint}`);
    }
    if (relDeleteConstraint !== Constraint.NONE) {
      constraints.push(`ON DELETE: ${relDeleteConstraint}`);
    }

    results.push({
      success: true,
      relationship_id: newRelationship.id,
      relationship_name: newRelationship.name,
      from_table: fromTable,
      from_table_id: startTable.id,
      from_field: fromField,
      from_field_id: startField.id,
      to_table: toTable,
      to_table_id: endTable.id,
      to_field: toField,
      to_field_id: endField.id,
      cardinality: relCardinality,
      cardinality_display: cardinalityDisplay,
      constraints: constraints.length > 0 ? constraints : undefined,
    });
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  const affectedRelationships = createdRelationships.map((r) => {
    const startTable = tables.find((t) => t.id === r.startTableId);
    const endTable = tables.find((t) => t.id === r.endTableId);
    const startField = startTable?.fields.find((f) => f.id === r.startFieldId);
    const endField = endTable?.fields.find((f) => f.id === r.endFieldId);

    return {
      id: r.id,
      name: r.name,
      from_table: startTable?.name,
      from_field: startField?.name,
      to_table: endTable?.name,
      to_field: endField?.name,
      cardinality: r.cardinality,
      cardinality_display: cardinalityDisplayNames[r.cardinality] || r.cardinality,
    };
  });

  let message = "";
  if (successCount > 0) {
    message += `Successfully created ${successCount} relationship(s): `;
    message += results
      .filter((r) => r.success)
      .map((r) => `${r.from_table}.${r.from_field} -> ${r.to_table}.${r.to_field} (${r.cardinality_display})`)
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

  const summary = buildToolResultSummary(
    "create_relationships",
    successCount,
    failCount,
    results,
    [],
    affectedRelationships
  );
  summary.message = message;
  return summary;
}

function executeAddFields(args, { tables, diagram, setUndoStack, setRedoStack }) {
  const { additions } = args;
  const results = [];
  const addedKeys = new Set();
  const successfulAdditions = [];
  const affectedTableIds = new Set();

  for (const addDef of additions) {
    const { table: tableName, field: fieldDef } = addDef;

    if (!tableName || !fieldDef) {
      results.push({
        success: false,
        error: `Invalid addition: must specify "table" and "field"`,
        requested: { table: tableName, field: fieldDef },
      });
      continue;
    }

    if (!fieldDef.name || !fieldDef.type) {
      results.push({
        success: false,
        error: `Field definition must include "name" and "type"`,
        requested: { table: tableName, field: fieldDef },
      });
      continue;
    }

    const table = findTableIgnoreCase(tables, tableName);
    if (!table) {
      results.push({
        success: false,
        error: `Table "${tableName}" not found`,
        requested: { table: tableName, field: fieldDef.name },
      });
      continue;
    }

    const fieldNameLower = fieldDef.name.toLowerCase();
    const addKey = `${table.id}:${fieldNameLower}`;

    if (addedKeys.has(addKey)) {
      results.push({
        success: false,
        error: `Field "${fieldDef.name}" was already added to table "${tableName}" in this batch`,
        requested: { table: tableName, field: fieldDef.name },
      });
      continue;
    }

    const existingField = findFieldIgnoreCase(table, fieldDef.name);
    if (existingField) {
      results.push({
        success: false,
        error: `Field "${fieldDef.name}" already exists in table "${tableName}"`,
        requested: { table: tableName, field: fieldDef.name },
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
    affectedTableIds.add(table.id);

    successfulAdditions.push({
      tableId: table.id,
      tableName: table.name,
      field: { ...newField },
      fieldIndex,
    });

    const fieldSummary = formatFieldForSummary(newField);
    results.push({
      success: true,
      table: tableName,
      table_id: table.id,
      table_actual_name: table.name,
      field_name: fieldDef.name,
      field_id: newField.id,
      field_index: fieldIndex,
      field_summary: fieldSummary,
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

  const affectedTables = Array.from(affectedTableIds).map((tableId) => {
    const table = tables.find((t) => t.id === tableId);
    return {
      name: table?.name,
      id: tableId,
      field_count: table?.fields.length,
      added_fields: successfulAdditions
        .filter((a) => a.tableId === tableId)
        .map((a) => formatFieldForSummary(a.field)),
    };
  });

  let message = "";
  if (successCount > 0) {
    message += `Successfully added ${successCount} field(s): `;
    message += results
      .filter((r) => r.success)
      .map((r) => `${r.table_actual_name}.${r.field_name}`)
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

  const summary = buildToolResultSummary(
    "add_fields",
    successCount,
    failCount,
    results,
    affectedTables,
    []
  );
  summary.message = message;
  return summary;
}

function executeModifyFields(args, { tables, relationships, diagram, setUndoStack, setRedoStack }) {
  const { modifications } = args;
  const results = [];
  const modifiedKeys = new Set();
  const successfulModifications = [];
  const affectedTableIds = new Set();

  for (const modDef of modifications) {
    const { table: tableName, field: fieldName, changes } = modDef;

    if (!tableName || !fieldName || !changes) {
      results.push({
        success: false,
        error: `Invalid modification: must specify "table", "field", and "changes"`,
        requested: { table: tableName, field: fieldName, changes },
      });
      continue;
    }

    const table = findTableIgnoreCase(tables, tableName);
    if (!table) {
      results.push({
        success: false,
        error: `Table "${tableName}" not found`,
        requested: { table: tableName, field: fieldName },
      });
      continue;
    }

    const field = findFieldIgnoreCase(table, fieldName);
    if (!field) {
      results.push({
        success: false,
        error: `Field "${fieldName}" not found in table "${tableName}"`,
        requested: { table: tableName, field: fieldName },
      });
      continue;
    }

    const modifyKey = `${table.id}:${field.id}`;
    if (modifiedKeys.has(modifyKey)) {
      results.push({
        success: false,
        error: `Field "${field.name}" in table "${table.name}" was already modified in this batch`,
        requested: { table: tableName, field: fieldName },
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
        requested: { table: tableName, field: fieldName },
        constraint_issues: constraintIssues,
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
          requested: { table: tableName, field: fieldName },
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
    const oldFieldSummary = formatFieldForSummary(field);
    
    if (fieldIndex !== -1) {
      table.fields[fieldIndex] = { ...table.fields[fieldIndex], ...redoValues };
      diagram.updateTable(table.id, { fields: [...table.fields] });
    }

    const newFieldSummary = formatFieldForSummary(table.fields[fieldIndex]);
    const appliedChanges = Object.keys(redoValues);
    const newFieldName = redoValues.name || field.name;
    affectedTableIds.add(table.id);

    successfulModifications.push({
      tableId: table.id,
      tableName: table.name,
      fieldId: field.id,
      fieldOldName: field.name,
      fieldNewName: newFieldName,
      undo: { ...undoValues },
      redo: { ...redoValues },
      appliedChanges,
      oldFieldSummary,
      newFieldSummary,
    });

    results.push({
      success: true,
      table: tableName,
      table_id: table.id,
      table_actual_name: table.name,
      field: fieldName,
      field_actual_name: newFieldName,
      field_id: field.id,
      applied_changes: appliedChanges,
      old_summary: oldFieldSummary,
      new_summary: newFieldSummary,
      old_values: {
        name: field.name,
        type: field.type,
      },
      new_values: {
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

  const affectedTables = Array.from(affectedTableIds).map((tableId) => {
    const table = tables.find((t) => t.id === tableId);
    return {
      name: table?.name,
      id: tableId,
      field_count: table?.fields.length,
      modified_fields: successfulModifications
        .filter((m) => m.tableId === tableId)
        .map((m) => ({
          old_name: m.fieldOldName,
          new_name: m.fieldNewName,
          changes: m.appliedChanges,
          old_summary: m.oldFieldSummary,
          new_summary: m.newFieldSummary,
        })),
    };
  });

  let message = "";
  if (successCount > 0) {
    message += `Successfully modified ${successCount} field(s): `;
    message += results
      .filter((r) => r.success)
      .map((r) => {
        const changes = r.applied_changes.join(", ");
        return `${r.table_actual_name}.${r.field_actual_name} (${changes})`;
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

  const summary = buildToolResultSummary(
    "modify_fields",
    successCount,
    failCount,
    results,
    affectedTables,
    []
  );
  summary.message = message;
  return summary;
}

function executeArrangeTables(args, { tables, relationships, diagram, setUndoStack, setRedoStack }) {
  const {
    tables: targetTableNames = null,
    mode = "auto",
    scope = "local",
    recent_table_ids = [],
    recent_relationship_ids = [],
  } = args;

  const results = [];
  let targetTableIds = null;

  if (mode === "specified" && targetTableNames && Array.isArray(targetTableNames)) {
    targetTableIds = [];
    for (const tableName of targetTableNames) {
      const table = findTableIgnoreCase(tables, tableName);
      if (table) {
        targetTableIds.push(table.id);
        results.push({
          success: true,
          table_name: table.name,
          table_id: table.id,
          action: "included",
        });
      } else {
        results.push({
          success: false,
          error: `Table "${tableName}" not found`,
          requested_table: tableName,
        });
      }
    }
  }

  const recentRelationships = [];
  if (recent_relationship_ids && Array.isArray(recent_relationship_ids)) {
    for (const relId of recent_relationship_ids) {
      const rel = relationships.find((r) => r.id === relId);
      if (rel) {
        recentRelationships.push(rel);
      }
    }
  }

  const validRecentTableIds = [];
  if (recent_table_ids && Array.isArray(recent_table_ids)) {
    for (const tableId of recent_table_ids) {
      const table = tables.find((t) => t.id === tableId);
      if (table) {
        validRecentTableIds.push(tableId);
      }
    }
  }

  const allTablesClone = tables.map((t) => ({ ...t }));

  const arrangeResult = arrangeTablesSmart({
    tables,
    allTables: allTablesClone,
    relationships,
    targetTableIds,
    recentTableIds: validRecentTableIds,
    recentRelationships,
    mode,
    scope,
  });

  const { moves, tablesToArrange } = arrangeResult;

  if (moves.length > 0) {
    moves.forEach((move) => {
      const table = tables.find((t) => t.id === move.tableId);
      if (table) {
        table.x = move.newX;
        table.y = move.newY;
        diagram.updateTable(move.tableId, { x: move.newX, y: move.newY });

        results.push({
          success: true,
          table_name: move.tableName,
          table_id: move.tableId,
          action: "moved",
          old_x: move.oldX,
          old_y: move.oldY,
          new_x: move.newX,
          new_y: move.newY,
          display_text: `${move.tableName} (${Math.round(move.oldX)},${Math.round(move.oldY)}) → (${Math.round(move.newX)},${Math.round(move.newY)})`,
        });
      }
    });

    if (setUndoStack && setRedoStack) {
      const undoRedoEntry = buildUndoRedoForArrange(moves);
      if (undoRedoEntry) {
        setUndoStack((prev) => [...prev, undoRedoEntry]);
        setRedoStack([]);
      }
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  const affectedTables = moves.map((move) => {
    const table = tables.find((t) => t.id === move.tableId);
    return {
      name: move.tableName,
      id: move.tableId,
      field_count: table?.fields.length || 0,
      old_x: move.oldX,
      old_y: move.oldY,
      new_x: move.newX,
      new_y: move.newY,
    };
  });

  let message = "";
  if (moves.length > 0) {
    message = `Arranged ${moves.length} table(s): ${moves.map((m) => m.tableName).join(", ")}`;
  } else if (tablesToArrange.length > 0) {
    message = `No table movements needed. ${tablesToArrange.length} table(s) checked but already well positioned.`;
  } else {
    message = "No tables were selected for arrangement.";
  }

  const summary = buildToolResultSummary(
    "arrange_tables",
    successCount,
    failCount,
    results,
    affectedTables,
    []
  );
  summary.message = message;
  return summary;
}

const toolRegistry = {
  inspect_tables: {
    schema: {
      name: "inspect_tables",
      description:
        "Inspect existing tables by name before deciding whether to reuse or modify them. Use this when the full table index suggests a table may be relevant but its fields are not shown in the current prompt.",
      parameters: {
        type: "object",
        properties: {
          tables: {
            type: "array",
            description: "Table names to inspect. Matching is case-insensitive.",
            items: {
              type: "string",
            },
          },
        },
        required: ["tables"],
      },
    },
    executor: executeInspectTables,
    uiConfig: {
      getToolLabel: (result, t) => {
        const successCount = result.details?.filter((r) => r.success).length || 0;
        return successCount > 0 ? `Inspected ${successCount} table(s)` : (t ? t("ai_tool_executed") : "Tool executed");
      },
      getDisplayText: (item) => {
        return item.tableName || item.table_name || "table";
      },
      category: "read",
    },
  },

  create_tables: {
    schema: {
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
    executor: executeCreateTables,
    uiConfig: {
      getToolLabel: (result, t) => {
        const successCount = result.details?.filter((r) => r.success).length || 0;
        if (successCount > 0 && t) {
          return t("ai_tables_created", { count: successCount });
        }
        return successCount > 0 ? `Created ${successCount} table(s)` : (t ? t("ai_tool_executed") : "Tool executed");
      },
      getDisplayText: (item) => {
        return item.tableName || item.table_name || "table";
      },
      category: "write",
    },
  },

  create_relationships: {
    schema: {
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
    executor: executeCreateRelationships,
    uiConfig: {
      getToolLabel: (result, t) => {
        const successCount = result.details?.filter((r) => r.success).length || 0;
        return successCount > 0 ? `Created ${successCount} relationship(s)` : (t ? t("ai_tool_executed") : "Tool executed");
      },
      getDisplayText: (item) => {
        const from = `${item.from_table || "from"}.${item.from_field || "field"}`;
        const to = `${item.to_table || "to"}.${item.to_field || "field"}`;
        const cardinality = item.cardinality_display || item.cardinality || "";
        return cardinality ? `${from} -> ${to} (${cardinality})` : `${from} -> ${to}`;
      },
      category: "write",
    },
  },

  add_fields: {
    schema: {
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
    executor: executeAddFields,
    uiConfig: {
      getToolLabel: (result, t) => {
        const successCount = result.details?.filter((r) => r.success).length || 0;
        return successCount > 0 ? `Added ${successCount} field(s)` : (t ? t("ai_tool_executed") : "Tool executed");
      },
      getDisplayText: (item) => {
        const tableName = item.table_actual_name || item.table || item.table_name || item.tableName;
        const fieldName = item.field_name || item.field;
        return `${tableName}.${fieldName}`;
      },
      category: "write",
    },
  },

  modify_fields: {
    schema: {
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
    executor: executeModifyFields,
    uiConfig: {
      getToolLabel: (result, t) => {
        const successCount = result.details?.filter((r) => r.success).length || 0;
        return successCount > 0 ? `Modified ${successCount} field(s)` : (t ? t("ai_tool_executed") : "Tool executed");
      },
      getDisplayText: (item) => {
        const tableName = item.table_actual_name || item.table || item.table_name || item.tableName;
        const fieldName = item.field_actual_name || item.field;
        return `${tableName}.${fieldName}`;
      },
      category: "write",
    },
  },

  arrange_tables: {
    schema: {
      name: "arrange_tables",
      description:
        "Arrange table positions on the canvas to avoid overlaps, reduce line crossings, and place related tables closer together. Use this after creating tables or relationships if the layout looks messy. Only rearranges affected tables locally when possible, avoiding full diagram rearrangement unless necessary.",
      parameters: {
        type: "object",
        properties: {
          tables: {
            type: "array",
            description: "Specific table names to arrange. If provided, mode should be 'specified'. Table name matching is case-insensitive.",
            items: {
              type: "string",
            },
          },
          mode: {
            type: "string",
            description: "Arrange mode: 'auto' (auto-detect affected tables) or 'specified' (arrange specific tables). Default is 'auto'.",
            enum: ["auto", "specified"],
            default: "auto",
          },
          scope: {
            type: "string",
            description: "Arrange scope: 'local' (only rearrange related tables) or 'full' (rearrange all tables). Default is 'local'.",
            enum: ["local", "full"],
            default: "local",
          },
          recent_table_ids: {
            type: "array",
            description: "IDs of recently created or modified tables. Used in 'auto' mode to detect which tables need arrangement.",
            items: {
              type: "string",
            },
          },
          recent_relationship_ids: {
            type: "array",
            description: "IDs of recently created relationships. Used in 'auto' mode to detect which tables need arrangement.",
            items: {
              type: "string",
            },
          },
        },
      },
    },
    executor: executeArrangeTables,
    uiConfig: {
      getToolLabel: (result, t) => {
        const movedCount = result.details?.filter((r) => r.success && r.action === "moved").length || 0;
        if (movedCount > 0) {
          return `Arranged ${movedCount} table(s)`;
        }
        return t ? t("ai_tool_executed") : "Tool executed";
      },
      getDisplayText: (item) => {
        return item.display_text || item.table_name || item.table || "table";
      },
      category: "write",
    },
  },
};

export const toolDefinitions = Object.values(toolRegistry).map((tool) => tool.schema);

export function getToolUIConfig(toolName) {
  const tool = toolRegistry[toolName];
  return tool?.uiConfig || null;
}

export function executeTool(
  toolName,
  args,
  { tables, relationships, diagram, setUndoStack, setRedoStack },
) {
  let parsedArgs;
  try {
    parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
  } catch {
    return {
      tool: toolName,
      success: false,
      successCount: 0,
      failCount: 1,
      message: `Failed to execute tool "${toolName}": Invalid JSON in tool arguments`,
      details: [
        {
          success: false,
          error: `Failed to parse tool arguments: invalid JSON`,
        },
      ],
      affected_tables: [],
      affected_relationships: [],
    };
  }

  const tool = toolRegistry[toolName];
  if (!tool) {
    return {
      tool: toolName,
      success: false,
      successCount: 0,
      failCount: 1,
      message: `Failed to execute tool: Unknown tool "${toolName}"`,
      details: [
        {
          success: false,
          error: `Unknown tool: ${toolName}`,
        },
      ],
      affected_tables: [],
      affected_relationships: [],
    };
  }

  const context = {
    tables,
    relationships,
    diagram,
    setUndoStack,
    setRedoStack,
  };

  return tool.executor(parsedArgs, context);
}
