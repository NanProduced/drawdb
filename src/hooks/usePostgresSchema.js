import { useContext } from "react";
import { PostgresSchemaContext } from "../context/PostgresSchemaContext";

export default function usePostgresSchema() {
  return useContext(PostgresSchemaContext);
}
