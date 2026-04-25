import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Input,
  Banner,
  Space,
  Tabs,
  TabPane,
  Table,
  Checkbox,
} from "@douyinfe/semi-ui";
import { STATUS } from "../../../data/constants";
import {
  testConnection,
  getDatabaseStructure,
  PostgresConnectionError,
} from "../../../api/postgres";

const STORAGE_KEY = "drawdb_postgres_connection";

function loadSavedConnection() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        host: parsed.host || "localhost",
        port: parsed.port || "5432",
        database: parsed.database || "",
        schema: parsed.schema || "public",
        user: parsed.user || "",
        password: "",
      };
    }
  } catch (e) {
    // Ignore parsing errors
  }
  return {
    host: "localhost",
    port: "5432",
    database: "",
    schema: "public",
    user: "",
    password: "",
  };
}

function saveConnection(connection) {
  try {
    const toSave = {
      host: connection.host,
      port: connection.port,
      database: connection.database,
      schema: connection.schema,
      user: connection.user,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    // Ignore storage errors
  }
}

export default function ImportPostgres({
  setConnectionParams,
  setFetchedSchema,
  setOverwrite,
  overwrite,
}) {
  const { t } = useTranslation();
  const [connection, setConnection] = useState(loadSavedConnection);
  const [status, setStatus] = useState({
    type: STATUS.NONE,
    message: "",
  });
  const [testingConnection, setTestingConnection] = useState(false);
  const [fetchingSchema, setFetchingSchema] = useState(false);
  const [schemaData, setSchemaData] = useState(null);

  const updateField = useCallback(
    (field, value) => {
      setConnection((prev) => ({ ...prev, [field]: value }));
      setStatus({ type: STATUS.NONE, message: "" });
      if (schemaData) {
        setSchemaData(null);
        if (setFetchedSchema) {
          setFetchedSchema(null);
        }
      }
    },
    [schemaData, setFetchedSchema]
  );

  const handleTestConnection = async () => {
    if (!connection.host || !connection.port || !connection.database || !connection.user) {
      setStatus({
        type: STATUS.ERROR,
        message: t("postgres_please_fill_fields"),
      });
      return;
    }

    setTestingConnection(true);
    setStatus({ type: STATUS.NONE, message: "" });

    try {
      const result = await testConnection(connection);
      setStatus({
        type: STATUS.OK,
        message: result.message || t("postgres_connection_success"),
      });
    } catch (err) {
      let errorMessage = t("postgres_fetch_failed");
      if (err instanceof PostgresConnectionError) {
        errorMessage = err.message;
        if (err.type) {
          errorMessage = `[${err.type}] ${errorMessage}`;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      setStatus({
        type: STATUS.ERROR,
        message: errorMessage,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleFetchSchema = async () => {
    if (!connection.host || !connection.port || !connection.database || !connection.user) {
      setStatus({
        type: STATUS.ERROR,
        message: t("postgres_please_fill_fields"),
      });
      return;
    }

    setFetchingSchema(true);
    setStatus({ type: STATUS.NONE, message: "" });
    setSchemaData(null);

    try {
      const result = await getDatabaseStructure(connection);

      if (result.success && result.data) {
        setSchemaData(result.data);
        saveConnection(connection);
        if (setConnectionParams) {
          setConnectionParams(connection);
        }
        if (setFetchedSchema) {
          setFetchedSchema(result.data);
        }
        setStatus({
          type: STATUS.OK,
          message: t("postgres_tables_fetched", { count: result.data.tables?.length || 0 }),
        });
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      let errorMessage = t("postgres_fetch_failed");
      if (err instanceof PostgresConnectionError) {
        errorMessage = err.message;
        if (err.type) {
          errorMessage = `[${err.type}] ${errorMessage}`;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      setStatus({
        type: STATUS.ERROR,
        message: errorMessage,
      });
    } finally {
      setFetchingSchema(false);
    }
  };

  const tableColumns = [
    {
      title: t("name"),
      dataIndex: "name",
      key: "name",
      width: 180,
    },
    {
      title: t("type"),
      dataIndex: "tableType",
      key: "tableType",
      width: 100,
      render: (text) =>
        text === "BASE TABLE"
          ? t("postgres_table_type_table")
          : text === "VIEW"
            ? t("postgres_table_type_view")
            : text,
    },
    {
      title: t("postgres_columns"),
      dataIndex: "fields",
      key: "fields",
      width: 80,
      render: (fields) => fields?.length || 0,
    },
    {
      title: t("comment"),
      dataIndex: "comment",
      key: "comment",
      render: (text) => text || t("postgres_na"),
    },
  ];

  const fieldColumns = [
    {
      title: t("name"),
      dataIndex: "name",
      key: "name",
      width: 150,
    },
    {
      title: t("type"),
      dataIndex: "type",
      key: "type",
      width: 120,
    },
    {
      title: t("size"),
      dataIndex: "size",
      key: "size",
      width: 80,
      render: (text) => text || t("postgres_na"),
    },
    {
      title: t("default_value"),
      dataIndex: "defaultValue",
      key: "defaultValue",
      render: (text) => text || t("postgres_na"),
    },
    {
      title: t("primary"),
      dataIndex: "isPrimaryKey",
      key: "isPrimaryKey",
      width: 40,
      render: (val) => (val ? t("postgres_yes") : t("postgres_no")),
    },
    {
      title: t("unique"),
      dataIndex: "isUnique",
      key: "isUnique",
      width: 50,
      render: (val) => (val ? t("postgres_yes") : t("postgres_no")),
    },
    {
      title: t("nullable"),
      dataIndex: "isNullable",
      key: "isNullable",
      width: 60,
      render: (val) => (val ? t("postgres_yes") : t("postgres_no")),
    },
  ];

  const fkColumns = [
    {
      title: t("name"),
      dataIndex: "constraintName",
      key: "constraintName",
      width: 180,
    },
    {
      title: t("name"),
      dataIndex: "columnName",
      key: "columnName",
      width: 120,
    },
    {
      title: t("foreign"),
      key: "references",
      render: (_, record) =>
        `${record.foreignTableName}.${record.foreignColumnName}`,
    },
    {
      title: t("on_update"),
      dataIndex: "updateRule",
      key: "updateRule",
      width: 100,
    },
    {
      title: t("on_delete"),
      dataIndex: "deleteRule",
      key: "deleteRule",
      width: 100,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--semi-color-text-2)" }}
          >
            {t("postgres_host")}{" "}
            <span style={{ color: "rgba(var(--semi-red-5), 1)" }}>*</span>
          </label>
          <Input
            value={connection.host}
            onChange={(value) => updateField("host", value)}
            placeholder="localhost"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--semi-color-text-2)" }}
          >
            {t("postgres_port")}{" "}
            <span style={{ color: "rgba(var(--semi-red-5), 1)" }}>*</span>
          </label>
          <Input
            value={connection.port}
            onChange={(value) => updateField("port", value)}
            placeholder="5432"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--semi-color-text-2)" }}
          >
            {t("postgres_database")}{" "}
            <span style={{ color: "rgba(var(--semi-red-5), 1)" }}>*</span>
          </label>
          <Input
            value={connection.database}
            onChange={(value) => updateField("database", value)}
            placeholder="mydb"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--semi-color-text-2)" }}
          >
            {t("postgres_schema")}
          </label>
          <Input
            value={connection.schema}
            onChange={(value) => updateField("schema", value)}
            placeholder="public"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--semi-color-text-2)" }}
          >
            {t("postgres_user")}{" "}
            <span style={{ color: "rgba(var(--semi-red-5), 1)" }}>*</span>
          </label>
          <Input
            value={connection.user}
            onChange={(value) => updateField("user", value)}
            placeholder="postgres"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--semi-color-text-2)" }}
          >
            {t("postgres_password")}
          </label>
          <Input
            mode="password"
            value={connection.password}
            onChange={(value) => updateField("password", value)}
            placeholder=""
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div>
        <Space>
          <Button
            theme="solid"
            onClick={handleFetchSchema}
            loading={fetchingSchema}
          >
            {fetchingSchema
              ? t("postgres_fetching_schema")
              : t("postgres_fetch_schema")}
          </Button>
          <Button
            onClick={handleTestConnection}
            loading={testingConnection}
          >
            {testingConnection
              ? t("postgres_testing")
              : t("postgres_test_connection")}
          </Button>
        </Space>
      </div>

      {schemaData && setOverwrite && (
        <div className="mt-2">
          <Checkbox
            aria-label="overwrite checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          >
            {t("overwrite_existing_diagram")}
          </Checkbox>
        </div>
      )}

      {status.type !== STATUS.NONE && (
        <Banner
          type={
            status.type === STATUS.ERROR
              ? "danger"
              : status.type === STATUS.OK
                ? "success"
                : "warning"
          }
          fullMode={false}
          description={<div>{status.message}</div>}
        />
      )}

      {schemaData && (
        <div className="mt-4">
          <Tabs
            style={{
              overflow: "hidden",
            }}
          >
            <TabPane tab={t("postgres_tables")} itemKey="tables">
              <div
                style={{
                  maxHeight: "350px",
                  overflow: "auto",
                }}
              >
                <Table
                  columns={tableColumns}
                  dataSource={schemaData.tables}
                  rowKey="name"
                  pagination={false}
                  size="small"
                />
              </div>
            </TabPane>
            {schemaData.tables?.length > 0 && (
              <TabPane tab={t("postgres_columns")} itemKey="columns">
                <div
                  style={{
                    maxHeight: "350px",
                    overflow: "auto",
                  }}
                >
                  <Table
                    columns={fieldColumns}
                    dataSource={schemaData.tables.flatMap((table) =>
                      (table.fields || []).map((field) => ({
                        ...field,
                        _tableName: table.name,
                        key: `${table.name}.${field.name}`,
                      }))
                    )}
                    rowKey="key"
                    pagination={false}
                    size="small"
                    expandRowByClick={true}
                    expandedRowRender={(record) => (
                      <div className="p-2 text-sm">
                        <span
                          className="font-medium"
                          style={{ color: "var(--semi-color-text-2)" }}
                        >
                          {t("name")}:
                        </span>{" "}
                        {record._tableName}
                        {record.comment && (
                          <div className="mt-1">
                            <span
                              className="font-medium"
                              style={{ color: "var(--semi-color-text-2)" }}
                            >
                              {t("comment")}:
                            </span>{" "}
                            {record.comment}
                          </div>
                        )}
                      </div>
                    )}
                  />
                </div>
              </TabPane>
            )}
            {schemaData.tables?.some((t) => t.foreignKeys?.length > 0) && (
              <TabPane tab={t("postgres_foreign_keys")} itemKey="foreignKeys">
                <div
                  style={{
                    maxHeight: "350px",
                    overflow: "auto",
                  }}
                >
                  <Table
                    columns={fkColumns}
                    dataSource={schemaData.tables.flatMap((table) =>
                      (table.foreignKeys || []).map((fk) => ({
                        ...fk,
                        _tableName: table.name,
                        key: `${table.name}.${fk.constraintName}`,
                      }))
                    )}
                    rowKey="key"
                    pagination={false}
                    size="small"
                    expandRowByClick={true}
                    expandedRowRender={(record) => (
                      <div className="p-2 text-sm">
                        <span
                          className="font-medium"
                          style={{ color: "var(--semi-color-text-2)" }}
                        >
                          {t("name")}:
                        </span>{" "}
                        {record._tableName}
                      </div>
                    )}
                  />
                </div>
              </TabPane>
            )}
            <TabPane tab={t("postgres_raw_json")} itemKey="json">
              <div
                className="p-3 rounded text-xs font-mono"
                style={{
                  background: "rgba(var(--semi-grey-0), 1)",
                  maxHeight: "350px",
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(schemaData, null, 2)}
              </div>
            </TabPane>
          </Tabs>
        </div>
      )}
    </div>
  );
}
