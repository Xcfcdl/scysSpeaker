// r2-crawler-extension/utils/r2.js

// 浏览器端 S3 V4 签名工具
async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmac(key, msg) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg));
  return new Uint8Array(sig);
}
async function getSignatureKey(key, dateStamp, region, service) {
  let kDate = await hmac(new TextEncoder().encode('AWS4' + key), dateStamp);
  let kRegion = await hmac(kDate, region);
  let kService = await hmac(kRegion, service);
  let kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
}

// 内置R2配置参数（仅个人使用）
const R2_CONFIG = {
  endpoint: 'https://ec9b65b766f81d8884511278e245a1cc.r2.cloudflarestorage.com',
  accessKey: '00c7542f1d808ca7621870d99986af5e',
  secretKey: '798bf3842c07acd3cca59c9daba3a5a4254255a6801d8ebdaa72c4d351e2b7e2',
  bucket: 'scys'
};

export async function uploadToR2(data) {
  const endpoint = R2_CONFIG.endpoint.replace(/\/$/, '');
  const accessKey = R2_CONFIG.accessKey;
  const secretKey = R2_CONFIG.secretKey;
  const bucket = R2_CONFIG.bucket;
  const region = 'auto'; // R2推荐用'auto'
  const service = 's3';

  // 生成文件名
  const filename = `posts/${Date.now()}.json`;
  const url = `${endpoint}/${bucket}/${filename}`;
  const method = 'PUT';
  const contentType = 'application/json';
  const body = JSON.stringify(data);

  // 时间戳
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20240708T123456Z
  const dateStamp = amzDate.slice(0, 8);

  // Canonical Request
  const canonicalUri = `/${bucket}/${filename}`;
  const canonicalQuerystring = '';
  const host = endpoint.replace(/^https?:\/\//, '');
  const payloadHash = await sha256(body);
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest =
    `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  // String to Sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign =
    `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;

  // 签名
  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signatureBytes = await hmac(signingKey, stringToSign);
  const signature = Array.from(signatureBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // Authorization header
  const authorizationHeader =
    `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // fetch 直传
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Authorization': authorizationHeader
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2上传失败: ${res.status} ${res.statusText}\n${text}`);
  }
}

export async function listR2PostIds() {
  const endpoint = R2_CONFIG.endpoint.replace(/\/$/, '');
  const accessKey = R2_CONFIG.accessKey;
  const secretKey = R2_CONFIG.secretKey;
  const bucket = R2_CONFIG.bucket;
  const region = 'auto';
  const service = 's3';
  const prefix = 'posts/';
  let continuationToken = '';
  let ids = [];
  while (true) {
    let query = `list-type=2&prefix=${encodeURIComponent(prefix)}`;
    if (continuationToken) query += `&continuation-token=${encodeURIComponent(continuationToken)}`;
    const url = `${endpoint}/${bucket}?${query}`;
    // S3 V4签名
    const method = 'GET';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = `/${bucket}`;
    const canonicalQuerystring = query;
    const host = endpoint.replace(/^https?:\/\//, '');
    const canonicalHeaders =
      `host:${host}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';
    const payloadHash = await sha256('');
    const canonicalRequest =
      `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign =
      `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
    const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
    const signatureBytes = await hmac(signingKey, stringToSign);
    const signature = Array.from(signatureBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const authorizationHeader =
      `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const res = await fetch(url, {
      method,
      headers: {
        'x-amz-date': amzDate,
        'Authorization': authorizationHeader
      }
    });
    if (!res.ok) throw new Error('R2 ListObjectsV2 失败');
    const xml = await res.text();
    // 解析XML，提取 <Key>posts/xxx.json</Key>
    const keys = Array.from(xml.matchAll(/<Key>posts\/([^.]+)\.json<\/Key>/g)).map(m => m[1]);
    ids.push(...keys);
    // 检查是否有 <IsTruncated>true</IsTruncated>
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) break;
    // 取 <NextContinuationToken>
    const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    if (tokenMatch) continuationToken = tokenMatch[1];
    else break;
  }
  return ids;
} 