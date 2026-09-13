/** Extract complete recharge sentences after joining source paragraph wraps. */
export function itemRechargeMetadata(description) {
  const text = description.replace(/\s+/g, " ");
  const recharge = text.match(/[^.!?]*(?:regains?|recharge)[^.!?]*[.!?]?/i)?.[0]?.trim() || null;
  const kind = !recharge ? null
    : /short (?:or|and) long rest|short rest/i.test(recharge) ? "short-rest"
      : /long rest/i.test(recharge) ? "long-rest"
        : /daily|dawn/i.test(recharge) ? "daily" : null;
  const amount = recharge?.match(/regains?\s+(all|\d+d\d+(?:\s*\+\s*\d+)?|\d+)\s+(?:(?:of |its |the |expended )*)charges?/i)?.[1]?.replace(/\s/g, "") || null;
  return { chargeRecharge: recharge, chargeRechargeKind: kind, chargeRechargeAmount: amount };
}
