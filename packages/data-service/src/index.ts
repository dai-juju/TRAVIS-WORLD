// 재-export 규칙 (verbatimModuleSyntax: true 하에서 강제):
//   - 타입(interface/type)만 내보내면 `export type { ... }`
//   - 값(class/const/function)을 내보내면 `export { ... }`
//   - 둘을 혼용하면 TS1205가 apps/web·apps/worker 빌드에서 터진다.
// M1.3에서 query* 함수나 유틸 클래스가 추가되면 value export 라인에 이어붙인다.
export type { IDataService } from "./IDataService";
export { SupabaseDataService } from "./SupabaseDataService";
