import crypto from "node:crypto";
import fs from "node:fs";
import { HttpError } from "./core.js";

const WECHAT_API = "https://api.weixin.qq.com";
const PAY_API = "https://api.mch.weixin.qq.com";
let accessTokenCache = null;

export function isWechatMock() {
  return (process.env.WECHAT_MODE || "mock") === "mock";
}

export function assertRealWechatConfigured() {
  const required = [
    "WECHAT_APP_ID",
    "WECHAT_APP_SECRET",
    "WECHAT_MCH_ID",
    "WECHAT_API_V3_KEY",
    "WECHAT_CERT_SERIAL",
    "WECHAT_PRIVATE_KEY_PATH",
    "WECHAT_NOTIFY_URL",
    "WECHAT_PLATFORM_CERT_PATH"
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new HttpError(503, "WECHAT_NOT_CONFIGURED", `微信参数未配置：${missing.join(", ")}`);
  }
  if (String(process.env.WECHAT_API_V3_KEY).length !== 32) {
    throw new HttpError(503, "WECHAT_CONFIG_INVALID", "微信 API v3 密钥必须为32位");
  }
}

export async function exchangeLoginCode(code) {
  assertRealWechatConfigured();
  const url = new URL(`${WECHAT_API}/sns/jscode2session`);
  url.searchParams.set("appid", process.env.WECHAT_APP_ID);
  url.searchParams.set("secret", process.env.WECHAT_APP_SECRET);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || data.errcode || !data.openid) {
    throw new HttpError(401, "WECHAT_LOGIN_FAILED", `微信登录失败：${data.errmsg || response.status}`);
  }
  return data;
}

export async function exchangePhoneCode(phoneCode) {
  assertRealWechatConfigured();
  const token = await getAccessToken();
  const response = await fetch(
    `${WECHAT_API}/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: phoneCode }),
      signal: AbortSignal.timeout(10000)
    }
  );
  const data = await response.json();
  if (!response.ok || data.errcode || !data.phone_info?.phoneNumber) {
    throw new HttpError(400, "WECHAT_PHONE_BIND_FAILED", `微信手机号授权失败：${data.errmsg || response.status}`);
  }
  return data.phone_info.phoneNumber;
}

async function getAccessToken() {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 60000) {
    return accessTokenCache.value;
  }
  const url = new URL(`${WECHAT_API}/cgi-bin/token`);
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", process.env.WECHAT_APP_ID);
  url.searchParams.set("secret", process.env.WECHAT_APP_SECRET);
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new HttpError(502, "WECHAT_TOKEN_FAILED", `获取微信 access_token 失败：${data.errmsg || response.status}`);
  }
  accessTokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000
  };
  return accessTokenCache.value;
}

export async function createMiniProgramPayment({ orderNo, amount, openid, description }) {
  assertRealWechatConfigured();
  if (!openid) {
    throw new HttpError(400, "WECHAT_OPENID_REQUIRED", "客户尚未绑定微信身份，不能发起微信支付");
  }
  const payload = {
    appid: process.env.WECHAT_APP_ID,
    mchid: process.env.WECHAT_MCH_ID,
    description: String(description || "三磊车邻汇预付款").slice(0, 127),
    out_trade_no: orderNo,
    notify_url: process.env.WECHAT_NOTIFY_URL,
    amount: {
      total: Math.round(Number(amount) * 100),
      currency: "CNY"
    },
    payer: { openid },
    attach: "SANLEI_CHELINHUI"
  };
  const response = await signedPayRequest("POST", "/v3/pay/transactions/jsapi", payload);
  if (!response.prepay_id) {
    throw new HttpError(502, "WECHAT_PREPAY_FAILED", "微信支付未返回预支付交易标识");
  }
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = crypto.randomBytes(16).toString("hex");
  const packageValue = `prepay_id=${response.prepay_id}`;
  const paySign = rsaSign(`${process.env.WECHAT_APP_ID}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`);
  return {
    prepayId: response.prepay_id,
    payParams: {
      timeStamp,
      nonceStr,
      package: packageValue,
      signType: "RSA",
      paySign
    }
  };
}

async function signedPayRequest(method, path, payload) {
  const body = payload ? JSON.stringify(payload) : "";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString("hex");
  const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = rsaSign(message);
  const authorization = [
    "WECHATPAY2-SHA256-RSA2048",
    `mchid="${process.env.WECHAT_MCH_ID}"`,
    `nonce_str="${nonce}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${process.env.WECHAT_CERT_SERIAL}"`,
    `signature="${signature}"`
  ].join(",");
  let response;
  try {
    response = await fetch(`${PAY_API}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: authorization,
        "User-Agent": "Sanlei-Chelinhui/0.1"
      },
      body: method === "GET" ? undefined : body,
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    throw new HttpError(502, "WECHAT_PAY_NETWORK_ERROR", `微信支付网络请求失败：${error.message}`);
  }
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    throw new HttpError(
      502,
      "WECHAT_PAY_FAILED",
      `微信支付下单失败：${data.message || data.code || response.status}`
    );
  }
  return data;
}

function rsaSign(message) {
  const privateKey = fs.readFileSync(process.env.WECHAT_PRIVATE_KEY_PATH, "utf8");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(privateKey, "base64");
}

export function verifyAndDecryptNotification(headers, rawBody) {
  assertRealWechatConfigured();
  const timestamp = headers["wechatpay-timestamp"];
  const nonce = headers["wechatpay-nonce"];
  const signature = headers["wechatpay-signature"];
  if (!timestamp || !nonce || !signature) {
    throw new HttpError(400, "INVALID_WECHAT_NOTIFY", "微信支付通知缺少签名头");
  }
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    throw new HttpError(400, "EXPIRED_WECHAT_NOTIFY", "微信支付通知已过期");
  }
  const platformCert = fs.readFileSync(process.env.WECHAT_PLATFORM_CERT_PATH, "utf8");
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${timestamp}\n${nonce}\n${rawBody}\n`);
  verifier.end();
  if (!verifier.verify(platformCert, signature, "base64")) {
    throw new HttpError(401, "INVALID_WECHAT_SIGNATURE", "微信支付通知签名校验失败");
  }
  const body = JSON.parse(rawBody);
  const resource = body.resource;
  if (!resource?.ciphertext || !resource?.nonce) {
    throw new HttpError(400, "INVALID_WECHAT_NOTIFY", "微信支付通知缺少加密报文");
  }
  const key = Buffer.from(process.env.WECHAT_API_V3_KEY, "utf8");
  const ciphertext = Buffer.from(resource.ciphertext, "base64");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(resource.nonce, "utf8"));
  decipher.setAuthTag(authTag);
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  }
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return { body, transaction: JSON.parse(plaintext) };
}
