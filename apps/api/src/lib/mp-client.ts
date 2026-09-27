import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createMPPreference(accessToken: string, body: any): Promise<any> {
  const client = new MercadoPagoConfig({ accessToken })
  const preference = new Preference(client)
  return preference.create({ body })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMPPayment(accessToken: string, id: string): Promise<any> {
  const client = new MercadoPagoConfig({ accessToken })
  const payment = new Payment(client)
  return payment.get({ id })
}
