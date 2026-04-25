import {
  tableColorStripHeight,
  tableFieldHeight,
  tableHeaderHeight,
  tableWidth,
  ObjectType,
  Action,
} from "../data/constants";

const GAP_X = 60;
const GAP_Y = 50;

function getTableHeight(table) {
  return (
    table.fields.length * tableFieldHeight +
    tableHeaderHeight +
    tableColorStripHeight
  );
}

function getTableBounds(table, width = tableWidth) {
  return {
    x: table.x,
    y: table.y,
    width: width,
    height: getTableHeight(table),
  };
}

function rectsOverlap(rect1, rect2, padding = 0) {
  return (
    rect1.x < rect2.x + rect2.width + padding &&
    rect1.x + rect1.width + padding > rect2.x &&
    rect1.y < rect2.y + rect2.height + padding &&
    rect1.y + rect1.height + padding > rect2.y
  );
}

function getRelatedTableIds(tableId, relationships) {
  const relatedIds = new Set();
  relationships.forEach((r) => {
    if (r.startTableId === tableId) {
      relatedIds.add(r.endTableId);
    }
    if (r.endTableId === tableId) {
      relatedIds.add(r.startTableId);
    }
  });
  return relatedIds;
}

function getTablesWithRelationships(tables, relationships, targetTableIds) {
  const relatedIds = new Set(targetTableIds);
  
  targetTableIds.forEach((tableId) => {
    const directRelated = getRelatedTableIds(tableId, relationships);
    directRelated.forEach((id) => relatedIds.add(id));
  });
  
  return tables.filter((t) => relatedIds.has(t.id));
}

function buildRelationshipGraph(tables, relationships) {
  const tableIdSet = new Set(tables.map((t) => t.id));
  const graph = new Map();
  
  tables.forEach((t) => graph.set(t.id, { table: t, connections: [], degree: 0 }));
  
  relationships.forEach((r) => {
    if (!tableIdSet.has(r.startTableId) || !tableIdSet.has(r.endTableId)) return;
    
    const startNode = graph.get(r.startTableId);
    const endNode = graph.get(r.endTableId);
    
    if (startNode && endNode) {
      if (!startNode.connections.includes(r.endTableId)) {
        startNode.connections.push(r.endTableId);
        startNode.degree++;
      }
      if (!endNode.connections.includes(r.startTableId)) {
        endNode.connections.push(r.startTableId);
        endNode.degree++;
      }
    }
  });
  
  return graph;
}

function detectOverlappingTables(tables, width = tableWidth) {
  const overlapping = new Set();
  
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const rect1 = getTableBounds(tables[i], width);
      const rect2 = getTableBounds(tables[j], width);
      
      if (rectsOverlap(rect1, rect2, -5)) {
        overlapping.add(tables[i].id);
        overlapping.add(tables[j].id);
      }
    }
  }
  
  return overlapping;
}

function getRecentlyAffectedTables(tables, recentTableIds, recentRelationships, relationships) {
  const affectedIds = new Set(recentTableIds);
  
  recentRelationships.forEach((r) => {
    affectedIds.add(r.startTableId);
    affectedIds.add(r.endTableId);
  });
  
  recentTableIds.forEach((tableId) => {
    const directRelated = getRelatedTableIds(tableId, relationships);
    directRelated.forEach((id) => affectedIds.add(id));
  });
  
  return tables.filter((t) => affectedIds.has(t.id));
}

function getBoundingBox(tables, width = tableWidth) {
  if (tables.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  tables.forEach((table) => {
    const rect = getTableBounds(table, width);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  });
  
  return { minX, minY, maxX, maxY };
}

function arrangeByRelationshipsCompact(tables, relationships, width = tableWidth) {
  if (tables.length === 0) return [];
  
  const graph = buildRelationshipGraph(tables, relationships);
  const moves = [];
  
  const bbox = getBoundingBox(tables, width);
  const baseX = Math.max(0, bbox.minX);
  const baseY = Math.max(0, bbox.minY);
  
  const sortedByDegree = Array.from(graph.values()).sort((a, b) => b.degree - a.degree);
  
  if (sortedByDegree.length === 0) return [];
  
  const visited = new Set();
  const layers = [];
  const isolated = [];
  
  for (const node of sortedByDegree) {
    if (visited.has(node.table.id)) continue;
    
    if (node.degree === 0) {
      isolated.push(node.table.id);
      visited.add(node.table.id);
      continue;
    }
    
    const componentLayers = [];
    let currentLayer = [node.table.id];
    visited.add(node.table.id);
    
    while (currentLayer.length > 0) {
      componentLayers.push(currentLayer);
      const nextLayer = [];
      
      currentLayer.forEach((tableId) => {
        const currentNode = graph.get(tableId);
        if (currentNode) {
          currentNode.connections.forEach((neighborId) => {
            if (!visited.has(neighborId)) {
              visited.add(neighborId);
              nextLayer.push(neighborId);
            }
          });
        }
      });
      
      currentLayer = nextLayer;
    }
    
    layers.push(...componentLayers);
  }
  
  if (isolated.length > 0) {
    layers.push(isolated);
  }
  
  const tableMap = new Map(tables.map((t) => [t.id, t]));
  
  let currentY = baseY;
  
  layers.forEach((layer) => {
    let currentX = baseX;
    let maxHeightInRow = 0;
    
    layer.forEach((tableId) => {
      const table = tableMap.get(tableId);
      if (!table) return;
      
      const height = getTableHeight(table);
      maxHeightInRow = Math.max(maxHeightInRow, height);
      
      if (Math.abs(table.x - currentX) > 1 || Math.abs(table.y - currentY) > 1) {
        moves.push({
          tableId,
          tableName: table.name,
          oldX: table.x,
          oldY: table.y,
          newX: currentX,
          newY: currentY,
        });
        table.x = currentX;
        table.y = currentY;
      }
      
      currentX += width + GAP_X;
    });
    
    currentY += maxHeightInRow + GAP_Y;
  });
  
  return moves;
}

function resolveOverlapsLocally(tables, allTables, width = tableWidth) {
  const moves = [];
  const maxIterations = 30;
  
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let hasOverlap = false;
    
    for (let i = 0; i < tables.length; i++) {
      for (let j = 0; j < allTables.length; j++) {
        if (tables[i].id === allTables[j].id) continue;
        
        const rect1 = getTableBounds(tables[i], width);
        const rect2 = getTableBounds(allTables[j], width);
        
        if (rectsOverlap(rect1, rect2, 5)) {
          hasOverlap = true;
          
          const dx = (rect1.x + rect1.width / 2) - (rect2.x + rect2.width / 2);
          const dy = (rect1.y + rect1.height / 2) - (rect2.y + rect2.height / 2);
          
          let newX = tables[i].x;
          let newY = tables[i].y;
          
          if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx > 0) {
              newX = rect2.x + rect2.width + GAP_X;
            } else {
              newX = Math.max(0, rect2.x - rect1.width - GAP_X);
            }
          } else {
            if (dy > 0) {
              newY = rect2.y + rect2.height + GAP_Y;
            } else {
              newY = Math.max(0, rect2.y - rect1.height - GAP_Y);
            }
          }
          
          newX = Math.max(0, newX);
          newY = Math.max(0, newY);
          
          const existingMove = moves.find((m) => m.tableId === tables[i].id);
          if (existingMove) {
            existingMove.newX = newX;
            existingMove.newY = newY;
          } else {
            moves.push({
              tableId: tables[i].id,
              tableName: tables[i].name,
              oldX: tables[i].x,
              oldY: tables[i].y,
              newX,
              newY,
            });
          }
          
          tables[i].x = newX;
          tables[i].y = newY;
        }
      }
    }
    
    if (!hasOverlap) break;
  }
  
  return moves;
}

export function arrangeTables(diagram) {
  let maxHeight = -1;
  const tableWidth_2 = 200;
  const gapX = 54;
  const gapY = 40;
  diagram.tables.forEach((table, i) => {
    if (i < diagram.tables.length / 2) {
      table.x = i * tableWidth_2 + (i + 1) * gapX;
      table.y = gapY;
      const height =
        table.fields.length * tableFieldHeight +
        tableHeaderHeight +
        tableColorStripHeight;
      maxHeight = Math.max(height, maxHeight);
    } else {
      const index = diagram.tables.length - i - 1;
      table.x = index * tableWidth_2 + (index + 1) * gapX;
      table.y = maxHeight + 2 * gapY;
    }
  });
}

export function arrangeTablesSmart({
  tables,
  allTables,
  relationships,
  targetTableIds = null,
  recentTableIds = [],
  recentRelationships = [],
  mode = "auto",
  scope = "local",
  width = tableWidth,
}) {
  const tablesToArrange = [];
  const originalPositions = new Map();
  
  tables.forEach((t) => originalPositions.set(t.id, { x: t.x, y: t.y }));
  allTables.forEach((t) => {
    if (!originalPositions.has(t.id)) {
      originalPositions.set(t.id, { x: t.x, y: t.y });
    }
  });
  
  if (mode === "specified" && targetTableIds && targetTableIds.length > 0) {
    const targetIdSet = new Set(targetTableIds);
    const targetTables = tables.filter((t) => targetIdSet.has(t.id));
    
    const related = getTablesWithRelationships(targetTables, relationships, targetTableIds);
    tablesToArrange.push(...related);
  } else if (mode === "auto") {
    const affected = getRecentlyAffectedTables(
      tables,
      recentTableIds,
      recentRelationships,
      relationships
    );
    
    const overlappingIds = detectOverlappingTables(tables, width);
    const overlappingTables = tables.filter((t) => overlappingIds.has(t.id));
    
    const combinedIds = new Set([
      ...affected.map((t) => t.id),
      ...overlappingTables.map((t) => t.id),
    ]);
    
    if (scope === "full" || combinedIds.size >= tables.length * 0.7) {
      tablesToArrange.push(...tables);
    } else if (combinedIds.size > 0) {
      const combinedTables = tables.filter((t) => combinedIds.has(t.id));
      const expanded = getTablesWithRelationships(combinedTables, relationships, Array.from(combinedIds));
      tablesToArrange.push(...expanded);
    } else {
      return { moves: [], tablesToArrange: [] };
    }
  }
  
  if (tablesToArrange.length === 0) {
    return { moves: [], tablesToArrange: [] };
  }
  
  const uniqueTables = Array.from(new Set(tablesToArrange.map((t) => t.id))).map(
    (id) => tablesToArrange.find((t) => t.id === id)
  );
  
  const allMoves = [];
  
  const relationshipMoves = arrangeByRelationshipsCompact(uniqueTables, relationships, width);
  allMoves.push(...relationshipMoves);
  
  const overlapMoves = resolveOverlapsLocally(uniqueTables, allTables, width);
  
  overlapMoves.forEach((newMove) => {
    const existing = allMoves.find((m) => m.tableId === newMove.tableId);
    if (existing) {
      existing.newX = newMove.newX;
      existing.newY = newMove.newY;
    } else {
      const table = tables.find((t) => t.id === newMove.tableId);
      if (table) {
        const origPos = originalPositions.get(newMove.tableId);
        allMoves.push({
          tableId: newMove.tableId,
          tableName: table.name,
          oldX: origPos.x,
          oldY: origPos.y,
          newX: newMove.newX,
          newY: newMove.newY,
        });
      }
    }
  });
  
  const finalMoves = allMoves.filter(
    (m) => Math.abs(m.oldX - m.newX) > 1 || Math.abs(m.oldY - m.newY) > 1
  );
  
  return {
    moves: finalMoves,
    tablesToArrange: uniqueTables.map((t) => ({
      id: t.id,
      name: t.name,
    })),
  };
}

export function buildUndoRedoForArrange(moves) {
  if (moves.length === 0) return null;
  
  if (moves.length === 1) {
    const move = moves[0];
    return {
      action: Action.MOVE,
      element: ObjectType.TABLE,
      id: move.tableId,
      x: move.oldX,
      y: move.oldY,
      message: `[AI] Move table "${move.tableName}"`,
    };
  }
  
  return {
    bulk: true,
    action: Action.MOVE,
    message: `[AI] Arrange ${moves.length} table(s)`,
    elements: moves.map((move) => ({
      id: move.tableId,
      type: ObjectType.TABLE,
      undo: { x: move.oldX, y: move.oldY },
      redo: { x: move.newX, y: move.newY },
    })),
  };
}

export function formatTableNamesForDisplay(tableNames, maxShow = 3) {
  if (tableNames.length <= maxShow) {
    return tableNames.join(", ");
  }
  const shown = tableNames.slice(0, maxShow);
  const remaining = tableNames.length - maxShow;
  return `${shown.join(", ")} 等${remaining}张`;
}
