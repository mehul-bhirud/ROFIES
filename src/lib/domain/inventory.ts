export type Condition = "perfect" | "minor_damage" | "repair_required" | "not_working";
export type ConditionBalances = Record<Condition, number>;

export function resolveReturn(
  unresolvedQuantity: number,
  lines: readonly { condition: Condition; quantity: number }[]
) {
  const returned = lines.reduce((sum, line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("Return quantities must be positive integers");
    }
    return sum + line.quantity;
  }, 0);
  if (returned > unresolvedQuantity) throw new Error("Return exceeds unresolved quantity");

  return {
    returned,
    usable: lines
      .filter((line) => line.condition === "perfect" || line.condition === "minor_damage")
      .reduce((sum, line) => sum + line.quantity, 0),
    repair: lines
      .filter((line) => line.condition === "repair_required")
      .reduce((sum, line) => sum + line.quantity, 0),
    notWorking: lines
      .filter((line) => line.condition === "not_working")
      .reduce((sum, line) => sum + line.quantity, 0)
  };
}

export function applyConditionMovement(
  balances: ConditionBalances,
  from: Condition,
  to: Condition,
  quantity: number
) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be positive");
  if (balances[from] < quantity) throw new Error("Stock cannot become negative");
  return { ...balances, [from]: balances[from] - quantity, [to]: balances[to] + quantity };
}
