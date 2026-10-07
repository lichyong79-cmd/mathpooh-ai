export type PaperBooking = {
  id?: unknown; student_id?: unknown; cycle_student_id?: unknown;
  exam_id?: unknown; formal_sequence?: unknown; scope_code?: unknown; status?: unknown;
};
export type PaperMembership = {
  id?: unknown; student_id?: unknown; formal_sequence?: unknown; scope_code?: unknown;
};

/** The student's explicit booking is authoritative; a catalogue number is not an attendance count. */
export function exactPaperBooking(bookings: PaperBooking[], membership: PaperMembership) {
  if (!membership.id) return undefined;
  return bookings.find(r => r.status === 'assigned' && Boolean(r.exam_id) &&
    String(r.cycle_student_id ?? '') === String(membership.id) &&
    (membership.student_id == null || r.student_id == null || String(r.student_id) === String(membership.student_id)) &&
    String(r.scope_code ?? 'FULL') === String(membership.scope_code ?? 'FULL'));
}

export function bookedSequence(bookings: PaperBooking[], membership: PaperMembership, fallback: number) {
  const value = Number(exactPaperBooking(bookings, membership)?.formal_sequence);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Default selection skips papers already attempted by this student, without advancing attendance. */
export function defaultPaper(catalog: any[], attempts: any[], sequence: number, scope: string) {
  const used = new Set(attempts.filter(a => ['in_progress','submitted'].includes(a.status)).map(a => String(a.exam_id)));
  return catalog.filter(c => c.scope_code === scope && Number(c.formal_sequence) >= sequence && !used.has(String(c.exam_id)))
    .sort((a,b) => Number(a.formal_sequence)-Number(b.formal_sequence))[0];
}
