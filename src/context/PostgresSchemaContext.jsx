import { createContext, useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "drawdb_postgres_schema_context";

const defaultSchemaContext = {
  connectedSchema: null,
  setConnectedSchema: () => {},
  clearConnectedSchema: () => {},
  hasConnectedSchema: false,
};

export const PostgresSchemaContext = createContext(defaultSchemaContext);

export default function PostgresSchemaContextProvider({ children }) {
  const [connectedSchema, setConnectedSchemaState] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setConnectedSchemaState(parsed);
      }
    } catch (e) {
      console.error("Failed to load Postgres schema context:", e);
    }
  }, []);

  useEffect(() => {
    if (connectedSchema) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(connectedSchema));
      } catch (e) {
        console.error("Failed to save Postgres schema context:", e);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [connectedSchema]);

  const setConnectedSchema = useCallback((schemaData, connectionInfo) => {
    if (!schemaData) {
      setConnectedSchemaState(null);
      return;
    }

    const sanitizedSchema = {
      database: connectionInfo?.database || null,
      schema: schemaData.schema || "public",
      tables: schemaData.tables?.map((table) => ({
        name: table.name,
        tableType: table.tableType,
        comment: table.comment,
        fieldCount: table.fields?.length || 0,
        fields: table.fields?.map((field) => ({
          name: field.name,
          type: field.type,
          size: field.size,
          isNullable: field.isNullable,
          isPrimaryKey: field.isPrimaryKey,
          isUnique: field.isUnique,
          comment: field.comment,
        })),
        foreignKeys: table.foreignKeys?.map((fk) => ({
          constraintName: fk.constraintName,
          columnName: fk.columnName,
          foreignTableName: fk.foreignTableName,
          foreignColumnName: fk.foreignColumnName,
          updateRule: fk.updateRule,
          deleteRule: fk.deleteRule,
        })),
        uniqueConstraints: table.uniqueConstraints?.map((uc) => ({
          constraintName: uc.constraintName,
          columns: uc.columns,
        })),
        primaryKey: table.primaryKey
          ? {
              constraintName: table.primaryKey.constraintName,
              columns: table.primaryKey.columns,
            }
          : null,
      })),
      fetchedAt: new Date().toISOString(),
    };

    setConnectedSchemaState(sanitizedSchema);
  }, []);

  const clearConnectedSchema = useCallback(() => {
    setConnectedSchemaState(null);
  }, []);

  const hasConnectedSchema = connectedSchema !== null;

  return (
    <PostgresSchemaContext.Provider
      value={{
        connectedSchema,
        setConnectedSchema,
        clearConnectedSchema,
        hasConnectedSchema,
      }}
    >
      {children}
    </PostgresSchemaContext.Provider>
  );
}
