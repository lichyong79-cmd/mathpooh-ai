import { normalizeSosScope, isSosCyclePassed } from './sos-program-flow';

export const BOOKING_CLOCK_COLUMNS = 'clock_initialized,clock_open_at,clock_close_at,clock_paused_at,clock_remaining_seconds';
export function bookingExam(exam: any, booking: any) {
  if (!booking?.cycle_student_id && !booking?.clock_initialized) return exam;
  return {...exam,
    open_at: booking.clock_initialized ? booking.clock_open_at : booking.scheduled_at,
    close_at: booking.clock_initialized ? booking.clock_close_at : null,
    paused_at: booking.clock_initialized ? booking.clock_paused_at : null,
    paused_remaining_seconds: booking.clock_initialized ? booking.clock_remaining_seconds : null,
  };
}

/** Completed attempts, never reservations, advance an exam series. */
export function nextExamSequence(attempts: any[], scope: unknown) {
  return 1 + attempts.filter(a => a.status === 'submitted' && !a.is_practice &&
    normalizeSosScope(a.scope_code) === normalizeSosScope(scope))
    .reduce((n, a) => Math.max(n, Number(a.formal_sequence) || 0), 0);
}

/** A series change does not bypass unfinished learning from an earlier exam. */
export function priorLearningPassed(memberships: any[], sessions: any[], current: any) {
  if (current.sos_gate_status === 'OVERRIDE') return true;
  return memberships.filter(m => m.id !== current.id && !m.is_practice &&
    m.booking_status === 'COMPLETED').every(m =>
      isSosCyclePassed(sessions, String(m.cycle_id)));
}
