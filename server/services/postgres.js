import pg from "pg";

const { Pool } = pg;

export class PostgresError extends Error {
  constructor(message, type, code, originalError) {
    super(message);
    this.type = type;
    this.code = code;
    this.statusCode = 400;
    this.originalError = originalError;
    this.name = "PostgresError";
  }
}

function createPool(connectionParams) {
  const { host, port, database, user, password } = connectionParams;

  const poolConfig = {
    host,
    port: parseInt(port, 10),
    database,
    user,
    password,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  return new Pool(poolConfig);
}

function formatPostgresError(err) {
  let errorType = "DatabaseError";
  let message = "Database connection error";

  if (err.code) {
    switch (err.code) {
      case "ECONNREFUSED":
        errorType = "ConnectionRefused";
        message = `Could not connect to PostgreSQL server at ${err.address}:${err.port}. Please check if the server is running and the port is open.`;
        break;
      case "ENOTFOUND":
        errorType = "HostNotFound";
        message = `Host "${err.hostname}" not found. Please check the host address.`;
        break;
      case "ETIMEDOUT":
        errorType = "ConnectionTimeout";
        message = "Connection timed out. Please check the host and port, and ensure the server is reachable.";
        break;
      case "28P01":
        errorType = "AuthenticationFailed";
        message = "Invalid username or password. Please check your credentials.";
        break;
      case "3D000":
        errorType = "DatabaseNotFound";
        message = `Database does not exist. Please check the database name.`;
        break;
      case "28000":
        errorType = "InvalidAuthorization";
        message = "Invalid authorization specification. Please check your connection parameters.";
        break;
      case "42501":
        errorType = "InsufficientPrivileges";
        message = "Insufficient privileges to access the requested resource.";
        break;
      default:
        message = err.message || "Database error occurred";
        if (err.code) {
          message = `${message} (Error code: ${err.code})`;
        }
    }
  } else if (err.message) {
    message = err.message;
  }

  return new PostgresError(message, errorType, err.code || "UNKNOWN", err);
}

export async function testConnection(connectionParams) {
  let pool = null;
  try {
    pool = createPool(connectionParams);
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    await pool.end();
    return {
      success: true,
      message: "Connection successful",
      data: {
        host: connectionParams.host,
        port: connectionParams.port,
        database: connectionParams.database,
        user: connectionParams.user,
      },
    };
  } catch (err) {
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        // Ignore pool end errors
      }
    }
    throw formatPostgresError(err);
  }
}

export async function getDatabaseStructure(connectionParams) {
  let pool = null;
  try {
    pool = createPool(connectionParams);
    const client = await pool.connect();

    const schema = connectionParams.schema || "public";

    const tables = await getTables(client, schema);
    const fields = await getFields(client, schema);
    const primaryKeys = await getPrimaryKeys(client, schema);
    const foreignKeys = await getForeignKeys(client, schema);
    const uniqueConstraints = await getUniqueConstraints(client, schema);
    const tableComments = await getTableComments(client, schema);
    const columnComments = await getColumnComments(client, schema);

    client.release();
    await pool.end();

    const structure = buildStructure(
      tables,
      fields,
      primaryKeys,
      foreignKeys,
      uniqueConstraints,
      tableComments,
      columnComments
    );

    return {
      success: true,
      data: structure,
    };
  } catch (err) {
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        // Ignore pool end errors
      }
    }
    throw formatPostgresError(err);
  }
}

async function getTables(client, schema) {
  const result = await client.query(
    `
    SELECT 
      t.table_name,
      t.table_type
    FROM information_schema.tables t
    WHERE t.table_schema = $1
      AND t.table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY t.table_name
  `,
    [schema]
  );
  return result.rows;
}

async function getFields(client, schema) {
  const result = await client.query(
    `
    SELECT 
      c.table_name,
      c.column_name,
      c.ordinal_position,
      c.column_default,
      c.is_nullable,
      c.data_type,
      c.character_maximum_length,
      c.character_octet_length,
      c.numeric_precision,
      c.numeric_precision_radix,
      c.numeric_scale,
      c.datetime_precision,
      c.interval_type,
      c.interval_precision,
      c.collation_name,
      c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = $1
    ORDER BY c.table_name, c.ordinal_position
  `,
    [schema]
  );
  return result.rows;
}

async function getPrimaryKeys(client, schema) {
  const result = await client.query(
    `
    SELECT 
      tc.table_name,
      kcu.column_name,
      kcu.ordinal_position,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name 
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = $1
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `,
    [schema]
  );
  return result.rows;
}

async function getForeignKeys(client, schema) {
  const result = await client.query(
    `
    SELECT 
      tc.constraint_name,
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.update_rule,
      rc.delete_rule,
      kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name 
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu 
      ON ccu.constraint_name = tc.constraint_name 
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc 
      ON rc.constraint_name = tc.constraint_name 
      AND rc.constraint_schema = tc.table_schema
    WHERE tc.table_schema = $1
      AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `,
    [schema]
  );
  return result.rows;
}

async function getUniqueConstraints(client, schema) {
  const result = await client.query(
    `
    SELECT 
      tc.constraint_name,
      tc.table_name,
      kcu.column_name,
      kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name 
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = $1
      AND tc.constraint_type = 'UNIQUE'
    ORDER BY tc.table_name, kcu.ordinal_position
  `,
    [schema]
  );
  return result.rows;
}

async function getTableComments(client, schema) {
  const result = await client.query(
    `
    SELECT 
      c.relname AS table_name,
      obj_description(c.oid) AS comment
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relkind IN ('r', 'v')
  `,
    [schema]
  );
  return result.rows;
}

async function getColumnComments(client, schema) {
  const result = await client.query(
    `
    SELECT 
      c.relname AS table_name,
      a.attname AS column_name,
      col_description(a.attrelid, a.attnum) AS comment
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND a.attnum > 0
      AND NOT a.attisdropped
  `,
    [schema]
  );
  return result.rows;
}

function buildStructure(
  tables,
  fields,
  primaryKeys,
  foreignKeys,
  uniqueConstraints,
  tableComments,
  columnComments
) {
  const tableMap = new Map();

  const primaryKeysByTable = groupBy(primaryKeys, "table_name");
  const fieldsByTable = groupBy(fields, "table_name");
  const foreignKeysByTable = groupBy(foreignKeys, "table_name");
  const uniqueConstraintsByTable = groupBy(uniqueConstraints, "table_name");
  const uniqueConstraintsByConstraint = groupBy(uniqueConstraints, "constraint_name");
  const tableCommentsByName = keyBy(tableComments, "table_name");
  const columnCommentsByTable = groupBy(columnComments, "table_name");

  tables.forEach((table) => {
    const tableName = table.table_name;
    const tableFields = fieldsByTable.get(tableName) || [];
    const tablePrimaryKeys = primaryKeysByTable.get(tableName) || [];
    const tableForeignKeys = foreignKeysByTable.get(tableName) || [];
    const tableUniqueConstraints = uniqueConstraintsByTable.get(tableName) || [];
    const tableComment = tableCommentsByName.get(tableName);
    const tableColumnComments = columnCommentsByTable.get(tableName) || [];

    const columnCommentsMap = new Map();
    tableColumnComments.forEach((cc) => {
      columnCommentsMap.set(cc.column_name, cc.comment);
    });

    const primaryKeyColumns = new Set();
    tablePrimaryKeys.forEach((pk) => {
      primaryKeyColumns.add(pk.column_name);
    });

    const uniqueColumns = new Set();
    tableUniqueConstraints.forEach((uc) => {
      const constraintColumns = uniqueConstraintsByConstraint.get(uc.constraint_name) || [];
      if (constraintColumns.length === 1) {
        uniqueColumns.add(uc.column_name);
      }
    });

    const fieldsResult = tableFields.map((field) => {
      const isPrimary = primaryKeyColumns.has(field.column_name);
      const isUnique = uniqueColumns.has(field.column_name);
      const comment = columnCommentsMap.get(field.column_name) || null;

      const typeInfo = parseDataType(field);

      return {
        name: field.column_name,
        type: typeInfo.type,
        size: typeInfo.size,
        defaultValue: field.column_default || null,
        isNullable: field.is_nullable === "YES",
        isPrimaryKey: isPrimary,
        isUnique: isUnique,
        comment: comment,
        ordinalPosition: field.ordinal_position,
        dataType: field.data_type,
        udtName: field.udt_name,
      };
    });

    const foreignKeyResult = tableForeignKeys.map((fk) => {
      return {
        constraintName: fk.constraint_name,
        columnName: fk.column_name,
        foreignTableName: fk.foreign_table_name,
        foreignColumnName: fk.foreign_column_name,
        updateRule: fk.update_rule,
        deleteRule: fk.delete_rule,
      };
    });

    const uniqueConstraintsResult = Array.from(
      new Set(tableUniqueConstraints.map((uc) => uc.constraint_name))
    ).map((constraintName) => {
      const constraintColumns = uniqueConstraintsByConstraint.get(constraintName) || [];
      const firstConstraint = constraintColumns[0];
      return {
        constraintName: constraintName,
        tableName: firstConstraint?.table_name,
        columns: constraintColumns
          .sort((a, b) => a.ordinal_position - b.ordinal_position)
          .map((c) => c.column_name),
      };
    });

    const tableResult = {
      name: tableName,
      tableType: table.table_type,
      comment: tableComment?.comment || null,
      fields: fieldsResult,
      foreignKeys: foreignKeyResult,
      uniqueConstraints: uniqueConstraintsResult,
      primaryKey: {
        constraintName: tablePrimaryKeys[0]?.constraint_name || null,
        columns: tablePrimaryKeys
          .sort((a, b) => a.ordinal_position - b.ordinal_position)
          .map((pk) => pk.column_name),
      },
    };

    tableMap.set(tableName, tableResult);
  });

  return {
    tables: Array.from(tableMap.values()),
    schema: tables[0]?.table_schema || "public",
  };
}

function parseDataType(field) {
  let type = field.udt_name || field.data_type;
  let size = null;

  if (field.character_maximum_length !== null) {
    size = field.character_maximum_length.toString();
  } else if (field.numeric_precision !== null && field.numeric_scale !== null) {
    if (field.numeric_scale > 0) {
      size = `${field.numeric_precision},${field.numeric_scale}`;
    } else {
      size = field.numeric_precision.toString();
    }
  } else if (field.datetime_precision !== null) {
    size = field.datetime_precision.toString();
  }

  const udtName = field.udt_name;
  if (udtName) {
    if (udtName === "bpchar") {
      type = "CHAR";
    } else if (udtName === "varchar") {
      type = "VARCHAR";
    } else if (udtName === "int4") {
      type = "INTEGER";
    } else if (udtName === "int8") {
      type = "BIGINT";
    } else if (udtName === "float8") {
      type = "DOUBLE PRECISION";
    } else if (udtName === "float4") {
      type = "REAL";
    } else if (udtName === "bool") {
      type = "BOOLEAN";
    } else if (udtName === "timestamp") {
      type = "TIMESTAMP";
    } else if (udtName === "timestamptz") {
      type = "TIMESTAMP WITH TIME ZONE";
    } else if (udtName === "date") {
      type = "DATE";
    } else if (udtName === "time") {
      type = "TIME";
    } else if (udtName === "timetz") {
      type = "TIME WITH TIME ZONE";
    } else if (udtName === "text") {
      type = "TEXT";
    } else if (udtName === "json") {
      type = "JSON";
    } else if (udtName === "jsonb") {
      type = "JSONB";
    } else if (udtName === "uuid") {
      type = "UUID";
    } else if (udtName === "bytea") {
      type = "BYTEA";
    } else if (udtName === "numeric") {
      type = "NUMERIC";
    }
  }

  return { type, size };
}

function groupBy(array, key) {
  const map = new Map();
  array.forEach((item) => {
    const groupKey = item[key];
    if (!map.has(groupKey)) {
      map.set(groupKey, []);
    }
    map.get(groupKey).push(item);
  });
  return map;
}

function keyBy(array, key) {
  const map = new Map();
  array.forEach((item) => {
    map.set(item[key], item);
  });
  return map;
}
