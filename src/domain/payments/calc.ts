export type CardMode = 'DEBITO' | 'CREDITO_VISTA' | 'CREDITO_PARC'

export type CardRule = {
  brand: string
  mode: CardMode
  max_installments: number
  no_interest_up_to: number
  min_installment_value: number
  mdr_pct: number
  fee_fixed: number
  customer_interest_monthly_pct: number
  merchant_interest_monthly_pct: number
}

export type CardCalcInput = {
  price: number
  installments: number
  rule: CardRule
  whoPaysInterest: 'CLIENT' | 'MERCHANT'
}

export type CardCalcOutput = {
  brand: string
  mode: CardMode
  installments: number
  installmentValue: number
  gross: number
  mdrPct: number
  feeFixed: number
  feeTotal: number
  interestMonthlyPct: number
  interestTotal: number
  net: number
}

function round2(n: number) { return Math.round(n * 100) / 100 }

export function calcCard(input: CardCalcInput): CardCalcOutput {
  const { price, installments, rule, whoPaysInterest } = input
  if (installments < 1 || installments > rule.max_installments) throw new Error('Parcelas fora das regras')

  let gross = price
  let installmentValue = round2(price / installments)
  let interestMonthly = 0
  let interestTotal = 0

  const isNoInterestForClient = installments <= rule.no_interest_up_to

  if (rule.mode === 'CREDITO_PARC' && installments > 1 && !isNoInterestForClient) {
    if (whoPaysInterest === 'CLIENT') {
      // Tabela Price
      interestMonthly = (rule.customer_interest_monthly_pct || 0) / 100
      const i = interestMonthly, n = installments
      const A = price * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1)
      installmentValue = round2(A)
      gross = round2(A * n)
      interestTotal = round2(gross - price)
    } else {
      // Loja absorve
      interestMonthly = (rule.merchant_interest_monthly_pct || 0) / 100
      const approxCost = price * interestMonthly * installments / 2
      interestTotal = round2(approxCost)
    }
  }

  if (installments > 1 && (gross / installments) < rule.min_installment_value) {
    throw new Error('Parcela abaixo do mínimo permitido')
  }

  const feeMdr = round2(gross * (rule.mdr_pct / 100))
  const feeTotal = round2(feeMdr + (rule.fee_fixed || 0))
  const net = round2(gross - feeTotal - interestTotal)

  return {
    brand: rule.brand,
    mode: rule.mode,
    installments,
    installmentValue,
    gross: round2(gross),
    mdrPct: rule.mdr_pct,
    feeFixed: rule.fee_fixed || 0,
    feeTotal,
    interestMonthlyPct: round2(interestMonthly * 100),
    interestTotal,
    net
  }
}
