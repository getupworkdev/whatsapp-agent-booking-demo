// Stand-in for the Bokun booking + payment API. Counts calls so tests can prove
// a retried tool call never charges twice.
export class MockBokun {
  calls = 0;
  private seq = 1000;
  refunds: string[] = [];
  createBooking(input: { product: string; amountCents: number; currency: string; date: string }) {
    this.calls++;
    return { bookingId: `BK-${this.seq++}`, paymentLink: `https://pay.example/bk/${this.seq}` , ...input };
  }
  refund(bookingId: string) {
    this.refunds.push(bookingId);
    return { ok: true };
  }
}
