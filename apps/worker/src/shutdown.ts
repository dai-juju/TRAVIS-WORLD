// graceful shutdown 실행기 (M3-step4 Step 0, [10-110] 풀 견고화).
//
// 배경 (2026-07-14 실사고 — WS 공백 ~7분 "반쪽 좀비"):
//   기존 shutdown 은 main() 클로저 안에서 Promise.all + 무조건 exit(0) 구조라
//   3가지 구조 결함이 있었다.
//   (a) relay stop 하나가 reject 하면 catch 로 점프해 coalescer 최종 flush 가
//       통째로 건너뛰어짐 → 잔여 버퍼(markPrice 등) DB 미반영 유실
//   (b) 어느 stop() 이 hang 하면 Promise.all 이 영영 resolve 안 돼 프로세스가
//       "WS 는 닫혔는데 종료는 안 된" 반쪽 좀비로 잔류 — systemd 재시작 불발
//   (c) 실패해도 exit 0 이라 systemd/모니터링이 비정상 종료를 감지 못 함
//
// 본 모듈의 방어 3종 (결함과 1:1 대응):
//   (a) stops 는 Promise.allSettled 로 독립 정지 — 일부 실패해도 flushes 는
//       반드시 실행. flushes 도 각각 try/catch — 앞 flush 실패가 뒤를 막지 않음.
//   (b) watchdog 타이머 — watchdogMs 안에 안 끝나면 강제 exit(1).
//   (c) 하나라도 실패하면 exit(1), 전부 성공 시에만 exit(0).
//
// main() 클로저에서 추출한 이유 = 단위 테스트 가능성. process.exit / 실제 relay
// 의존을 주입으로 끊어 결함 3종을 회귀 테스트로 핀한다 (기존 워커 shutdown
// 테스트 부재 — 이 파일의 테스트가 첫 회귀 그물).

/** 이름 붙은 정지 대상 — 이름은 실패 로그에서 어느 컴포넌트인지 특정하는 용도. */
export interface NamedStoppable {
  name: string;
  /** sync(void) / async(Promise) 모두 허용 — streamCoalescer.stop() 은 sync. */
  stop: () => unknown;
}

export interface GracefulShutdownOptions {
  /** 로그용 트리거 출처 (예: "SIGTERM", "SELF_RESTART"). */
  signal: string;
  /** 병렬 정지 대상 (relay/poller 등). 서로 독립 — 하나 실패해도 나머지 진행. */
  stops: readonly NamedStoppable[];
  /**
   * stops 완료 후 순차 실행하는 최종 flush 대상.
   * 배열 선언 순서 = 의존 순서 (streamCoalescer 최종 flush 가 enqueue 한 잔여
   * markPrice 를 markPriceWriteCoalescer 가 DB 반영 — [10-77] 계약).
   */
  flushes: readonly NamedStoppable[];
  /** 이 시간 안에 종료가 안 끝나면 강제 exit(1). */
  watchdogMs: number;
  /**
   * 전부 성공했을 때의 exit code (기본 0). 자기 재시작(SELF_RESTART)은 여기에
   * 전용 코드(64)를 넣어 systemd 재기동을 보장한다 — 실패 시에는 항상 1
   * (부분 실패를 성공 코드로 위장하지 않는다 — 어차피 비 0 이라 재기동은 동일).
   */
  exitCodeOnSuccess?: number;
  /** 실제 종료 액션 — 프로덕션은 process.exit, 테스트는 spy 주입. */
  exit: (code: number) => void;
  /** 로그 주입 (기본 console) — 테스트 소음 억제용. */
  logger?: Pick<Console, "log" | "error">;
}

/**
 * graceful shutdown 을 실행하고 exit code(0=전부 성공 / 1=부분 실패)로 종료한다.
 * hang 시에는 watchdog 이 exit(1) 을 대신 호출한다 (이 경우 반환 Promise 는
 * 영영 resolve 되지 않을 수 있음 — 프로덕션에선 process.exit 가 프로세스를 끝냄).
 */
export async function runGracefulShutdown(opts: GracefulShutdownOptions): Promise<number> {
  const logger = opts.logger ?? console;

  // exit 은 단 한 번만 — watchdog 발화 후 늦게 완료된 정상 경로가 exit 을
  // 재호출해 코드가 덮이는 경합 차단. committedCode = 실제로 exit 에 전달된
  // 코드 (반환값 정합 — 늦은 완료 경로가 자기 코드를 반환하지 않게, reviewer S2).
  let committedCode: number | null = null;
  const exitOnce = (code: number): void => {
    if (committedCode !== null) return;
    committedCode = code;
    opts.exit(code);
  };

  // hang 진단용 추적 — watchdog 발화 시 "무엇이" 매달렸는지 이름으로 특정
  //   (2026-07-21 라이브에서 범인 특정에 코드 재조사가 필요했던 비용 제거).
  const pendingStops = new Set(opts.stops.map((s) => s.name));
  let currentFlush: string | null = null;

  // (b) watchdog — hang 하면 반쪽 좀비 대신 명시적 실패 종료.
  //     unref: 정상 완료 시 이 타이머가 프로세스 수명을 붙들지 않게 함
  //     (Node 환경 아닌 테스트 러너 호환 위해 optional 호출).
  const watchdog = setTimeout(() => {
    const culprit =
      pendingStops.size > 0
        ? `미완료 stop: ${[...pendingStops].join(", ")}`
        : `flush 단계: ${currentFlush ?? "(진입 전/완료 후)"}`;
    logger.error(
      `[worker] shutdown watchdog ${opts.watchdogMs}ms 초과 — 강제 종료 (exit 1). ${culprit}`,
    );
    exitOnce(1);
  }, opts.watchdogMs);
  watchdog.unref?.();

  let anyFailure = false;

  // (a)-1 병렬 정지 — allSettled 라 일부 reject 가 나머지·flush 를 막지 않음.
  const results = await Promise.allSettled(
    opts.stops.map(async (s) => {
      try {
        await Promise.resolve(s.stop());
      } finally {
        pendingStops.delete(s.name); // 실패든 성공이든 "매달림"은 해소된 것
      }
    }),
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      anyFailure = true;
      logger.error(`[worker] shutdown: ${opts.stops[i]?.name} stop 실패:`, r.reason);
    }
  });

  // (a)-2 최종 flush — 순차 + 각각 독립 try/catch (앞 실패가 뒤를 못 막음).
  for (const f of opts.flushes) {
    currentFlush = f.name;
    try {
      await Promise.resolve(f.stop());
    } catch (e) {
      anyFailure = true;
      logger.error(`[worker] shutdown: ${f.name} flush 실패:`, e);
    }
  }
  currentFlush = null;

  clearTimeout(watchdog);

  // (c) exit code 분리 — systemd/모니터링이 비정상 종료를 감지 가능.
  const code = anyFailure ? 1 : (opts.exitCodeOnSuccess ?? 0);
  logger.log(
    code === 0
      ? `[worker] 종료 완료 (${opts.signal})`
      : `[worker] 종료 완료 — 일부 컴포넌트 실패 (${opts.signal}, exit 1)`,
  );
  exitOnce(code);
  // watchdog 이 먼저 발화했으면 그 코드(1)가 진실 — 늦은 완료의 code 가 아님.
  return committedCode ?? code;
}
