import axios from "axios";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 4096;

export async function generateDatabaseSchema(
  userPrompt,
  apiKey,
  baseUrl,
  databaseType = "generic",
  existingTables = []
) {
  if (!apiKey) {
    throw new Error("API Key is required");
  }

  const systemPrompt = buildSystemPrompt(databaseType, existingTables);

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      max_tokens: DEFAULT_MAX_TOKENS,
      response_format: { type: "json_object" },
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  const content = response.data.choices[0].message.content;
  return parseAIResponse(content);
}

function buildSystemPrompt(databaseType, existingTables) {
  let prompt = `你是一个专业的数据库设计专家。根据用户的自然语言描述，生成符合 drawDB 内部格式的 JSON 数据结构。

**重要要求：**
1. 只输出 JSON 格式的数据，不要包含任何其他文本或解释
2. 输出必须是一个有效的 JSON 对象
3. 确保所有字段名和格式严格符合要求

**drawDB 数据格式说明：**

输出的 JSON 应该包含以下结构：
{
  "tables": [
    {
      "id": "唯一标识符字符串",
      "name": "表名（使用 snake_case 命名规范）",
      "comment": "表的注释说明",
      "fields": [
        {
          "id": "字段唯一标识符",
          "name": "字段名",
          "type": "字段类型（根据数据库类型选择合适的类型）",
          "default": "默认值（字符串，没有则为空字符串）",
          "check": "CHECK 约束（字符串，没有则为空字符串）",
          "primary": true/false,
          "unique": true/false,
          "notNull": true/false,
          "increment": true/false,
          "comment": "字段注释"
        }
      ],
      "indices": [
        {
          "name": "索引名",
          "unique": true/false,
          "fields": ["字段名1", "字段名2"]
        }
      ],
      "color": "#175e7a"
    }
  ],
  "relationships": [
    {
      "id": "关系唯一标识符",
      "name": "关系名",
      "startTableId": "起始表的 id",
      "startFieldId": "起始字段的 id",
      "endTableId": "目标表的 id",
      "endFieldId": "目标字段的 id",
      "cardinality": "one_to_one 或 one_to_many 或 many_to_one",
      "updateConstraint": "No action",
      "deleteConstraint": "No action"
    }
  ]
}

**设计规范：**
1. 每个表都应该有一个主键（通常命名为 id，类型为 INTEGER 或 INT，自增）
2. 外键字段命名规范：{关联表名}_id
3. 使用 snake_case 命名规范（下划线分隔）
4. 根据业务逻辑合理设计一对多、多对多关系
5. 多对多关系需要创建中间关联表
6. 为常用查询字段添加索引
7. 添加合理的注释说明

**数据库类型：${databaseType}

**字段类型建议：**
- 主键：INTEGER 或 INT（自增）
- 字符串：VARCHAR 或 TEXT
- 数字：INTEGER、BIGINT、DECIMAL
- 日期时间：DATETIME、TIMESTAMP、DATE
- 布尔值：BOOLEAN 或 TINYINT
- 文本：TEXT

**关系类型说明：**
- one_to_one: 一对一关系
- one_to_many: 一对多关系（通常从主键表指向外键表）
- many_to_one: 多对一关系

`;

  if (existingTables && existingTables.length > 0) {
    prompt += `\n**现有表信息：**
以下是当前画板中已存在的表，如果你需要创建与这些表相关联的新表，请确保使用正确的外键关系：
${JSON.stringify(existingTables.map(t => ({
  id: t.id,
  name: t.name,
  fields: t.fields.map(f => ({ id: f.id, name: f.name, type: f.type }))
})), null, 2)}

请确保新生成的表与现有表之间的关系使用正确的表 id 和字段 id。
`;
  }

  prompt += `
现在，请根据用户的描述，生成符合上述格式的 JSON 数据。只输出 JSON，不要输出任何其他内容。`;

  return prompt;
}

function parseAIResponse(content) {
  try {
    let jsonStr = content.trim();
    
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    
    jsonStr = jsonStr.trim();
    
    const parsed = JSON.parse(jsonStr);
    
    if (!parsed.tables) {
      parsed.tables = [];
    }
    
    if (!parsed.relationships) {
      parsed.relationships = [];
    }
    
    return validateAndNormalizeSchema(parsed);
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    console.error("Raw content:", content);
    throw new Error("Failed to parse AI response. Please try again.");
  }
}

function validateAndNormalizeSchema(schema) {
  const { tables, relationships } = schema;
  
  const normalizedTables = tables.map(table => ({
    id: table.id || generateId(),
    name: table.name || "unnamed_table",
    x: 0,
    y: 0,
    fields: (table.fields || []).map(field => ({
      id: field.id || generateId(),
      name: field.name || "unnamed_field",
      type: field.type || "TEXT",
      default: field.default !== undefined ? String(field.default) : "",
      check: field.check || "",
      primary: field.primary || false,
      unique: field.unique || false,
      notNull: field.notNull || false,
      increment: field.increment || false,
      comment: field.comment || "",
    })),
    comment: table.comment || "",
    locked: table.locked || false,
    hidden: table.hidden || false,
    indices: (table.indices || []).map((index, i) => ({
      name: index.name || `index_${i}`,
      unique: index.unique || false,
      fields: index.fields || [],
    })),
    color: table.color || "#175e7a",
    inherits: table.inherits || [],
  }));
  
  const tableIdMap = new Map();
  const fieldIdMap = new Map();
  
  normalizedTables.forEach(table => {
    tableIdMap.set(table.name, table.id);
    table.fields.forEach(field => {
      fieldIdMap.set(`${table.name}.${field.name}`, field.id);
    });
  });
  
  const normalizedRelationships = relationships.map(rel => {
    let startTableId = rel.startTableId;
    let startFieldId = rel.startFieldId;
    let endTableId = rel.endTableId;
    let endFieldId = rel.endFieldId;
    
    if (rel.startTableName && tableIdMap.has(rel.startTableName)) {
      startTableId = tableIdMap.get(rel.startTableName);
    }
    if (rel.endTableName && tableIdMap.has(rel.endTableName)) {
      endTableId = tableIdMap.get(rel.endTableName);
    }
    
    if (rel.startFieldName && rel.startTableName) {
      const key = `${rel.startTableName}.${rel.startFieldName}`;
      if (fieldIdMap.has(key)) {
        startFieldId = fieldIdMap.get(key);
      }
    }
    if (rel.endFieldName && rel.endTableName) {
      const key = `${rel.endTableName}.${rel.endFieldName}`;
      if (fieldIdMap.has(key)) {
        endFieldId = fieldIdMap.get(key);
      }
    }
    
    return {
      id: rel.id || generateId(),
      name: rel.name || generateRelationshipName(),
      startTableId: startTableId,
      startFieldId: startFieldId,
      endTableId: endTableId,
      endFieldId: endFieldId,
      cardinality: rel.cardinality || "one_to_many",
      updateConstraint: rel.updateConstraint || "No action",
      deleteConstraint: rel.deleteConstraint || "No action",
    };
  }).filter(rel => 
    rel.startTableId && 
    rel.startFieldId && 
    rel.endTableId && 
    rel.endFieldId
  );
  
  return {
    tables: normalizedTables,
    relationships: normalizedRelationships,
  };
}

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

function generateRelationshipName() {
  return `rel_${generateId()}`;
}
