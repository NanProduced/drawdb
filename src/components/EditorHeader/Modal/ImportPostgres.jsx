import { useState } from "react";
import {
  Button,
  Input,
  Banner,
  Space,
  Tabs,
  TabPane,
  Table,
} from "@douyinfe/semi-ui";
import { STATUS } from "../../../data/constants";
import {
  testConnection,
  getDatabaseStructure,
  PostgresConnectionError,
} from "../../../api/postgres";

const defaultConnection = {
  host: "localhost",
  port: "5432",
  database: "",
  schema: "public",
  user: "",
  password: "",
};

export default function ImportPostgres({
  setConnectionParams,
  setFetchedSchema,
}) {
  const [connection, setConnection] = useState(defaultConnection);
  const [status, setStatus] = useState({
    type: STATUS.NONE,
    message: "",
  });
  const [testingConnection, setTestingConnection] = useState(false);
  const [fetchingSchema, setFetchingSchema] = useState(false);
  const [schemaData, setSchemaData] = useState(null);

  const updateField = (field, value) => {
    setConnection((prev) => ({ ...prev, [field]: value }));
    setStatus({ type: STATUS.NONE, message: "" });
  };

  const handleTestConnection = async () => {
    if (!connection.host || !connection.port || !connection.database || !connection.user) {
      setStatus({
        type: STATUS.ERROR,
        message: "Please fill in all required fields (Host, Port, Database, User)",
      });
      return;
    }

    setTestingConnection(true);
    setStatus({ type: STATUS.NONE, message: "" });

    try {
      const result = await testConnection(connection);
      setStatus({
        type: STATUS.OK,
        message: result.message || "Connection successful!",
      });
    } catch (err) {
      let errorMessage = "Connection failed";
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
        message: "Please fill in all required fields (Host, Port, Database, User)",
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
        if (setConnectionParams) {
          setConnectionParams(connection);
        }
        if (setFetchedSchema) {
          setFetchedSchema(result.data);
        }
        setStatus({
          type: STATUS.OK,
          message: `Successfully fetched ${result.data.tables?.length || 0} tables`,
        });
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      let errorMessage = "Failed to fetch schema";
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
      title: "Table",
      dataIndex: "name",
      key: "name",
      width: 180,
    },
    {
      title: "Type",
      dataIndex: "tableType",
      key: "tableType",
      width: 100,
      render: (text) => (text === "BASE TABLE" ? "Table" : text === "VIEW" ? "View" : text),
    },
    {
      title: "Columns",
      dataIndex: "fields",
      key: "fields",
      width: 80,
      render: (fields) => fields?.length || 0,
    },
    {
      title: "Comment",
      dataIndex: "comment",
      key: "comment",
      render: (text) => text || "-",
    },
  ];

  const fieldColumns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      width: 150,
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: 120,
    },
    {
      title: "Size",
      dataIndex: "size",
      key: "size",
      width: 80,
      render: (text) => text || "-",
    },
    {
      title: "Default",
      dataIndex: "defaultValue",
      key: "defaultValue",
      render: (text) => text || "-",
    },
    {
      title: "PK",
      dataIndex: "isPrimaryKey",
      key: "isPrimaryKey",
      width: 40,
      render: (val) => (val ? "✓" : ""),
    },
    {
      title: "Unique",
      dataIndex: "isUnique",
      key: "isUnique",
      width: 50,
      render: (val) => (val ? "✓" : ""),
    },
    {
      title: "Nullable",
      dataIndex: "isNullable",
      key: "isNullable",
      width: 60,
      render: (val) => (val ? "✓" : ""),
    },
  ];

  const fkColumns = [
    {
      title: "Constraint",
      dataIndex: "constraintName",
      key: "constraintName",
      width: 180,
    },
    {
      title: "Column",
      dataIndex: "columnName",
      key: "columnName",
      width: 120,
    },
    {
      title: "References",
      key: "references",
      render: (_, record) =>
        `${record.foreignTableName}.${record.foreignColumnName}`,
    },
    {
      title: "On Update",
      dataIndex: "updateRule",
      key: "updateRule",
      width: 100,
    },
    {
      title: "On Delete",
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
            Host <span style={{ color: "rgba(var(--semi-red-5), 1)" }}>*</span>
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
            Port <span style={{ color: "rgba(var(--semi-red-5), 1)" }}>*</span>
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
            Database <span style={{ color: "rgba(var(--semi-red-5), 1)" }}>*</span>
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
            Schema
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
            User <span style={{ color: "rgba(var(--semi-red-5), 1)" }}>*</span>
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
            Password
          </label>
          <Input
            mode="password"
            value={connection.password}
            onChange={(value) => updateField("password", value)}
            placeholder="Enter password"
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
            {fetchingSchema ? "Fetching Schema..." : "Fetch Schema"}
          </Button>
          <Button
            onClick={handleTestConnection}
            loading={testingConnection}
          >
            {testingConnection ? "Testing..." : "Test Connection"}
          </Button>
        </Space>
      </div>

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
            <TabPane tab="Tables" itemKey="tables">
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
              <TabPane tab="Columns" itemKey="columns">
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
                          Table:
                        </span>{" "}
                        {record._tableName}
                        {record.comment && (
                          <div className="mt-1">
                            <span
                              className="font-medium"
                              style={{ color: "var(--semi-color-text-2)" }}
                            >
                              Comment:
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
              <TabPane tab="Foreign Keys" itemKey="foreignKeys">
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
                          From Table:
                        </span>{" "}
                        {record._tableName}
                      </div>
                    )}
                  />
                </div>
              </TabPane>
            )}
            <TabPane tab="Raw JSON" itemKey="json">
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
