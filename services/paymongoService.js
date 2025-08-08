import axios from "axios";

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY;
const PAYMONGO_API_URL = "https://api.paymongo.com/v1";

const paymongoAxios = axios.create({
  baseURL: PAYMONGO_API_URL,
  auth: {
    username: PAYMONGO_SECRET_KEY,
    password: "",
  },
  headers: {
    "Content-Type": "application/json",
  },
});

export async function createPaymentIntent({ amount, currency, paymentMethod }) {
  return paymongoAxios.post("/payment_intents", {
    data: {
      attributes: {
        amount,
        payment_method_allowed: [paymentMethod],
        currency,
      },
    },
  });
}

export async function createPayment({ amount, currency, sourceId }) {
  return paymongoAxios.post("/payments", {
    data: {
      attributes: {
        amount,
        currency,
        source: { id: sourceId, type: "source" },
      },
    },
  });
}

export async function createSource({ amount, currency, type, redirectUrl }) {
  return paymongoAxios.post("/sources", {
    data: {
      attributes: {
        amount,
        currency,
        type, // "gcash", "maya", etc.
        redirect: {
          success: redirectUrl,
          failed: redirectUrl,
        },
      },
    },
  });
}

export { paymongoAxios };
