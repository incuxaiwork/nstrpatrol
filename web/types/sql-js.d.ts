declare module "sql.js" {
  export interface SqlJsDatabase {
    exec(
      sql: string,
      params?: unknown[]
    ): { columns: string[]; values: unknown[][] }[];
  }
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | null) => SqlJsDatabase;
  }
  export default function initSqlJs(options?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}
