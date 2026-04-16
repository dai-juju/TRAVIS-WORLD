// TRAVIS Hetzner 워커 진입점.
//
// M1.1 Step 4 (현재): "hello" 출력 후 정상 종료. env·DB 연결 없음.
// M1.1 Step 5: Supabase ping 1회 추가 (./supabase.ts의 client 사용).
// M1.3: 장기 실행 + 어댑터 부팅 + WS 릴레이로 진화.
//
// 절대 crash 금지(CLAUDE.md): 모든 에러는 graceful 처리.
// Step 5에서 await supabase?.from(...) 추가 시 자연스럽게 확장되도록 async + catch 선반영.
async function main(): Promise<void> {
  console.log("hello from travis-worker");
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
