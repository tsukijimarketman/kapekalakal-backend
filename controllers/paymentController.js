import { createPaymentIntent } from "../services/paymongoService.js";
import { createSource } from "../services/paymongoService.js";

//POST /api/payment/create

export async function createPaymentIntentController(req, res) {
  try {
    const { amount, currency, paymentMethod } = req.body;
    const response = await createPaymentIntent({
      amount,
      currency,
      paymentMethod,
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message,
    });
  }
}

export async function createSourceController(req, res) {
  try {
    const { amount, currency, type, redirectUrl } = req.body;
    const response = await createSource({
      amount,
      currency,
      type,
      redirectUrl,
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message,
    });
  }
}
